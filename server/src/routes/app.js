/* ============================================================
   IQPREC — routes/app.js
   Authenticated, subscription-gated surface. Mounted at
   /api/v1/app behind verifyToken + checkSubscription.
   ============================================================ */

import { Router } from 'express';
import { z } from 'zod';

import { hasDb } from '../db/client.js';
import { queryOne, execute } from '../db/query.js';
import { validateBody } from '../middleware/security/validate-body.js';

const router = Router();

const ok = (res, data) =>
  res.json({ success: true, data, error: null, message: null });

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

const profileSchema = z.object({
  fplTeamId: z.number().int().positive().max(999_999_999).nullable().optional(),
  language: z.enum(['ar', 'en']).optional(),
  fullName: z.string().trim().max(120).optional(),
});

router.put('/profile', validateBody(profileSchema), async (req, res, next) => {
  try {
    if (!hasDb()) return res.status(503).json({ success: false, data: null, error: 'DB_UNAVAILABLE', message: 'Unavailable.' });

    const { fplTeamId, language, fullName } = req.body;
    const sets = [];
    const params = [];

    if (fplTeamId !== undefined) { params.push(fplTeamId); sets.push(`fpl_team_id = $${params.length}`); }
    if (language !== undefined)  { params.push(language);  sets.push(`language = $${params.length}`); }
    if (fullName !== undefined)  { params.push(fullName);  sets.push(`full_name = $${params.length}`); }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, data: null, error: 'APP_4001', message: 'Nothing to update.' });
    }

    params.push(req.user.userId);
    await execute(
      `UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`,
      params
    );

    return res.json({ success: true, data: null, error: null, message: 'Profile updated.' });
  } catch (err) {
    next(err);
  }
});

router.get('/captain/latest', async (req, res, next) => {
  try {
    if (!hasDb()) return ok(res, { hasRecommendation: false });

    const rec = await queryOne(
      `SELECT id, type, gameweek, language, output_text, meta, created_at
       FROM ai_recommendations
       WHERE user_id = $1 AND type = 'captain'
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.userId]
    );

    if (!rec) return ok(res, { hasRecommendation: false });
    return ok(res, { hasRecommendation: true, recommendation: rec });
  } catch (err) {
    next(err);
  }
});

export default router;
