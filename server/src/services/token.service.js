/* ============================================================
   IQPREC — services/token.service.js  (Pentagon L2)
   RS256 JWT issuance + refresh-token rotation.
     • Access token : RS256, 15 min, iss iqprec.com, aud iqprec-app.
     • Refresh token: 64 random bytes (hex); only its SHA-256 hash is
       stored. Rotated on every use; reuse of a revoked token revokes
       the whole family (theft detection).
     • Access tokens can be blacklisted in Redis (logout / suspend).
   RS256 ONLY — never HS256.
   ============================================================ */

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { pool, hasDb } from '../db/client.js';
import { queryOne, execute } from '../db/query.js';
import { redis, isRedisReady } from '../lib/redis.js';

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 7;
const REFRESH_TTL_MS = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
const ISSUER = 'iqprec.com';
const AUDIENCE = 'iqprec-app';
const BLACKLIST_PREFIX = 'bl:jwt:';

function privateKey() {
  return String(env.JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}
function publicKey() {
  return String(env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
}

function sha256(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function requireDb() {
  if (!hasDb()) {
    const err = new Error('Database not configured');
    err.code = 'DB_UNAVAILABLE';
    err.status = 503;
    throw err;
  }
}

/* ------------------------------------------------------------
   Access tokens
   ------------------------------------------------------------ */
export function generateAccessToken(userId, email, plan, subscriptionStatus) {
  return jwt.sign({ userId, email, plan, subscriptionStatus }, privateKey(), {
    algorithm: 'RS256',
    expiresIn: ACCESS_TTL,
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: String(userId),
  });
}

export async function verifyAccessToken(token) {
  const payload = jwt.verify(token, publicKey(), {
    algorithms: ['RS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  });

  if (isRedisReady()) {
    try {
      const black = await redis.get(BLACKLIST_PREFIX + sha256(token));
      if (black) {
        const err = new Error('Token has been revoked');
        err.code = 'AUTH_1004';
        throw err;
      }
    } catch (err) {
      if (err.code === 'AUTH_1004') throw err;
    }
  }

  return payload;
}

export async function blacklistAccessToken(token) {
  if (!isRedisReady()) return false;
  let ttlSec = 15 * 60;
  try {
    const decoded = jwt.decode(token);
    if (decoded?.exp) {
      ttlSec = Math.max(1, decoded.exp - Math.floor(Date.now() / 1000));
    }
  } catch {
    /* use default ttl */
  }
  await redis.set(BLACKLIST_PREFIX + sha256(token), '1', 'EX', ttlSec);
  return true;
}

/* ------------------------------------------------------------
   Refresh tokens
   ------------------------------------------------------------ */
export function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

export async function storeRefreshToken(userId, rawToken, ipAddress, userAgent) {
  requireDb();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS).toISOString();
  try {
    await execute(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, sha256(rawToken), expiresAt, ipAddress || null, userAgent || null]
    );
  } catch (err) {
    const e = new Error('Failed to persist refresh token');
    e.code = 'TOKEN_STORE_FAILED';
    e.status = 500;
    throw e;
  }
  return { expiresAt };
}

export async function rotateRefreshToken(rawToken, ipAddress, userAgent) {
  requireDb();
  const tokenHash = sha256(rawToken);

  const row = await queryOne(
    `SELECT id, user_id, expires_at, revoked FROM refresh_tokens WHERE token_hash = $1`,
    [tokenHash]
  );

  if (!row) {
    const e = new Error('Invalid refresh token');
    e.code = 'AUTH_1005';
    e.status = 401;
    throw e;
  }

  // Reuse detection: a revoked token presented again = compromised family.
  if (row.revoked) {
    await revokeAllUserTokens(row.user_id);
    const e = new Error('Refresh token reuse detected — session revoked');
    e.code = 'AUTH_1006';
    e.status = 401;
    throw e;
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    const e = new Error('Refresh token expired');
    e.code = 'AUTH_1007';
    e.status = 401;
    throw e;
  }

  await execute(`UPDATE refresh_tokens SET revoked = true WHERE id = $1`, [row.id]);

  const newRaw = generateRefreshToken();
  await storeRefreshToken(row.user_id, newRaw, ipAddress, userAgent);

  const user = await queryOne(
    `SELECT id, email, plan, subscription_status FROM users WHERE id = $1`,
    [row.user_id]
  );

  if (!user) {
    const e = new Error('User not found for refresh token');
    e.code = 'AUTH_1008';
    e.status = 401;
    throw e;
  }

  const accessToken = generateAccessToken(user.id, user.email, user.plan, user.subscription_status);
  return { accessToken, refreshToken: newRaw, userId: user.id };
}

export async function revokeAllUserTokens(userId) {
  requireDb();
  try {
    await execute(
      `UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`,
      [userId]
    );
  } catch (err) {
    const e = new Error('Failed to revoke tokens');
    e.code = 'TOKEN_REVOKE_FAILED';
    e.status = 500;
    throw e;
  }
  return true;
}

export default {
  generateAccessToken,
  verifyAccessToken,
  blacklistAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  rotateRefreshToken,
  revokeAllUserTokens,
};
