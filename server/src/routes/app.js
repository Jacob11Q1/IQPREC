/* ============================================================
   IQPREC — routes/app.js
   Authenticated, subscription-gated surface. Mounted at
   /api/v1/app behind verifyToken + checkSubscription (see index.js),
   so any request here without a valid token returns 401.
   ============================================================ */

import { Router } from 'express';

import { supabase, hasDb } from '../db/client.js';

const router = Router();

const ok = (res, data) =>
  res.json({ success: true, data, error: null, message: null });

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

/* ------------------------------------------------------------
   GET /api/v1/app/captain/latest
   The most recent captain recommendation generated for this user.
   Returns { hasRecommendation:false } until the AI captain feature
   (a later day) has written a row — the dashboard then shows the
   "Generate this week's captain pick" CTA instead of a card.
   ------------------------------------------------------------ */
router.get('/captain/latest', async (req, res, next) => {
  try {
    if (!hasDb()) return ok(res, { hasRecommendation: false });

    const { data, error } = await supabase
      .from('ai_recommendations')
      .select('id, type, gameweek, language, output_text, meta, created_at')
      .eq('user_id', req.user.userId)
      .eq('type', 'captain')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // `meta` may not exist as a column yet — fall back gracefully.
    if (error && /column .*meta/i.test(error.message || '')) {
      const retry = await supabase
        .from('ai_recommendations')
        .select('id, type, gameweek, language, output_text, created_at')
        .eq('user_id', req.user.userId)
        .eq('type', 'captain')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!retry.data) return ok(res, { hasRecommendation: false });
      return ok(res, { hasRecommendation: true, recommendation: retry.data });
    }

    if (!data) return ok(res, { hasRecommendation: false });
    return ok(res, { hasRecommendation: true, recommendation: data });
  } catch (err) {
    next(err);
  }
});

export default router;
