/* ============================================================
   IQPREC — middleware/security/rate-limiter.js  (Pentagon L3)
   Sliding-window rate limiting backed by Redis sorted sets, with a
   graceful in-memory fallback when Redis is unavailable (fail open
   for availability, never take the API down).

   Tiers (CLAUDE.md L3):
     • auth   — 5 requests / 15 min  per IP
     • ai     — 10 requests / 60 sec per authenticated user
     • global — 100 requests / 60 sec per IP

   On limit: HTTP 429 + Retry-After header + JSON envelope.
   ============================================================ */

import { redis, isRedisReady } from '../../lib/redis.js';

/* ------------------------------------------------------------
   Redis sliding window (atomic via Lua).
   Returns { blocked, count, resetMs }.
   ------------------------------------------------------------ */
const SLIDING_WINDOW_LUA = `
local key    = KEYS[1]
local now    = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max    = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)

if count >= max then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local resetMs = window
  if oldest[2] then resetMs = (tonumber(oldest[2]) + window) - now end
  if resetMs < 0 then resetMs = 0 end
  return {1, count, resetMs}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {0, count + 1, window}
`;

async function redisHit(key, windowMs, max) {
  const now = Date.now();
  const member = `${now}-${Math.random().toString(36).slice(2)}`;
  const [blocked, count, resetMs] = await redis.eval(
    SLIDING_WINDOW_LUA,
    1,
    key,
    String(now),
    String(windowMs),
    String(max),
    member
  );
  return { blocked: blocked === 1, count, resetMs };
}

/* ------------------------------------------------------------
   In-memory fallback — Map<key, number[] timestamps>.
   Swept periodically so it can't grow unbounded.
   ------------------------------------------------------------ */
const memStore = new Map();

function memHit(key, windowMs, max) {
  const now = Date.now();
  const windowStart = now - windowMs;
  const hits = (memStore.get(key) || []).filter((t) => t > windowStart);

  if (hits.length >= max) {
    const resetMs = hits[0] + windowMs - now;
    memStore.set(key, hits);
    return { blocked: true, count: hits.length, resetMs: Math.max(0, resetMs) };
  }
  hits.push(now);
  memStore.set(key, hits);
  return { blocked: false, count: hits.length, resetMs: windowMs };
}

// Sweep stale keys every minute (longest window is 15 min).
const SWEEP_MS = 60_000;
const sweepTimer = setInterval(() => {
  const cutoff = Date.now() - 15 * 60_000;
  for (const [key, hits] of memStore) {
    const fresh = hits.filter((t) => t > cutoff);
    if (fresh.length) memStore.set(key, fresh);
    else memStore.delete(key);
  }
}, SWEEP_MS);
// Don't keep the event loop alive just for the sweeper.
if (sweepTimer.unref) sweepTimer.unref();

/* ------------------------------------------------------------
   Factory
   ------------------------------------------------------------ */
function createRateLimiter({ name, windowMs, max, keyResolver }) {
  return async function rateLimiter(req, res, next) {
    const id = keyResolver(req) || req.ip || 'unknown';
    const key = `rl:${name}:${id}`;

    let result;
    try {
      result = isRedisReady()
        ? await redisHit(key, windowMs, max)
        : memHit(key, windowMs, max);
    } catch {
      // Any Redis hiccup → fall back to in-memory rather than 500.
      result = memHit(key, windowMs, max);
    }

    // Informational headers on every response.
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, max - result.count))
    );

    if (result.blocked) {
      const retryAfterSec = Math.max(1, Math.ceil(result.resetMs / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        success: false,
        data: null,
        error: 'RATE_LIMITED',
        message: `Too many requests. Try again in ${retryAfterSec}s.`,
        retryAfter: retryAfterSec,
      });
    }

    return next();
  };
}

/* ------------------------------------------------------------
   Key resolvers
   ------------------------------------------------------------ */
const byIp = (req) => req.ip;
// AI limiter keys by authenticated user; falls back to IP pre-auth.
const byUser = (req) => req.user?.userId || `ip:${req.ip}`;

/* ------------------------------------------------------------
   Exported limiters
   ------------------------------------------------------------ */
export const authLimiter = createRateLimiter({
  name: 'auth',
  windowMs: 15 * 60_000, // 15 minutes
  max: 5,
  keyResolver: byIp,
});

export const aiLimiter = createRateLimiter({
  name: 'ai',
  windowMs: 60_000, // 60 seconds
  max: 10,
  keyResolver: byUser,
});

export const globalLimiter = createRateLimiter({
  name: 'global',
  windowMs: 60_000, // 60 seconds
  max: 100,
  keyResolver: byIp,
});

export { createRateLimiter };
