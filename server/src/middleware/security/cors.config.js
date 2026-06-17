/* ============================================================
   IQPREC — middleware/security/cors.config.js  (Pentagon L4)
   Allow ONLY the FRONTEND_URL origin. NEVER a wildcard — wildcard
   plus credentials is forbidden by the spec and by browsers anyway.
   Credentials enabled so the httpOnly refresh cookie can flow.
   ============================================================ */

import cors from 'cors';
import { env, isDevelopment } from '../../config/env.js';

const ALLOWED_ORIGIN = env.FRONTEND_URL || 'http://localhost:3000';

// In dev, also allow the Vite dev server origin so the React app can talk
// to Express without setting FRONTEND_URL in .env.
const DEV_ORIGINS = isDevelopment
  ? new Set([ALLOWED_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'])
  : new Set([ALLOWED_ORIGIN]);

export const corsConfig = cors({
  origin(origin, callback) {
    // Requests with no Origin header are same-origin / server-to-server
    // / curl — allow them. Browser cross-origin requests must match
    // the configured frontend origin(s).
    if (!origin || DEV_ORIGINS.has(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 600, // cache preflight 10 min
});

export default corsConfig;
