/* ============================================================
   IQPREC — services/referral.service.js
   Referral codes, referral recording, and the milestone tracker that
   auto-opens competitions (CLAUDE.md COMPETITIONS SYSTEM).
   Milestone ladder: 20, 50, 100, 250, 500, 750, 1000, then every 250.
   ============================================================ */

import crypto from 'node:crypto';
import { hasDb } from '../db/client.js';
import { queryOne, queryMany, execute, queryCount, returning } from '../db/query.js';

const CURRENT_SEASON = '2026-27';
const LADDER = [20, 50, 100, 250, 500, 750, 1000];
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function requireDb() {
  if (!hasDb()) {
    const err = new Error('Database not configured');
    err.code = 'DB_UNAVAILABLE';
    err.status = 503;
    throw err;
  }
}

/** Next milestone strictly above `current`. */
export function nextMilestone(current) {
  for (const m of LADDER) if (current < m) return m;
  return Math.ceil((current + 1) / 250) * 250;
}

function randomCode(len = 8) {
  const bytes = crypto.randomBytes(len);
  let code = '';
  for (let i = 0; i < len; i += 1) code += ALPHABET[bytes[i] % ALPHABET.length];
  return code;
}

/** Generate an 8-char alphanumeric code, unique in users.referral_code. */
export async function generateReferralCode() {
  requireDb();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomCode(8);
    const existing = await queryOne('SELECT id FROM users WHERE referral_code = $1', [code]);
    if (!existing) return code;
  }
  return randomCode(8);
}

/** Record a converted referral (UNIQUE referred_id prevents doubles). */
export async function recordReferral(referrerId, referredId) {
  requireDb();
  try {
    await execute(
      `INSERT INTO referrals (referrer_id, referred_id, converted) VALUES ($1, $2, true)`,
      [referrerId, referredId]
    );
  } catch (err) {
    if (err.code === '23505') return true; // already recorded — idempotent
    const e = new Error('Failed to record referral');
    e.code = 'REFERRAL_INSERT_FAILED';
    throw e;
  }
  return true;
}

/** Count converted referrals for a user. */
export async function getReferralCount(userId) {
  requireDb();
  try {
    return await queryCount(
      `SELECT COUNT(*) FROM referrals WHERE referrer_id = $1 AND converted = true`,
      [userId]
    );
  } catch {
    return 0;
  }
}

/**
 * Increment the global user count, advance the milestone pointer, and
 * auto-create an ACTIVE competition when a milestone is reached.
 * Returns { currentUsers, nextMilestone, competitionOpened }.
 */
export async function updateMilestoneTracker() {
  requireDb();

  let tracker = await queryOne(
    `SELECT * FROM ultimate_milestone_tracker WHERE season = $1`,
    [CURRENT_SEASON]
  );

  if (!tracker) {
    const rows = await returning(
      `INSERT INTO ultimate_milestone_tracker (season, current_users, next_milestone)
       VALUES ($1, 0, 20) RETURNING *`,
      [CURRENT_SEASON]
    );
    tracker = rows[0];
  }

  const currentUsers = (tracker.current_users || 0) + 1;
  const target = tracker.next_milestone || nextMilestone(currentUsers - 1);
  let competitionOpened = false;

  if (currentUsers >= target) {
    const name = `Milestone ${target} — The Falcon League`;
    const nameAr = `إنجاز ${target} — دوري الصقر`;
    try {
      await execute(
        `INSERT INTO competitions (name, name_ar, milestone_target, status, start_date, end_date)
         VALUES ($1, $2, $3, 'active', NOW(), NOW() + INTERVAL '30 days')`,
        [name, nameAr, target]
      );
      competitionOpened = true;
      console.log(`[milestone] reached ${target} users → competition opened`);
    } catch (compErr) {
      console.warn('[milestone] competition insert failed:', compErr?.message);
    }
  }

  const newNext = currentUsers >= target ? nextMilestone(currentUsers) : target;

  await execute(
    `UPDATE ultimate_milestone_tracker
     SET current_users = $1, next_milestone = $2, updated_at = NOW()
     WHERE season = $3`,
    [currentUsers, newNext, CURRENT_SEASON]
  );

  return { currentUsers, nextMilestone: newNext, competitionOpened };
}

export default {
  nextMilestone,
  generateReferralCode,
  recordReferral,
  getReferralCount,
  updateMilestoneTracker,
};
