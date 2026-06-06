/* ============================================================
   IQPREC — services/referral.service.js
   Referral codes, referral recording, and the milestone tracker that
   auto-opens competitions (CLAUDE.md COMPETITIONS SYSTEM).
   Milestone ladder: 20, 50, 100, 250, 500, 750, 1000, then every 250.
   ============================================================ */

import crypto from 'node:crypto';
import { supabase } from '../db/client.js';

const CURRENT_SEASON = '2026-27';
const LADDER = [20, 50, 100, 250, 500, 750, 1000];
// Unambiguous alphabet (no 0/O/1/I) for human-shareable codes.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function requireDb() {
  if (!supabase) {
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
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('referral_code', code)
      .maybeSingle();
    if (error) break; // DB issue — fall through to last-resort code
    if (!data) return code;
  }
  // Extremely unlikely collisions — append entropy.
  return randomCode(8);
}

/** Record a converted referral (UNIQUE referred_id prevents doubles). */
export async function recordReferral(referrerId, referredId) {
  requireDb();
  const { error } = await supabase.from('referrals').insert({
    referrer_id: referrerId,
    referred_id: referredId,
    converted: true,
  });
  if (error && error.code !== '23505') {
    // 23505 = unique_violation → already recorded, treat as idempotent.
    const e = new Error('Failed to record referral');
    e.code = 'REFERRAL_INSERT_FAILED';
    throw e;
  }
  return true;
}

/** Count converted referrals for a user. */
export async function getReferralCount(userId) {
  requireDb();
  const { count, error } = await supabase
    .from('referrals')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_id', userId)
    .eq('converted', true);
  if (error) return 0;
  return count || 0;
}

/**
 * Increment the global user count, advance the milestone pointer, and
 * auto-create an ACTIVE competition when a milestone is reached.
 * Returns { currentUsers, nextMilestone, competitionOpened }.
 */
export async function updateMilestoneTracker() {
  requireDb();

  // Read (or lazily seed) the single tracker row.
  let { data: tracker } = await supabase
    .from('ultimate_milestone_tracker')
    .select('*')
    .eq('season', CURRENT_SEASON)
    .maybeSingle();

  if (!tracker) {
    const seed = await supabase
      .from('ultimate_milestone_tracker')
      .insert({ season: CURRENT_SEASON, current_users: 0, next_milestone: 20 })
      .select('*')
      .single();
    tracker = seed.data;
  }

  const currentUsers = (tracker.current_users || 0) + 1;
  const target = tracker.next_milestone || nextMilestone(currentUsers - 1);
  let competitionOpened = false;

  // Did this signup cross the pending milestone?
  if (currentUsers >= target) {
    const name = `Milestone ${target} — The Falcon League`;
    const nameAr = `إنجاز ${target} — دوري الصقر`;

    // Open a 30-day competition. (Idempotency: milestone_target lets a
    // later day add a UNIQUE constraint if desired.)
    const { error: compErr } = await supabase.from('competitions').insert({
      name,
      name_ar: nameAr,
      milestone_target: target,
      status: 'active',
      start_date: new Date().toISOString(),
      end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (!compErr) {
      competitionOpened = true;
      console.log(`[milestone] reached ${target} users → competition opened`);
    }
  }

  const newNext =
    currentUsers >= target ? nextMilestone(currentUsers) : target;

  await supabase
    .from('ultimate_milestone_tracker')
    .update({
      current_users: currentUsers,
      next_milestone: newNext,
      updated_at: new Date().toISOString(),
    })
    .eq('season', CURRENT_SEASON);

  return { currentUsers, nextMilestone: newNext, competitionOpened };
}

export default {
  nextMilestone,
  generateReferralCode,
  recordReferral,
  getReferralCount,
  updateMilestoneTracker,
};
