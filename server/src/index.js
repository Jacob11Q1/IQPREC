/* ============================================================
   IQPREC — server entry point
   Express 5 with the full Pentagon edge wired in order:
     L4  helmet (strict CSP + nonce, HSTS, X-Frame DENY, no X-Powered-By)
     L4  CORS — single FRONTEND_URL origin, credentials on
         compression + cookie parser
     L1  Stripe raw-body mount BEFORE json (webhook signature)
     L1  express.json hard-capped at 10kb
     L1/L6 sanitizeInput (strip HTML / null bytes / NFC / trim)
     L3  global rate limit (100/60s/IP) across the API
         routes (auth-limited / token+subscription-gated / AI-limited)
         static frontend from public/
         global error handler
   ============================================================ */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { env, isProduction } from './config/env.js';
import { securityHeaders } from './middleware/security/helmet.config.js';
import { corsConfig } from './middleware/security/cors.config.js';
import { sanitizeInput } from './middleware/security/sanitize-input.js';
import { globalLimiter } from './middleware/security/rate-limiter.js';
import { mountApiRoutes } from './routes/index.js';
import { initFplJobs } from './jobs/fpl-sync.job.js';
import { initBillingJobs } from './jobs/billing-expiry.job.js';
import { webhookHandler } from './routes/billing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '..', '..', 'public');

const app = express();

// Behind Nginx on the VPS — trust the first proxy for correct client IPs
// (rate limiting keys on req.ip).
app.set('trust proxy', 1);

/* ---- L4: security headers (nonce → helmet → permissions policy) ---- */
app.disable('x-powered-by');
app.use(securityHeaders);

/* ---- L4: CORS — only the configured frontend origin ---- */
app.use(corsConfig);
// Preflight for every route.
app.options(/.*/, cors(corsConfig));

/* ---- Compression ---- */
app.use(compression());

/* ---- Cookies (httpOnly refresh token lives here) ---- */
app.use(cookieParser());

/* Stripe webhooks need the raw body for signature verification, so the
   raw parser + handler are mounted BEFORE express.json(). constructEvent
   requires the exact unparsed Buffer. */
app.post(
  '/api/v1/billing/webhook',
  express.raw({ type: 'application/json' }),
  webhookHandler
);

/* ---- L1: JSON / urlencoded body, hard 10kb cap ---- */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

/* ---- L1/L6: sanitise inputs (after body parse so req.body is populated) ---- */
app.use(sanitizeInput);

/* ---- L3: global rate limit across the whole API surface ----
   Applied to /api only — static assets are served directly (and sit
   behind Nginx in production), so they are never throttled here. */
app.use('/api', globalLimiter);

/* ---- API routes (health, stats, auth, app, ai + /api 404) ---- */
mountApiRoutes(app);

/* ---- Static: serve the pure-HTML frontend from public/ ---- */
app.use(
  express.static(PUBLIC_DIR, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

// Friendly root → landing page.
app.get('/', (req, res) => {
  res.sendFile(resolve(PUBLIC_DIR, 'index.html'));
});

/* ---- Global error handler ---- */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  // CORS rejection → 403 (don't leak as a 500).
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      data: null,
      error: 'CORS_REJECTED',
      message: 'Origin not allowed.',
    });
  }

  // Body-parser payload-too-large (L1 enforcement).
  const isPayloadError = err.type === 'entity.too.large';
  const message = isPayloadError
    ? 'Payload too large (max 10kb).'
    : isProduction
      ? 'Internal server error.'
      : err.message;

  if (status >= 500 && !isPayloadError) console.error('[error]', err);

  return res.status(isPayloadError ? 413 : status).json({
    success: false,
    data: null,
    error: isPayloadError ? 'PAYLOAD_TOO_LARGE' : err.code || 'SERVER_ERROR',
    message,
  });
});

const port = env.PORT || 3000;
app.listen(port, () => {
  console.log(
    `\n  IQPREC server — Intelligence. Precision. Every Gameweek.\n` +
      `  → http://localhost:${port}  [${env.NODE_ENV}]\n` +
      `  → serving frontend from ${PUBLIC_DIR}\n`
  );

  // FPL data engine: schedule sync (every 6h), Thursday cache flush,
  // and a cold-start sync if the bootstrap cache is empty.
  try {
    initFplJobs();
  } catch (err) {
    console.error('[startup] FPL jobs failed to init:', err?.message || err);
  }

  // Billing: daily season-pass expiry sweep (00:00 UTC).
  try {
    initBillingJobs();
  } catch (err) {
    console.error('[startup] billing jobs failed to init:', err?.message || err);
  }
});

export default app;
