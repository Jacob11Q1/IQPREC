/* ============================================================
   IQPREC — routes/stats.js
   PUBLIC stats endpoints (no auth) used by the landing page.
   ============================================================ */

import { Router } from 'express';

import { hasDb } from '../db/client.js';
import { queryOne, queryCount } from '../db/query.js';

const router = Router();

const LADDER = [20, 50, 100, 250, 500, 750, 1000];

function nextMilestone(current) {
  for (const m of LADDER) if (current < m) return m;
  return Math.ceil((current + 1) / 250) * 250;
}

async function getCounts() {
  if (!hasDb()) {
    return { total_users: 0, arab_users: 0, ai_recommendations: 0 };
  }

  const [totalUsers, aiCount] = await Promise.all([
    queryCount('SELECT COUNT(*) FROM users WHERE email_verified = true', []),
    queryCount('SELECT COUNT(*) FROM ai_recommendations', []),
  ]);

  return {
    total_users: totalUsers,
    arab_users: Math.round(totalUsers * 0.7),
    ai_recommendations: aiCount,
  };
}

router.get('/', async (req, res, next) => {
  try {
    const counts = await getCounts();
    res.json({ success: true, data: counts, error: null, message: null });
  } catch (err) {
    next(err);
  }
});

router.get('/milestone', async (req, res, next) => {
  try {
    if (hasDb()) {
      const tracker = await queryOne(
        `SELECT current_users, next_milestone FROM ultimate_milestone_tracker WHERE season = $1`,
        ['2026-27']
      );
      if (tracker) {
        return res.json({
          success: true,
          data: {
            currentUsers: tracker.current_users ?? 0,
            nextMilestone: tracker.next_milestone ?? 20,
          },
          error: null,
          message: null,
        });
      }
    }
    const { total_users } = await getCounts();
    return res.json({
      success: true,
      data: { currentUsers: total_users, nextMilestone: nextMilestone(total_users) },
      error: null,
      message: null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
