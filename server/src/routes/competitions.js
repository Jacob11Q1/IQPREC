/* ============================================================
   IQPREC — routes/competitions.js   (mounted at /api/v1/competitions)
   PUBLIC reads for the competitions system.
   ============================================================ */

import { Router } from 'express';

import { hasDb } from '../db/client.js';
import { queryOne } from '../db/query.js';

const router = Router();

const ok = (res, data) =>
  res.json({ success: true, data, error: null, message: null });

router.get('/current', async (req, res, next) => {
  try {
    if (!hasDb()) return ok(res, { competition: null });

    const competition = await queryOne(
      `SELECT id, name, name_ar, milestone_target, status,
              prize_1st, prize_2nd, prize_3rd, start_date, end_date
       FROM competitions
       WHERE status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      []
    );

    return ok(res, { competition: competition || null });
  } catch (err) {
    next(err);
  }
});

export default router;
