/* ============================================================
   IQPREC — routes/app.js
   Authenticated, subscription-gated surface. Mounted at
   /api/v1/app behind verifyToken + checkSubscription (see index.js),
   so any request here without a valid token returns 401.
   ============================================================ */

import { Router } from 'express';

const router = Router();

// GET /api/v1/app/me — confirms the auth + subscription gates pass.
router.get('/me', (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user,
      subscription: req.subscription || null,
    },
    error: null,
    message: null,
  });
});

export default router;
