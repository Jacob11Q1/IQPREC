/* ============================================================
   IQPREC — routes/index.js
   Central API router. Imports every route file and mounts each with
   the correct middleware chain (Pentagon-aware ordering):

     /api/v1/health           public
     /api/v1/stats            public
     /api/v1/auth/*           authLimiter (5/15min/IP)
     /api/v1/app/*            verifyToken → checkSubscription
     /api/v1/ai/*             verifyToken → aiLimiter (10/60s/user)

   Any unmatched /api path returns a clean 404 envelope so the static
   frontend fallback never swallows an API call.
   ============================================================ */

import { Router } from 'express';

import { env } from '../config/env.js';
import statsRouter from './stats.js';
import authRouter from './auth.js';
import appRouter from './app.js';
import aiRouter from './ai.js';
import fplRouter from './fpl.js';
import billingRouter from './billing.js';
import competitionsRouter from './competitions.js';

import { authLimiter, aiLimiter } from '../middleware/security/rate-limiter.js';
import { verifyToken } from '../middleware/auth/verify-token.js';
import { checkSubscription } from '../middleware/auth/check-subscription.js';

const api = Router();

// ---- Public ----
api.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      service: 'iqprec',
      status: 'ok',
      env: env.NODE_ENV,
      time: new Date().toISOString(),
    },
    error: null,
    message: null,
  });
});

api.use('/stats', statsRouter);

// ---- Competitions (public reads; auto-opened on milestone triggers) ----
api.use('/competitions', competitionsRouter);

// ---- FPL data engine (public reads + per-route auth on squad endpoints) ----
api.use('/fpl', fplRouter);

// ---- Billing (authed checkout/status/portal/cancel; webhook is in index.js) ----
api.use('/billing', billingRouter);

// ---- Auth (L3: brute-force protection) ----
api.use('/auth', authLimiter, authRouter);

// ---- App (authenticated + subscription-gated) ----
api.use('/app', verifyToken, checkSubscription, appRouter);

// ---- AI (authenticated + subscription-gated + per-user AI limit) ----
api.use('/ai', verifyToken, checkSubscription, aiLimiter, aiRouter);

// ---- Unmatched API → clean 404 ----
api.use((req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    error: 'NOT_FOUND',
    message: `No API route for ${req.method} ${req.originalUrl}`,
  });
});

/** Mount the whole API under /api/v1 on the given app. */
export function mountApiRoutes(app) {
  app.use('/api/v1', api);
}

export default mountApiRoutes;
