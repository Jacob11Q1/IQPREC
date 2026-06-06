/* ============================================================
   IQPREC — lib/redis.js
   ioredis connection used for rate limiting (Pentagon L3) and the
   JWT blacklist (Pentagon L2). Designed to FAIL OPEN for availability:
   if Redis is unreachable, callers fall back to in-memory behaviour
   instead of taking the whole API down.
   ============================================================ */

import Redis from 'ioredis';
import { env } from '../config/env.js';

let redis = null;
let redisReady = false;

if (env.REDIS_URL) {
  redis = new Redis(env.REDIS_URL, {
    // Don't queue commands forever while disconnected — fail fast so
    // callers can use their in-memory fallback.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: false,
    retryStrategy(times) {
      // Back off, but cap so we keep trying quietly in the background.
      return Math.min(times * 500, 5000);
    },
  });

  redis.on('ready', () => {
    redisReady = true;
    console.log('[redis] connected');
  });
  redis.on('end', () => {
    redisReady = false;
  });
  redis.on('error', (err) => {
    // Avoid log spam — only note the first transition to "down".
    if (redisReady) console.warn('[redis] connection error:', err.message);
    redisReady = false;
  });
} else {
  console.warn('[redis] REDIS_URL not set — using in-memory fallbacks.');
}

/** True only when a live Redis connection is usable right now. */
export function isRedisReady() {
  return Boolean(redis) && redisReady;
}

export { redis };
export default redis;
