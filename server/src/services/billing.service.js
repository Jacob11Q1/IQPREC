/* ============================================================
   IQPREC — services/billing.service.js
   Stripe billing for IQPREC's single plan, in TWO distinct modes:
     • Monthly  $15  → mode 'subscription' (recurring)
     • Season   $110 → mode 'payment'      (one-time, expires May 31)
   ============================================================ */

import { stripe, hasStripe } from '../lib/stripe.js';
import { env } from '../config/env.js';
import { hasDb } from '../db/client.js';
import { queryOne, execute } from '../db/query.js';
import { sendReceiptEmail } from './receipt.service.js';
import { updateMilestoneTracker } from './referral.service.js';

function requireStripe() {
  if (!hasStripe()) {
    throw Object.assign(new Error('Billing is not configured.'), {
      code: 'BILLING_4000',
      status: 503,
    });
  }
  if (!hasDb()) {
    throw Object.assign(new Error('Database not configured.'), {
      code: 'DB_UNAVAILABLE',
      status: 503,
    });
  }
}

const FRONTEND = () => env.FRONTEND_URL || 'https://iqprec.com';

function resolvePlan(priceId) {
  if (priceId && priceId === env.STRIPE_PRICE_MONTHLY) {
    return { mode: 'subscription', plan: 'monthly' };
  }
  if (priceId && priceId === env.STRIPE_PRICE_SEASON) {
    return { mode: 'payment', plan: 'season' };
  }
  throw Object.assign(new Error('Invalid price ID'), {
    code: 'BILLING_4001',
    status: 400,
  });
}

/* ------------------------------------------------------------
   Checkout session
   ------------------------------------------------------------ */
export async function createCheckoutSession(userId, email, priceId, couponCode) {
  requireStripe();
  const { mode, plan } = resolvePlan(priceId);

  const userRow = await queryOne(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [userId]
  );

  let customerId = userRow?.stripe_customer_id || null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { userId: String(userId) },
    });
    customerId = customer.id;
    await execute(
      'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
      [customerId, userId]
    );
  }

  const params = {
    customer: customerId,
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId: String(userId), plan },
    success_url: `${FRONTEND()}/billing?success=true`,
    cancel_url: `${FRONTEND()}/billing?cancelled=true`,
  };

  if (mode === 'subscription') {
    params.subscription_data = { metadata: { userId: String(userId) } };
  }
  if (couponCode) {
    params.discounts = [{ coupon: couponCode }];
  }

  const session = await stripe.checkout.sessions.create(params);
  return { url: session.url };
}

/* ------------------------------------------------------------
   Trial checkout — card required upfront, auto-charges after 7 days.
   ------------------------------------------------------------ */
export async function createTrialCheckoutSession(userId, email) {
  requireStripe();

  const userRow = await queryOne('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
  let customerId = userRow?.stripe_customer_id || null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { userId: String(userId) },
    });
    customerId = customer.id;
    await execute('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId]);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: env.STRIPE_PRICE_MONTHLY, quantity: 1 }],
    subscription_data: {
      trial_period_days: 7,
      metadata: { userId: String(userId) },
    },
    payment_method_collection: 'always',
    metadata: { userId: String(userId), plan: 'monthly', trial: 'true' },
    success_url: `${FRONTEND()}/billing?trial=started`,
    cancel_url: `${FRONTEND()}/start-trial?cancelled=true`,
  });

  return { url: session.url };
}

/* ------------------------------------------------------------
   Season expiry helper — next May 31 @ 00:00 UTC.
   ------------------------------------------------------------ */
export function nextMay31() {
  const now = new Date();
  const month = now.getUTCMonth();
  const year = month > 4 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return new Date(Date.UTC(year, 4, 31, 0, 0, 0));
}

/* ------------------------------------------------------------
   Activate a paid plan (called by the webhook). Idempotent by event id.
   ------------------------------------------------------------ */
export async function activatePlan(
  userId,
  plan,
  billingCycle,
  stripeSubscriptionId,
  stripeEventId,
  amountPaid
) {
  if (!hasDb()) {
    console.warn('[billing] DB not configured — cannot activate plan.');
    return;
  }

  if (stripeEventId) {
    const seen = await queryOne(
      'SELECT id FROM subscriptions WHERE stripe_event_id = $1',
      [stripeEventId]
    );
    if (seen) {
      console.log(`[billing] event ${stripeEventId} already processed — skipping.`);
      return;
    }
  }

  const periodEnd = plan === 'season' ? nextMay31() : null;

  // Build dynamic UPDATE (only set columns that have values).
  const setClauses = ['subscription_status = $1', 'plan = $2'];
  const vals = ['active', plan];
  if (periodEnd) {
    setClauses.push(`plan_expires_at = $${vals.length + 1}`);
    vals.push(periodEnd.toISOString());
  }
  if (stripeSubscriptionId) {
    setClauses.push(`stripe_subscription_id = $${vals.length + 1}`);
    vals.push(stripeSubscriptionId);
  }
  vals.push(userId);
  await execute(
    `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${vals.length}`,
    vals
  );

  await execute(
    `INSERT INTO subscriptions
       (user_id, stripe_subscription_id, stripe_event_id, plan, billing_cycle,
        status, amount_paid, currency, period_start, period_end, payment_provider)
     VALUES ($1, $2, $3, $4, $5, 'active', $6, 'usd', NOW(), $7, 'stripe')`,
    [
      userId,
      stripeSubscriptionId || null,
      stripeEventId || null,
      plan,
      billingCycle,
      amountPaid,
      periodEnd ? periodEnd.toISOString() : null,
    ]
  );

  const user = await queryOne(
    'SELECT email, full_name, language FROM users WHERE id = $1',
    [userId]
  );

  if (user?.email) {
    await sendReceiptEmail({
      userId,
      email: user.email,
      fullName: user.full_name,
      language: user.language || 'ar',
      plan,
      billingCycle,
      amount: amountPaid,
      currency: 'usd',
      periodEnd,
    });
  }

  try {
    await updateMilestoneTracker();
  } catch (err) {
    console.error('[billing] milestone update failed:', err?.message);
  }

  console.log(`[billing] activated plan="${plan}" for user=${userId}`);
}

/* ------------------------------------------------------------
   Mark a subscription as ended (webhook: subscription deleted).
   ------------------------------------------------------------ */
export async function deactivateSubscription(stripeSubscriptionId) {
  if (!hasDb() || !stripeSubscriptionId) return;
  await execute(
    `UPDATE users SET subscription_status = 'expired' WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId]
  );
  await execute(
    `UPDATE subscriptions SET status = 'cancelled' WHERE stripe_subscription_id = $1`,
    [stripeSubscriptionId]
  );
  console.log(`[billing] subscription ${stripeSubscriptionId} deactivated.`);
}

/* ------------------------------------------------------------
   Customer portal + cancel
   ------------------------------------------------------------ */
export async function getPortalSession(stripeCustomerId) {
  requireStripe();
  if (!stripeCustomerId) {
    throw Object.assign(new Error('No Stripe customer on file.'), {
      code: 'BILLING_4002',
      status: 400,
    });
  }
  const portalSession = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${FRONTEND()}/billing`,
  });
  return { url: portalSession.url };
}

export async function cancelSubscription(stripeSubscriptionId) {
  requireStripe();
  if (!stripeSubscriptionId) {
    throw Object.assign(new Error('No active subscription to cancel.'), {
      code: 'BILLING_4003',
      status: 400,
    });
  }
  return stripe.subscriptions.update(stripeSubscriptionId, {
    cancel_at_period_end: true,
  });
}

export default {
  createCheckoutSession,
  activatePlan,
  deactivateSubscription,
  getPortalSession,
  cancelSubscription,
  nextMay31,
};
