/* ============================================================
   IQPREC — routes/auth.js  (Pentagon L1/L2/L6)
   Mounted at /api/v1/auth behind authLimiter (5/15min/IP).
   ============================================================ */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { isProduction, isDevelopment } from '../config/env.js';
import { hasDb } from '../db/client.js';
import { queryOne, execute, returning } from '../db/query.js';
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
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const FORGOT_LIMIT = 3;

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

const emailSchema = z.string().trim().toLowerCase().email('A valid email is required');

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
    secure: isProduction,
    sameSite: 'strict',
    maxAge: REFRESH_MAX_AGE_MS,
    path: '/api/v1/auth',
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

async function issueSession(user, req, res) {
  const accessToken = generateAccessToken(user.id, user.email, user.plan, user.subscription_status);
  const refreshToken = generateRefreshToken();
  await storeRefreshToken(user.id, refreshToken, req.ip, req.headers['user-agent']);
  setRefreshCookie(res, refreshToken);
  return accessToken;
}

/* ============================================================
   POST /register
   ============================================================ */
router.post('/register', validateBody(registerSchema), async (req, res, next) => {
  if (!hasDb()) return dbUnavailable(res);
  const { email, password, fullName, language, referralCode } = req.body;

  const accepted = {
    success: true,
    data: null,
    error: null,
    message: 'Check your email to verify your account',
  };

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) return res.status(201).json(accepted);

    let referredBy = null;
    if (referralCode) {
      const referrer = await queryOne(
        'SELECT id FROM users WHERE referral_code = $1',
        [referralCode]
      );
      if (referrer) referredBy = referrer.id;
    }

    const referralCodeNew = await generateUniqueReferralCode();
    const verifyRaw = generateEmailVerifyToken();
    const verifyHash = hashToken(verifyRaw);
    const now = Date.now();

    let created;
    try {
      const rows = await returning(
        `INSERT INTO users
           (email, password_hash, full_name, language, subscription_status,
            trial_ends_at, referral_code, referred_by, email_verified,
            email_verify_token, email_verify_expires)
         VALUES ($1, $2, $3, $4, 'pending_trial', NULL, $5, $6, false, $7, $8)
         RETURNING id`,
        [
          email, passwordHash, fullName, language,
          referralCodeNew, referredBy,
          verifyHash,
          new Date(now + VERIFY_TTL_MS).toISOString(),
        ]
      );
      created = rows[0];
    } catch (insertErr) {
      if (insertErr.code === '23505') return res.status(201).json(accepted);
      return next(insertErr);
    }

    if (referredBy) {
      recordReferral(referredBy, created.id).catch((e) =>
        console.error('[register] recordReferral failed:', e?.message)
      );
    }
    sendVerificationEmail(email, fullName, verifyRaw, language).catch(() => {});

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

    const user = await queryOne(
      `SELECT * FROM users
       WHERE email_verify_token = $1 AND email_verify_expires > $2`,
      [tokenHash, new Date().toISOString()]
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'AUTH_2002',
        message: 'Invalid or expired verification link',
      });
    }

    await execute(
      `UPDATE users
       SET email_verified = true, email_verify_token = NULL,
           email_verify_expires = NULL, last_active_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    const accessToken = await issueSession(user, req, res);

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
    const user = await queryOne('SELECT * FROM users WHERE email = $1', [email]);

    if (!user) {
      await bcrypt.compare(password, FAKE_HASH);
      return genericAuthFail(res);
    }

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
      const setClauses = ['failed_login_attempts = $1'];
      const vals = [attempts];
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        setClauses.push(`locked_until = $${vals.length + 1}`);
        vals.push(new Date(Date.now() + LOCK_MS).toISOString());
      }
      vals.push(user.id);
      await execute(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${vals.length}`,
        vals
      );

      if (attempts === MAX_FAILED_ATTEMPTS) {
        sendSecurityAlertEmail(user.email, user.full_name, req.ip, user.language).catch(
          () => {}
        );
      }
      return genericAuthFail(res);
    }

    if (!user.email_verified) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'AUTH_1005',
        message: 'Please verify your email first',
      });
    }

    await execute(
      `UPDATE users
       SET failed_login_attempts = 0, locked_until = NULL, last_active_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

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
   POST /refresh
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
   POST /logout
   ============================================================ */
router.post('/logout', async (req, res) => {
  const raw = req.cookies?.[REFRESH_COOKIE];

  try {
    if (raw && hasDb()) {
      await execute(
        `UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1`,
        [hashToken(raw)]
      ).catch(() => {});
    }
    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) {
      await blacklistAccessToken(auth.slice(7)).catch(() => {});
    }
  } catch (e) {
    console.error('[logout] revoke failed:', e?.message);
  }

  clearRefreshCookie(res);
  return res.json({ success: true, data: null, error: null, message: 'Logged out.' });
});

/* ============================================================
   POST /forgot-password
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

    const user = await queryOne(
      'SELECT id, email, full_name, language FROM users WHERE email = $1',
      [email]
    );

    if (user) {
      const resetRaw = generateEmailVerifyToken();
      await execute(
        `UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3`,
        [
          hashToken(resetRaw),
          new Date(Date.now() + RESET_TTL_MS).toISOString(),
          user.id,
        ]
      );
      sendPasswordResetEmail(user.email, user.full_name, resetRaw, user.language).catch(
        () => {}
      );
      return res.json(generic);
    }

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

    const user = await queryOne(
      `SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > $2`,
      [tokenHash, new Date().toISOString()]
    );

    if (!user) {
      return res.status(400).json({
        success: false,
        data: null,
        error: 'AUTH_2004',
        message: 'Invalid or expired reset link',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await execute(
      `UPDATE users
       SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL,
           failed_login_attempts = 0, locked_until = NULL
       WHERE id = $2`,
      [passwordHash, user.id]
    );

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
   GET /me
   ============================================================ */
router.get('/me', verifyToken, checkSubscription, async (req, res, next) => {
  if (!hasDb()) return dbUnavailable(res);

  try {
    const user = await queryOne(
      'SELECT * FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (!user) {
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
