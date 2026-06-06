/* ============================================================
   IQPREC — middleware/security/helmet.config.js  (Pentagon L4)
   Full security-header stack:
     • Strict CSP (defaultSrc 'self'; scriptSrc 'self' + per-request
       nonce; styleSrc/fontSrc allow Google Fonts; frameSrc/objectSrc
       'none'; frameAncestors 'none' == X-Frame-Options: DENY).
     • HSTS max-age 1y, includeSubDomains, preload.
     • X-Content-Type-Options nosniff, Referrer-Policy, no X-Powered-By.
     • Permissions-Policy blocking camera / microphone / geolocation.
   Export `securityHeaders` — an ordered array of middleware to spread
   into app.use().
   ============================================================ */

import crypto from 'node:crypto';
import helmet from 'helmet';
import { isProduction } from '../../config/env.js';

/* Per-request CSP nonce. Any inline <script> may carry
   nonce="<%= cspNonce %>" — though IQPREC ships only external ES
   modules, so 'self' already covers every current script. */
export function cspNonce(req, res, next) {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
}

export const helmetConfig = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      scriptSrc: [
        "'self'",
        (req, res) => `'nonce-${res.locals.cspNonce}'`,
      ],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"], // == X-Frame-Options: DENY
      formAction: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
      // Force HTTPS in production only (would break http://localhost in dev).
      ...(isProduction ? { upgradeInsecureRequests: [] } : {}),
    },
  },
  // Google Fonts are cross-origin; COEP would block them.
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' }, // X-Frame-Options: DENY
  noSniff: true, // X-Content-Type-Options: nosniff
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // X-Powered-By is also removed via app.disable() in index.js.
  hidePoweredBy: true,
});

/* Permissions-Policy is no longer managed by Helmet — set it directly. */
export function permissionsPolicy(req, res, next) {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );
  next();
}

/** Ordered header middleware: nonce → helmet → permissions policy. */
export const securityHeaders = [cspNonce, helmetConfig, permissionsPolicy];

export default securityHeaders;
