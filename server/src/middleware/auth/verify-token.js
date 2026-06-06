/* ============================================================
   IQPREC — middleware/auth/verify-token.js  (Pentagon L2)
   Extracts the Bearer access token, verifies RS256 + blacklist,
   attaches the decoded payload to req.user.
     AUTH_1001 — missing token
     AUTH_1002 — invalid signature / malformed
     AUTH_1003 — expired
     AUTH_1004 — blacklisted in Redis
   ============================================================ */

import { verifyAccessToken } from '../../services/token.service.js';

function deny(res, status, code, message) {
  return res.status(status).json({
    success: false,
    data: null,
    error: code,
    message,
  });
}

export async function verifyToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return deny(res, 401, 'AUTH_1001', 'Missing authorization token.');
  }

  try {
    const payload = await verifyAccessToken(token);
    req.user = {
      userId: payload.userId,
      email: payload.email,
      plan: payload.plan,
    };
    req.token = token;
    return next();
  } catch (err) {
    if (err.code === 'AUTH_1004') {
      return deny(res, 401, 'AUTH_1004', 'Token has been revoked.');
    }
    if (err.name === 'TokenExpiredError') {
      return deny(res, 401, 'AUTH_1003', 'Access token expired.');
    }
    // JsonWebTokenError, NotBeforeError, or anything else → invalid.
    return deny(res, 401, 'AUTH_1002', 'Invalid access token.');
  }
}

export default verifyToken;
