/* ============================================================
   IQPREC — routes/ai.js
   Claude-backed endpoints. Mounted at /api/v1/ai behind verifyToken +
   the AI rate limiter (10/60s/user). Real prompt-building (with
   validatePlayers() before every call) lands on a later day.
   ============================================================ */

import { Router } from 'express';

const router = Router();

function notImplemented(req, res) {
  res.status(501).json({
    success: false,
    data: null,
    error: 'NOT_IMPLEMENTED',
    message: 'AI endpoints are implemented in a later day.',
  });
}

router.post('/captain', notImplemented);
router.post('/lineup', notImplemented);
router.post('/transfer', notImplemented);
router.post('/differentials', notImplemented);
router.post('/chat', notImplemented);

export default router;
