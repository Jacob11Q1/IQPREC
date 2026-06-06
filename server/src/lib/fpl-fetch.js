/* ============================================================
   IQPREC — lib/fpl-fetch.js
   Resilient HTTP client for the official FPL API.
     • Base URL https://fantasy.premierleague.com/api/
     • Browser-like User-Agent (the FPL API blocks default agents).
     • 10s timeout per attempt (AbortController).
     • Retry on 5xx / network / timeout: backoff 1s, 2s, 4s (max 3).
     • Retry on 429: wait 5s × attempt before retrying.
     • 404 / other 4xx: throw immediately (no retry).
     • Concurrency limited to MAX_CONCURRENT (2) via a tiny semaphore.
   Throws FPL_3008 (service unavailable) when retries are exhausted, so
   callers can fall back to stale cache.
   ============================================================ */

const BASE_URL = 'https://fantasy.premierleague.com/api/';
const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const MAX_CONCURRENT = 2;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 IQPREC/1.0';

/* ------------------------------------------------------------
   Semaphore: at most MAX_CONCURRENT in-flight requests.
   ------------------------------------------------------------ */
let active = 0;
const waiters = [];

function acquire() {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((res) => waiters.push(res));
}

function release() {
  active -= 1;
  const next = waiters.shift();
  if (next) {
    active += 1;
    next();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildUrl(path) {
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return BASE_URL + clean;
}

function httpError(status, message) {
  const err = new Error(message || `FPL request failed (${status})`);
  err.status = status;
  if (status === 404) err.code = 'FPL_3004';
  else if (status === 429) err.code = 'FPL_3009';
  else if (status >= 500) err.code = 'FPL_3007';
  else err.code = 'FPL_3006';
  return err;
}

function unavailableError() {
  const err = new Error('FPL service is temporarily unavailable.');
  err.code = 'FPL_3008';
  err.status = 503;
  err.messageAr = 'خدمة بيانات FPL غير متاحة مؤقتاً. نعرض أحدث البيانات المتوفرة.';
  return err;
}

/**
 * fplFetch(path, options) — returns parsed JSON from the FPL API.
 * Honors the retry/timeout/concurrency policy described above.
 */
export async function fplFetch(path, options = {}) {
  await acquire();
  try {
    let lastErr = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

      try {
        const res = await fetch(buildUrl(path), {
          ...options,
          signal: controller.signal,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
            ...(options.headers || {}),
          },
        });
        clearTimeout(timer);

        // Hard 4xx (not 429) → no retry.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw httpError(res.status);
        }

        // 429 → wait 5s × attempt, then retry.
        if (res.status === 429) {
          lastErr = httpError(429);
          if (attempt < MAX_RETRIES) {
            await sleep(5_000 * (attempt + 1));
            continue;
          }
          break;
        }

        // 5xx → exponential backoff retry.
        if (res.status >= 500) {
          lastErr = httpError(res.status);
          if (attempt < MAX_RETRIES) {
            await sleep(1_000 * 2 ** attempt);
            continue;
          }
          break;
        }

        // 2xx/3xx → parse and return.
        return await res.json();
      } catch (err) {
        clearTimeout(timer);

        // Non-retryable hard 4xx errors bubble straight out.
        if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
          throw err;
        }

        // Network error / timeout (AbortError) → backoff retry.
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          await sleep(1_000 * 2 ** attempt);
          continue;
        }
      }
    }

    // All attempts exhausted on transient failures.
    console.error('[fpl-fetch] exhausted retries for', path, '-', lastErr?.message);
    throw unavailableError();
  } finally {
    release();
  }
}

export default fplFetch;
