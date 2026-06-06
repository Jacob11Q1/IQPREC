/* ============================================================
   IQPREC — services/cache.service.js
   Thin, fail-safe Redis cache wrapper over lib/redis.js.
   Every method degrades gracefully: if Redis is down, reads return
   null (cache miss) and writes are skipped — the caller's source of
   truth (FPL API / Supabase) still works. Methods NEVER throw on a
   Redis error; only fetchFn errors inside getOrSet propagate.
   NOTE: invalidatePattern uses SCAN (non-blocking) — never KEYS.
   ============================================================ */

import { redis, isRedisReady } from '../lib/redis.js';

/* ---- TTL constants (seconds) ---- */
export const TTL = {
  BOOTSTRAP: 6 * 60 * 60, // 6 hours
  FIXTURES: 1 * 60 * 60, // 1 hour
  PLAYER_SUMMARY: 2 * 60 * 60, // 2 hours
  USER_TEAM: 30 * 60, // 30 minutes
  AI_PLAYER_INTEL: 24 * 60 * 60, // 24 hours
  AI_DIFFERENTIALS: 12 * 60 * 60, // 12 hours
  COMMUNITY: 30 * 60, // 30 minutes
  MILESTONE: 5 * 60, // 5 minutes
  STALE: 7 * 24 * 60 * 60, // 7 days — stale-fallback companion copies
};

/**
 * get(key) — Redis GET + JSON.parse. Returns null on miss, parse error,
 * or any Redis failure. Never throws.
 */
export async function get(key) {
  if (!isRedisReady()) return null;
  try {
    const raw = await redis.get(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * set(key, value, ttlSeconds) — JSON.stringify + SET EX. If Redis is
 * unavailable, logs a warning and returns without throwing.
 */
export async function set(key, value, ttlSeconds) {
  if (!isRedisReady()) {
    console.warn(`[cache] Redis unavailable — skipping set "${key}"`);
    return;
  }
  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await redis.set(key, payload, 'EX', ttlSeconds);
    } else {
      await redis.set(key, payload);
    }
  } catch (err) {
    console.warn(`[cache] set failed for "${key}":`, err?.message);
  }
}

/**
 * getOrSet(key, ttlSeconds, fetchFn) — cache-aside.
 * On hit: returns the parsed cached value.
 * On miss: awaits fetchFn(), caches the result (best-effort), returns it.
 * If fetchFn throws, the value is NOT cached and the error is re-thrown.
 */
export async function getOrSet(key, ttlSeconds, fetchFn) {
  const cached = await get(key);
  if (cached !== null) return cached;

  const value = await fetchFn(); // may throw → propagate, do not cache
  await set(key, value, ttlSeconds);
  return value;
}

/**
 * invalidatePattern(prefix) — delete every key matching `prefix*` using
 * SCAN (cursor-based, non-blocking) with COUNT 100. NEVER uses KEYS.
 * Returns the number of keys removed.
 */
export async function invalidatePattern(prefix) {
  if (!isRedisReady()) return 0;
  let cursor = '0';
  let removed = 0;
  try {
    do {
      const [next, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        100
      );
      cursor = next;
      if (keys.length) {
        await redis.del(...keys);
        removed += keys.length;
      }
    } while (cursor !== '0');
  } catch (err) {
    console.warn(`[cache] invalidatePattern("${prefix}") failed:`, err?.message);
  }
  return removed;
}

/** del(key) — delete a single key. Silent no-op if Redis is unavailable. */
export async function del(key) {
  if (!isRedisReady()) return;
  try {
    await redis.del(key);
  } catch (err) {
    console.warn(`[cache] del failed for "${key}":`, err?.message);
  }
}

/** exists(key) — true if the key is present (used for cold-start checks). */
export async function exists(key) {
  if (!isRedisReady()) return false;
  try {
    return (await redis.exists(key)) === 1;
  } catch {
    return false;
  }
}

export default { TTL, get, set, getOrSet, invalidatePattern, del, exists };
