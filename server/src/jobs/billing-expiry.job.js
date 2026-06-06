/* ============================================================
   IQPREC — jobs/billing-expiry.job.js
   Daily at 00:00 UTC: find season-pass users whose plan_expires_at has
   passed, move them to 'expired', and send a warm renewal email.
   (Monthly subscribers are handled by Stripe's recurring billing +
   webhooks, not here.)
   ============================================================ */

import cron from 'node-cron';

import { supabase, hasDb } from '../db/client.js';
import { sendSeasonRenewalEmail } from '../services/receipt.service.js';

/** Expire season passes whose plan_expires_at is in the past. */
export async function expireSeasonPasses() {
  if (!hasDb()) {
    console.warn('[billing-expiry] DB not configured — skipping.');
    return { expired: 0 };
  }

  const nowIso = new Date().toISOString();

  // Find active season-pass users past their expiry.
  const { data: expiredUsers, error } = await supabase
    .from('users')
    .select('id, email, full_name, language')
    .eq('plan', 'season')
    .eq('subscription_status', 'active')
    .lt('plan_expires_at', nowIso);

  if (error) {
    console.error('[billing-expiry] query failed:', error.message);
    return { expired: 0 };
  }

  const users = expiredUsers || [];
  if (!users.length) {
    console.log('[billing-expiry] no season passes to expire.');
    return { expired: 0 };
  }

  // Flip them to 'expired'. (Schema constraint allows trial/active/expired;
  // we use 'expired' rather than the spec's 'trial_expired' to satisfy it.)
  const ids = users.map((u) => u.id);
  await supabase
    .from('users')
    .update({ subscription_status: 'expired' })
    .in('id', ids);

  // Warm renewal email to each (best-effort, non-blocking failures).
  for (const u of users) {
    if (!u.email) continue;
    try {
      await sendSeasonRenewalEmail({
        email: u.email,
        fullName: u.full_name,
        language: u.language || 'ar',
      });
    } catch (err) {
      console.error('[billing-expiry] renewal email failed for', u.id, '-', err?.message);
    }
  }

  console.log(`[billing-expiry] expired ${users.length} season pass(es).`);
  return { expired: users.length };
}

/** Register the daily expiry cron (00:00 UTC). */
export function initBillingJobs() {
  cron.schedule('0 0 * * *', () => {
    expireSeasonPasses();
  }, { timezone: 'UTC' });
  console.log('[billing-expiry] cron registered (daily 00:00 UTC).');
}

export default initBillingJobs;
