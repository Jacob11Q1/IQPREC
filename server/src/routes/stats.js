/* ============================================================
   IQPREC — routes/stats.js
   PUBLIC stats endpoints (no auth) used by the landing page:
     GET /api/v1/stats            → headline counters
     GET /api/v1/stats/milestone  → competition milestone progress
   Numbers are placeholders until Supabase wiring (later day);
   the shape is stable so the frontend never needs to change.
   ============================================================ */

import { Router } from 'express';

import { supabase, hasDb } from '../db/client.js';

const router = Router();

// Milestone ladder (CLAUDE.md): 20, 50, 100, 250, 500, 750, 1000, then +250.
const LADDER = [20, 50, 100, 250, 500, 750, 1000];

function nextMilestone(current) {
  for (const m of LADDER) if (current < m) return m;
  return Math.ceil((current + 1) / 250) * 250;
}

/* Real Supabase aggregates. Single source so /stats and /stats/milestone
   stay consistent. Degrades to zeros when the DB isn't configured. */
async function getCounts() {
  if (!hasDb()) {
    return { total_users: 0, arab_users: 0, ai_recommendations: 0 };
  }

  const [usersRes, aiRes] = await Promise.all([
    supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('email_verified', true),
    supabase
      .from('ai_recommendations')
      .select('id', { count: 'exact', head: true }),
  ]);

  const totalUsers = usersRes.count || 0;
  return {
    total_users: totalUsers,
    // Estimate Arab users at ~70% until we have real location data.
    arab_users: Math.round(totalUsers * 0.7),
    ai_recommendations: aiRes.count || 0,
  };
}

// GET /api/v1/stats
router.get('/', async (req, res, next) => {
  try {
    const counts = await getCounts();
    res.json({ success: true, data: counts, error: null, message: null });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/stats/milestone
// Reads the live tracker (incremented on each paid activation); falls
// back to a verified-user count when the tracker row isn't present.
router.get('/milestone', async (req, res, next) => {
  try {
    if (hasDb()) {
      const { data: tracker } = await supabase
        .from('ultimate_milestone_tracker')
        .select('current_users, next_milestone')
        .eq('season', '2026-27')
        .maybeSingle();
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
