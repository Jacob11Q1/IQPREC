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
import { supabase } from '../db/client.js';
import { redis, isRedisReady } from '../lib/redis.js';

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 7;
const REFRESH_TTL_MS = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
const ISSUER = 'iqprec.com';
const AUDIENCE = 'iqprec-app';
const BLACKLIST_PREFIX = 'bl:jwt:';

/* PEM keys may be stored with literal "\n" — restore real newlines. */
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
  if (!supabase) {
    const err = new Error('Database not configured');
    err.code = 'DB_UNAVAILABLE';
    err.status = 503;
    throw err;
  }
}

/* ------------------------------------------------------------
   Access tokens
   ------------------------------------------------------------ */
export function generateAccessToken(userId, email, plan) {
  return jwt.sign({ userId, email, plan }, privateKey(), {
    algorithm: 'RS256',
    expiresIn: ACCESS_TTL,
    issuer: ISSUER,
    audience: AUDIENCE,
    subject: String(userId),
  });
}

/**
 * Verify an access token: RS256 signature + iss/aud, then Redis
 * blacklist check. Throws with err.code = AUTH_1004 when blacklisted;
 * jwt errors (TokenExpiredError / JsonWebTokenError) propagate as-is.
 */
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
      // Redis down → fail open on the blacklist check (signature is valid).
    }
  }

  return payload;
}

/** Blacklist an access token until its natural expiry (logout/suspend). */
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
  const { error } = await supabase.from('refresh_tokens').insert({
    user_id: userId,
    token_hash: sha256(rawToken),
    expires_at: expiresAt,
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
  });
  if (error) {
    const e = new Error('Failed to persist refresh token');
    e.code = 'TOKEN_STORE_FAILED';
    e.status = 500;
    throw e;
  }
  return { expiresAt };
}

/**
 * Rotate: validate the presented refresh token, revoke it, issue a
 * fresh access + refresh pair. Reuse of an already-revoked token is
 * treated as theft → revoke every token for that user.
 * Returns { accessToken, refreshToken, userId }.
 */
export async function rotateRefreshToken(rawToken, ipAddress, userAgent) {
  requireDb();
  const tokenHash = sha256(rawToken);

  const { data: row, error } = await supabase
    .from('refresh_tokens')
    .select('id, user_id, expires_at, revoked')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !row) {
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

  // Revoke the old token, mint and store the new one.
  await supabase.from('refresh_tokens').update({ revoked: true }).eq('id', row.id);

  const newRaw = generateRefreshToken();
  await storeRefreshToken(row.user_id, newRaw, ipAddress, userAgent);

  // Need current email/plan for the access token claims.
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id, email, plan')
    .eq('id', row.user_id)
    .single();

  if (userErr || !user) {
    const e = new Error('User not found for refresh token');
    e.code = 'AUTH_1008';
    e.status = 401;
    throw e;
  }

  const accessToken = generateAccessToken(user.id, user.email, user.plan);
  return { accessToken, refreshToken: newRaw, userId: user.id };
}

/** Revoke every refresh token for a user (logout-all / suspend). */
export async function revokeAllUserTokens(userId) {
  requireDb();
  const { error } = await supabase
    .from('refresh_tokens')
    .update({ revoked: true })
    .eq('user_id', userId)
    .eq('revoked', false);
  if (error) {
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
