/* ============================================================
   IQPREC — jobs/billing-expiry.job.js
   Daily at 00:00 UTC: find season-pass users whose plan_expires_at has
   passed, move them to 'expired', and send a warm renewal email.
   ============================================================ */

import cron from 'node-cron';

import { hasDb } from '../db/client.js';
import { queryMany, execute } from '../db/query.js';
import { sendSeasonRenewalEmail } from '../services/receipt.service.js';

export async function expireSeasonPasses() {
  if (!hasDb()) {
    console.warn('[billing-expiry] DB not configured — skipping.');
    return { expired: 0 };
  }

  const nowIso = new Date().toISOString();

  const expiredUsers = await queryMany(
    `SELECT id, email, full_name, language
     FROM users
     WHERE plan = 'season' AND subscription_status = 'active' AND plan_expires_at < $1`,
    [nowIso]
  ).catch((err) => {
    console.error('[billing-expiry] query failed:', err.message);
    return [];
  });

  if (!expiredUsers.length) {
    console.log('[billing-expiry] no season passes to expire.');
    return { expired: 0 };
  }

  const ids = expiredUsers.map((u) => u.id);
  await execute(
    `UPDATE users SET subscription_status = 'expired' WHERE id = ANY($1::uuid[])`,
    [ids]
  );

  for (const u of expiredUsers) {
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

  console.log(`[billing-expiry] expired ${expiredUsers.length} season pass(es).`);
  return { expired: expiredUsers.length };
}

export function initBillingJobs() {
  cron.schedule('0 0 * * *', () => {
    expireSeasonPasses();
  }, { timezone: 'UTC' });
  console.log('[billing-expiry] cron registered (daily 00:00 UTC).');
}

export default initBillingJobs;
