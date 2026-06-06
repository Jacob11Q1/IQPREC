/* ============================================================
   IQPREC — services/auth.service.js
   Pure helpers shared by the auth routes (Pentagon L1/L2/L6).
     • token generation + SHA-256 hashing for email-verify / reset tokens
     • unique referral-code generation (delegates to referral.service)
     • getSafeUser — the ONLY shape allowed to leave the server; never
       includes password_hash, failed_login_attempts, or any raw token.
     • isTrial — trial-status helper mirroring check-subscription logic.
   ============================================================ */

import crypto from 'node:crypto';
import { generateReferralCode } from './referral.service.js';

/** 32 random bytes as hex — used for email-verify and password-reset tokens. */
export function generateEmailVerifyToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** SHA-256 hex hash. Only the hash is ever stored; the raw token is emailed. */
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Generate an 8-char alphanumeric referral code that is unique in
 * users.referral_code. referral.service already retries on collision
 * (unambiguous alphabet, no 0/O/1/I), so we delegate to it.
 */
export async function generateUniqueReferralCode() {
  return generateReferralCode();
}

/**
 * Map a raw DB users row → the safe, client-facing object.
 * Pass `referralCount` to additionally expose referral progress and the
 * fuller profile fields used by GET /auth/me. NEVER returns password_hash,
 * failed_login_attempts, locked_until, tokens, or any internal column.
 */
export function getSafeUser(user, referralCount) {
  if (!user) return null;

  const safe = {
    id: user.id,
    email: user.email,
    fullName: user.full_name ?? null,
    language: user.language ?? 'ar',
    subscriptionStatus: user.subscription_status ?? 'trial',
    trialEndsAt: user.trial_ends_at ?? null,
    plan: user.plan ?? 'monthly',
    referralCode: user.referral_code ?? null,
  };

  // Fuller profile (GET /auth/me) only when a referral count is supplied.
  if (referralCount !== undefined && referralCount !== null) {
    safe.referralCount = referralCount;
    safe.competitionQualified = referralCount >= 5;
    safe.isAdmin = Boolean(user.is_admin);
    safe.fplTeamId = user.fpl_team_id ?? null;
    safe.fplTeamName = user.fpl_team_name ?? null;
  }

  return safe;
}

/** True when the user is on a live (not-yet-expired) trial. */
export function isTrial(user) {
  if (!user) return false;
  return (
    user.subscription_status === 'trial' &&
    Boolean(user.trial_ends_at) &&
    new Date(user.trial_ends_at).getTime() > Date.now()
  );
}

export default {
  generateEmailVerifyToken,
  hashToken,
  generateUniqueReferralCode,
  getSafeUser,
  isTrial,
};
