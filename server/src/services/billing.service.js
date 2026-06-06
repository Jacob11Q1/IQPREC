/* ============================================================
   IQPREC — services/billing.service.js
   Stripe billing for IQPREC's single plan, in TWO distinct modes:
     • Monthly  $15  → mode 'subscription' (recurring)
     • Season   $110 → mode 'payment'      (one-time, expires May 31)
   Mixing these up grants permanent access or revokes it early, so the
   mode is derived strictly from the price ID and the season expiry is
   computed explicitly.
   ============================================================ */

import { stripe, hasStripe } from '../lib/stripe.js';
import { env } from '../config/env.js';
import { supabase, hasDb } from '../db/client.js';
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

/** Map a price ID to its Stripe checkout mode + our plan label. */
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

  // Reuse or create the Stripe customer.
  const { data: user } = await supabase
    .from('users')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  let customerId = user?.stripe_customer_id || null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { userId: String(userId) },
    });
    customerId = customer.id;
    await supabase
      .from('users')
      .update({ stripe_customer_id: customerId })
      .eq('id', userId);
  }

  const params = {
    customer: customerId,
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId: String(userId), plan },
    success_url: `${FRONTEND()}/billing.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${FRONTEND()}/billing.html?cancelled=true`,
  };

  // Pass the userId down to the subscription object too (used by webhooks).
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
   Season expiry helper — next May 31 @ 00:00 UTC.
   If we're already past May, roll to next year.
   ------------------------------------------------------------ */
export function nextMay31() {
  const now = new Date();
  const month = now.getUTCMonth(); // 0=Jan … 4=May
  // After May (month > 4) → next year; otherwise this year.
  const year = month > 4 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return new Date(Date.UTC(year, 4, 31, 0, 0, 0)); // May = index 4
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

  // Idempotency: skip if we've already processed this Stripe event.
  if (stripeEventId) {
    const { data: seen } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('stripe_event_id', stripeEventId)
      .maybeSingle();
    if (seen) {
      console.log(`[billing] event ${stripeEventId} already processed — skipping.`);
      return;
    }
  }

  const periodEnd = plan === 'season' ? nextMay31() : null;

  // 1) Promote the user.
  const userUpdate = { subscription_status: 'active', plan };
  if (periodEnd) userUpdate.plan_expires_at = periodEnd.toISOString();
  if (stripeSubscriptionId) userUpdate.stripe_subscription_id = stripeSubscriptionId;
  await supabase.from('users').update(userUpdate).eq('id', userId);

  // 2) Record the subscription row.
  await supabase.from('subscriptions').insert({
    user_id: userId,
    stripe_subscription_id: stripeSubscriptionId || null,
    stripe_event_id: stripeEventId || null,
    plan,
    billing_cycle: billingCycle,
    status: 'active',
    amount_paid: amountPaid,
    currency: 'usd',
    period_start: new Date().toISOString(),
    period_end: periodEnd ? periodEnd.toISOString() : null,
    payment_provider: 'stripe',
  });

  // 3) Fetch user contact details for the receipt.
  const { data: user } = await supabase
    .from('users')
    .select('email, full_name, language')
    .eq('id', userId)
    .maybeSingle();

  // 4) Official receipt — immediately.
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

  // 5) Advance the community milestone tracker (may auto-open a competition).
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
  await supabase
    .from('users')
    .update({ subscription_status: 'expired' })
    .eq('stripe_subscription_id', stripeSubscriptionId);
  await supabase
    .from('subscriptions')
    .update({ status: 'cancelled' })
    .eq('stripe_subscription_id', stripeSubscriptionId);
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
    return_url: `${FRONTEND()}/billing.html`,
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
