/* ============================================================
   IQPREC — routes/billing.js
   The webhook handler (webhookHandler) is exported separately and
   mounted in index.js BEFORE express.json with express.raw, because
   Stripe signature verification needs the exact raw body.
   ============================================================ */

import { Router } from 'express';
import { z } from 'zod';

import { env } from '../config/env.js';
import { stripe, hasStripe } from '../lib/stripe.js';
import { hasDb } from '../db/client.js';
import { queryOne, queryMany } from '../db/query.js';
import { validateBody } from '../middleware/security/validate-body.js';
import { verifyToken } from '../middleware/auth/verify-token.js';
import * as billing from '../services/billing.service.js';

/* ============================================================
   WEBHOOK — POST /api/v1/billing/webhook  (raw body, no auth)
   ============================================================ */
export async function webhookHandler(req, res) {
  if (!hasStripe()) {
    return res.status(503).json({ success: false, error: 'BILLING_4000', message: 'Billing not configured.' });
  }

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[billing] webhook signature verification failed:', err?.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        const userId = s.metadata?.userId;
        const isTrial = s.metadata?.trial === 'true';

        if (isTrial && userId && s.subscription) {
          // Card collected for trial — set user to trialing, do NOT charge yet.
          const sub = await stripe.subscriptions.retrieve(s.subscription);
          const trialEndsAt = sub.trial_end
            ? new Date(sub.trial_end * 1000).toISOString()
            : null;
          await queryOne(
            `UPDATE users
               SET subscription_status = 'trialing',
                   stripe_subscription_id = $1,
                   trial_ends_at = $2
             WHERE id = $3`,
            [s.subscription, trialEndsAt, userId]
          );
        } else {
          // Regular paid checkout (monthly or season).
          const isSub = s.mode === 'subscription';
          const plan = s.metadata?.plan || (isSub ? 'monthly' : 'season');
          const billingCycle = isSub ? 'monthly' : 'season';
          const amount = (s.amount_total ?? 0) / 100;
          const subId = isSub ? s.subscription : null;
          if (userId) {
            await billing.activatePlan(userId, plan, billingCycle, subId, event.id, amount);
          }
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const inv = event.data.object;
        if (inv.billing_reason && inv.billing_reason !== 'subscription_create') {
          const subId = inv.subscription;
          const amount = (inv.amount_paid ?? 0) / 100;
          let userId = inv.metadata?.userId || null;
          if (!userId && subId && hasDb()) {
            const row = await queryOne(
              'SELECT id FROM users WHERE stripe_subscription_id = $1',
              [subId]
            );
            userId = row?.id || null;
          }
          if (userId) {
            await billing.activatePlan(userId, 'monthly', 'monthly', subId, event.id, amount);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        await billing.deactivateSubscription(event.data.object.id);
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error(`[billing] handler error for ${event.type}:`, err?.message);
    return res.status(500).json({ received: false });
  }

  return res.json({ received: true });
}

/* ============================================================
   AUTHENTICATED ROUTES — /api/v1/billing/*
   ============================================================ */
const router = Router();

const checkoutSchema = z.object({
  plan: z.enum(['monthly', 'season']).optional(),
  priceId: z.string().optional(),
  couponCode: z.string().trim().max(64).optional(),
});

function priceForPlan(plan) {
  if (plan === 'monthly') return env.STRIPE_PRICE_MONTHLY;
  if (plan === 'season') return env.STRIPE_PRICE_SEASON;
  return null;
}

router.post('/start-trial', verifyToken, async (req, res, next) => {
  try {
    if (!hasDb()) {
      return res.status(503).json({ success: false, error: 'DB_UNAVAILABLE', message: 'Unavailable.' });
    }
    const user = await queryOne(
      'SELECT email, subscription_status FROM users WHERE id = $1',
      [req.user.userId]
    );
    const status = user?.subscription_status;
    if (status === 'trialing' || status === 'active') {
      return res.status(400).json({ success: false, error: 'BILLING_4010', message: 'Already on an active plan.' });
    }
    const result = await billing.createTrialCheckoutSession(req.user.userId, req.user.email || user.email);
    return res.json({ success: true, data: result, error: null, message: null });
  } catch (err) {
    next(err);
  }
});

router.post('/checkout', verifyToken, validateBody(checkoutSchema), async (req, res, next) => {
  try {
    const { plan, priceId: bodyPrice, couponCode } = req.body;
    const priceId = bodyPrice || priceForPlan(plan);
    if (!priceId) {
      return res.status(400).json({ success: false, data: null, error: 'BILLING_4001', message: 'A valid plan or price ID is required.' });
    }
    const result = await billing.createCheckoutSession(
      req.user.userId,
      req.user.email,
      priceId,
      couponCode
    );
    return res.json({ success: true, data: result, error: null, message: null });
  } catch (err) {
    next(err);
  }
});

router.get('/status', verifyToken, async (req, res, next) => {
  try {
    if (!hasDb()) {
      return res.status(503).json({ success: false, data: null, error: 'DB_UNAVAILABLE', message: 'Billing status unavailable.' });
    }
    const user = await queryOne(
      `SELECT subscription_status, plan, trial_ends_at, plan_expires_at,
              stripe_customer_id, stripe_subscription_id
       FROM users WHERE id = $1`,
      [req.user.userId]
    );

    if (!user) {
      return res.status(404).json({ success: false, data: null, error: 'AUTH_1009', message: 'Account not found.' });
    }

    const receipts = await queryMany(
      `SELECT receipt_number, amount, currency, plan, billing_cycle, paid_at
       FROM receipts WHERE user_id = $1 ORDER BY paid_at DESC LIMIT 24`,
      [req.user.userId]
    );

    let nextBillingDate = null;
    if (
      hasStripe() &&
      user.subscription_status === 'active' &&
      user.plan === 'monthly' &&
      user.stripe_subscription_id
    ) {
      try {
        const sub = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
        if (sub?.current_period_end) {
          nextBillingDate = new Date(sub.current_period_end * 1000).toISOString();
        }
      } catch {
        /* non-fatal */
      }
    }

    return res.json({
      success: true,
      data: {
        status: user.subscription_status,
        plan: user.plan,
        trialEndsAt: user.trial_ends_at,
        planExpiresAt: user.plan_expires_at,
        nextBillingDate,
        hasCustomer: Boolean(user.stripe_customer_id),
        canManage: Boolean(user.stripe_subscription_id),
        receipts: receipts || [],
      },
      error: null,
      message: null,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/portal', verifyToken, async (req, res, next) => {
  try {
    if (!hasDb()) {
      return res.status(503).json({ success: false, data: null, error: 'DB_UNAVAILABLE', message: 'Unavailable.' });
    }
    const user = await queryOne(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [req.user.userId]
    );
    const result = await billing.getPortalSession(user?.stripe_customer_id);
    return res.json({ success: true, data: result, error: null, message: null });
  } catch (err) {
    next(err);
  }
});

router.post('/cancel', verifyToken, async (req, res, next) => {
  try {
    if (!hasDb()) {
      return res.status(503).json({ success: false, data: null, error: 'DB_UNAVAILABLE', message: 'Unavailable.' });
    }
    const user = await queryOne(
      'SELECT stripe_subscription_id FROM users WHERE id = $1',
      [req.user.userId]
    );
    await billing.cancelSubscription(user?.stripe_subscription_id);
    return res.json({
      success: true,
      data: { cancelAtPeriodEnd: true },
      error: null,
      message: 'Your subscription will end at the close of the current period.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
