/* ============================================================
   IQPREC — routes/auth.js  (Day 5: Auth Backend, zero vulnerabilities)
   Mounted at /api/v1/auth behind authLimiter (5/15min/IP) — see
   routes/index.js. Every body-bearing route runs validateBody(Zod);
   sanitizeInput already ran globally in index.js.

   Anti-abuse posture:
     • Email enumeration: register + forgot-password respond identically
       whether or not the account exists.
     • Timing attacks: login runs bcrypt.compare against a constant fake
       hash for unknown emails; forgot-password waits 100ms for misses.
     • Brute force: 5 failed logins → 15-min lock + security email.
     • Tokens: zero tokens issued before email verification. RS256 access
       (15m) in body; refresh (64 bytes) only in an httpOnly Secure
       SameSite=Strict cookie, rotated on every refresh.
   ============================================================ */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { isProduction, isDevelopment } from '../config/env.js';
import { supabase, hasDb } from '../db/client.js';
import { redis, isRedisReady } from '../lib/redis.js';
import { validateBody } from '../middleware/security/validate-body.js';
import { verifyToken } from '../middleware/auth/verify-token.js';
import { checkSubscription } from '../middleware/auth/check-subscription.js';

import {
  generateAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  rotateRefreshToken,
  revokeAllUserTokens,
  blacklistAccessToken,
} from '../services/token.service.js';
import {
  recordReferral,
  getReferralCount,
  updateMilestoneTracker,
} from '../services/referral.service.js';
import {
  generateEmailVerifyToken,
  hashToken,
  generateUniqueReferralCode,
  getSafeUser,
} from '../services/auth.service.js';
import {
  sendVerificationEmail,
  sendSecurityAlertEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
} from '../services/email.service.js';

const router = Router();

/* ------------------------------------------------------------
   Constants
   ------------------------------------------------------------ */
const BCRYPT_ROUNDS = 12;
const TRIAL_DAYS = 7;
const REFRESH_COOKIE = 'iqprec_rt';
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 minutes
const FORGOT_LIMIT = 3; // per hour per email

/* Constant fake hash so login spends identical bcrypt time for unknown
   emails (timing-attack guard). Computed once at startup; not a secret. */
const FAKE_HASH = bcrypt.hashSync('iqprec-timing-guard-string', BCRYPT_ROUNDS);

/* ------------------------------------------------------------
   Zod schemas
   ------------------------------------------------------------ */
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[0-9]/, 'Password must include a number')
  .regex(/[^A-Za-z0-9]/, 'Password must include a special character');

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('A valid email is required');

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(2, 'Full name must be at least 2 characters'),
  language: z.enum(['ar', 'en']).default('ar'),
  referralCode: z.string().trim().min(1).max(16).optional(),
});

const verifyEmailSchema = z.object({ token: z.string().min(1, 'Token is required') });
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1) });
const forgotSchema = z.object({ email: emailSchema });
const resetSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: passwordSchema,
});

/* ------------------------------------------------------------
   Helpers
   ------------------------------------------------------------ */
function dbUnavailable(res) {
  return res.status(503).json({
    success: false,
    data: null,
    error: 'DB_UNAVAILABLE',
    message: 'Service temporarily unavailable.',
  });
}

/* Generic credential failure — identical for unknown email and wrong
   password (no enumeration). Bilingual message per CLAUDE.md. */
function genericAuthFail(res) {
  return res.status(401).json({
    success: false,
    data: null,
    error: 'AUTH_1010',
    message: 'Invalid email or password',
    messageAr: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
  });
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: isProduction, // Secure in prod; relaxed over http in dev
    sameSite: 'strict',
    maxAge: REFRESH_MAX_AGE_MS,
    path: '/api/v1/auth', // scoped to refresh/logout only
  });
}

function clearRefreshCookie(res) {
  res.cookie(REFRESH_COOKIE, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: 0,
    path: '/api/v1/auth',
  });
}

/* Issue an access token + a fresh refresh token (stored hashed), and set
   the refresh cookie. Returns the access token for the response body. */
async function issueSession(user, req, res) {
  const accessToken = generateAccessToken(user.id, user.email, user.plan);
  const refreshToken = generateRefreshToken();
  await storeRefreshToken(
    user.id,
    refreshToken,
    req.ip,
    req.headers['user-agent']
  );
  setRefreshCookie(res, refreshToken);
  return accessToken;
}

/* ============================================================
   POST /register
   ============================================================ */
router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  if (!hasDb()) return dbUnavailable(res);
  const { email, password, fullName, language, referralCode } = req.body;

  // Identical happy-path body — returned whether or not the email exists,
  // so an attacker cannot enumerate registered accounts.
  const accepted = {
    success: true,
    data: null,
    error: null,
    message: 'Check your email to verify your account',
  };

  try {
    // Always hash (uniform timing) even if the email already exists.
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existing) {
      // Do NOT reveal existence. (A "you already have an account" email
      // could be sent here in future — still no API signal.)
      return res.status(201).json(accepted);
    }

    // Resolve referrer (if a code was supplied and matches).
    let referredBy = null;
    if (referralCode) {
      const { data: referrer } = await supabase
        .from('users')
        .select('id')
        .eq('referral_code', referralCode)
        .maybeSingle();
      if (referrer) referredBy = referrer.id;
    }

    const referralCodeNew = await generateUniqueReferralCode();
    const verifyRaw = generateEmailVerifyToken();
    const verifyHash = hashToken(verifyRaw);
    const now = Date.now();

    const { data: created, error: insertErr } = await supabase
      .from('users')
      .insert({
        email,
        password_hash: passwordHash,
        full_name: fullName,
        language,
        subscription_status: 'trial',
        trial_ends_at: new Date(now + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        referral_code: referralCodeNew,
        referred_by: referredBy,
        email_verified: false,
        email_verify_token: verifyHash,
        email_verify_expires: new Date(now + VERIFY_TTL_MS).toISOString(),
      })
      .select('id')
      .single();

    if (insertErr) {
      // 23505 = unique_violation (email race) → stay generic, no leak.
      if (insertErr.code === '23505') return res.status(201).json(accepted);
      return next(insertErr);
    }

    // Non-blocking side effects (do NOT await — never delay the response).
    if (referredBy) {
      recordReferral(referredBy, created.id).catch((e) =>
        console.error('[register] recordReferral failed:', e?.message)
      );
    }
    sendVerificationEmail(email, fullName, verifyRaw, language).catch(() => {});

    // Development convenience: surface the raw verification token so it can
    // be clicked manually without a real email. NEVER in production.
    if (isDevelopment) {
      return res.status(201).json({ ...accepted, devVerifyToken: verifyRaw });
    }

    return res.status(201).json(accepted);
  } catch (err) {
    return next(err);
  }
});

/* ============================================================
   POST /verify-email
   ============================================================ */
router.post('/verify-email', validateBody(verifyEmailSchema), async (req, res, next) => {
  if (!hasDb()) return dbUnavailable(res);

  try {
    const tokenHash = hashToken(req.body.token);

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email_verify_token', tokenHash)
      .gt('email_verify_expires', new Date().toISOString())
      .maybeSingle();

    if (!user) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'AUTH_2002',
        message: 'Invalid or expired verification link',
      });
    }

    await supabase
      .from('users')
      .update({
        email_verified: true,
        email_verify_token: null,
        email_verify_expires: null,
        last_active_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    const accessToken = await issueSession(user, req, res);

    // Activation side effects — fire-and-forget.
    sendWelcomeEmail(user.email, user.full_name, user.language).catch(() => {});
    updateMilestoneTracker().catch((e) =>
      console.error('[verify-email] milestone update failed:', e?.message)
    );

    return res.json({
      success: true,
      data: {
        accessToken,
        user: getSafeUser({ ...user, email_verified: true }),
      },
      error: null,
      message: null,
    });
  } catch (err) {
    return next(err);
  }
});

/* ============================================================
   POST /login
   ============================================================ */
router.post('/login', validateBody(loginSchema), async (req, res, next) => {
  if (!hasDb()) return dbUnavailable(res);
  const { email, password } = req.body;

  try {
    const { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    // Unknown email: spend identical bcrypt time, then generic failure.
    if (!user) {
      await bcrypt.compare(password, FAKE_HASH);
      return genericAuthFail(res);
    }

    // Locked account → 429 with remaining time.
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      const retryAfter = Math.ceil(
        (new Date(user.locked_until).getTime() - Date.now()) / 1000
      );
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        success: false,
        data: null,
        error: 'AUTH_1011',
        message: 'Account temporarily locked. Try again later.',
        retryAfter,
      });
    }

    const ok = await bcrypt.compare(password, user.password_hash || FAKE_HASH);

    if (!ok) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      const update = { failed_login_attempts: attempts };
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        update.locked_until = new Date(Date.now() + LOCK_MS).toISOString();
      }
      await supabase.from('users').update(update).eq('id', user.id);

      // Exactly at the 5th failure: alert the owner (async).
      if (attempts === MAX_FAILED_ATTEMPTS) {
        sendSecurityAlertEmail(user.email, user.full_name, req.ip, user.language).catch(
          () => {}
        );
      }
      return genericAuthFail(res);
    }

    // Password correct but email not verified → distinct, expected error.
    if (!user.email_verified) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'AUTH_1005',
        message: 'Please verify your email first',
      });
    }

    // Success: reset counters, stamp activity, issue tokens.
    await supabase
      .from('users')
      .update({
        failed_login_attempts: 0,
        locked_until: null,
        last_active_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    const accessToken = await issueSession(user, req, res);

    return res.json({
      success: true,
      data: { accessToken, user: getSafeUser(user) },
      error: null,
      message: null,
    });
  } catch (err) {
    return next(err);
  }
});

/* ============================================================
   POST /refresh — refresh token from httpOnly cookie ONLY.
   ============================================================ */
router.post('/refresh', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'AUTH_1006',
      message: 'No active session.',
    });
  }

  try {
    const { accessToken, refreshToken } = await rotateRefreshToken(
      raw,
      req.ip,
      req.headers['user-agent']
    );
    setRefreshCookie(res, refreshToken);
    return res.json({
      success: true,
      data: { accessToken },
      error: null,
      message: null,
    });
  } catch {
    // Any failure (invalid / expired / reuse) → clear cookie + 401.
    clearRefreshCookie(res);
    return res.status(401).json({
      success: false,
      data: null,
      error: 'AUTH_1006',
      message: 'Session expired. Please sign in again.',
    });
  }
});

/* ============================================================
   POST /logout — always 200.
   ============================================================ */
router.post('/logout', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];

  try {
    if (raw && hasDb()) {
      await supabase
        .from('refresh_tokens')
        .update({ revoked: true })
        .eq('token_hash', hashToken(raw));
    }
    // Best-effort: blacklist the presented access token too.
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
      await blacklistAccessToken(auth.slice(7)).catch(() => {});
    }
  } catch (e) {
    console.error('[logout] revoke failed:', e?.message);
  }

  clearRefreshCookie(res);
  return res.json({
    success: true,
    data: null,
    error: null,
    message: 'Logged out.',
  });
});

/* ============================================================
   POST /forgot-password — always generic success (no enumeration).
   ============================================================ */
router.post('/forgot-password', validateBody(forgotSchema), async (req, res, next) => {
  if (!hasDb()) return dbUnavailable(res);
  const { email } = req.body;

  const generic = {
    success: true,
    data: null,
    error: null,
    message: 'If an account exists for that email, a reset link has been sent.',
  };

  try {
    // Strict limit: 3 per hour per email (Redis; fail open if unavailable).
    if (isRedisReady()) {
      const key = `rl:forgot:${email}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, 3600);
      if (count > FORGOT_LIMIT) {
        res.setHeader('Retry-After', '3600');
        return res.status(429).json({
          success: false,
          data: null,
          error: 'RATE_LIMITED',
          message: 'Too many reset requests. Try again in an hour.',
          retryAfter: 3600,
        });
      }
    }

    const { data: user } = await supabase
      .from('users')
      .select('id, email, full_name, language')
      .eq('email', email)
      .maybeSingle();

    if (user) {
      const resetRaw = generateEmailVerifyToken(); // 32 bytes hex
      await supabase
        .from('users')
        .update({
          reset_token: hashToken(resetRaw),
          reset_token_expires: new Date(Date.now() + RESET_TTL_MS).toISOString(),
        })
        .eq('id', user.id);

      sendPasswordResetEmail(user.email, user.full_name, resetRaw, user.language).catch(
        () => {}
      );
      return res.json(generic);
    }

    // No such account: fixed 100ms delay to flatten timing, same response.
    await new Promise((r) => setTimeout(r, 100));
    return res.json(generic);
  } catch (err) {
    return next(err);
  }
});

/* ============================================================
   POST /reset-password
   ============================================================ */
router.post('/reset-password', validateBody(resetSchema), async (req, res, next) => {
  if (!hasDb()) return dbUnavailable(res);
  const { token, newPassword } = req.body;

  try {
    const tokenHash = hashToken(token);

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('reset_token', tokenHash)
      .gt('reset_token_expires', new Date().toISOString())
      .maybeSingle();

    if (!user) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'AUTH_2004',
        message: 'Invalid or expired reset link',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        reset_token: null,
        reset_token_expires: null,
        failed_login_attempts: 0,
        locked_until: null,
      })
      .eq('id', user.id);

    // Invalidate every existing session — reset = global sign-out.
    await revokeAllUserTokens(user.id);

    return res.json({
      success: true,
      data: null,
      error: null,
      message: 'Password updated. Please sign in.',
    });
  } catch (err) {
    return next(err);
  }
});

/* ============================================================
   GET /me — requires verifyToken + checkSubscription
   ============================================================ */
router.get('/me', verifyToken, checkSubscription, async (req, res, next) => {
  if (!hasDb()) return dbUnavailable(res);

  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.user.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'AUTH_1009',
        message: 'Account not found.',
      });
    }

    const referralCount = await getReferralCount(user.id);

    return res.json({
      success: true,
      data: { user: getSafeUser(user, referralCount) },
      error: null,
      message: null,
    });
  } catch (err) {
    return next(err);
  }
});

export default router;
