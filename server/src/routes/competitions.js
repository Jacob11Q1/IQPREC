/* ============================================================
   IQPREC — routes/competitions.js   (mounted at /api/v1/competitions)
   PUBLIC reads for the competitions system. Competitions open
   automatically on milestone triggers (referral.service) and are
   publicly readable (RLS competitions_public_read). globalLimiter
   from index.js already protects this surface.
   ============================================================ */

import { Router } from 'express';

import { supabase, hasDb } from '../db/client.js';

const router = Router();

const ok = (res, data) =>
  res.json({ success: true, data, error: null, message: null });

/* ------------------------------------------------------------
   GET /api/v1/competitions/current
   The currently-open competition (status = 'active'), or null.
   ------------------------------------------------------------ */
router.get('/current', async (req, res, next) => {
  try {
    if (!hasDb()) return ok(res, { competition: null });

    const { data } = await supabase
      .from('competitions')
      .select(
        'id, name, name_ar, milestone_target, status, prize_1st, prize_2nd, prize_3rd, start_date, end_date'
      )
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return ok(res, { competition: data || null });
  } catch (err) {
    next(err);
  }
});

export default router;
