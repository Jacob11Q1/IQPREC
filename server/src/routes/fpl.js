/* ============================================================
   IQPREC — routes/fpl.js   (mounted at /api/v1/fpl)
   Public read endpoints + authenticated, subscription-gated squad
   endpoints. globalLimiter is already applied to /api in index.js.
   Every data path enforces ACTIVE PLAYERS ONLY via fpl.service.
   ============================================================ */

import { Router } from 'express';

import * as fpl from '../services/fpl.service.js';
import * as cache from '../services/cache.service.js';
import { supabase, hasDb } from '../db/client.js';
import { verifyToken } from '../middleware/auth/verify-token.js';
import { checkSubscription } from '../middleware/auth/check-subscription.js';
import { createRateLimiter } from '../middleware/security/rate-limiter.js';

const router = Router();

const byUser = (req) => req.user?.userId || `ip:${req.ip}`;

/* Per-route limiters (in addition to the global 100/60s/IP). */
const validateTeamLimiter = createRateLimiter({
  name: 'fpl-validate',
  windowMs: 60_000,
  max: 10, // 10 per minute per user
  keyResolver: byUser,
});
const syncSquadLimiter = createRateLimiter({
  name: 'fpl-sync-squad',
  windowMs: 60 * 60_000,
  max: 3, // 3 per hour per user
  keyResolver: byUser,
});

const ok = (res, data) =>
  res.json({ success: true, data, error: null, message: null });

function fail(res, status, code, message, extra = {}) {
  return res.status(status).json({
    success: false,
    data: null,
    error: code,
    message,
    ...extra,
  });
}

function setFreshness(res, stale) {
  res.setHeader('X-Data-Freshness', stale ? 'stale' : 'fresh');
}

/* ============================================================
   PUBLIC routes
   ============================================================ */

// GET /api/v1/fpl/bootstrap — current gameweek + teams list (6h cache).
router.get('/bootstrap', async (req, res, next) => {
  try {
    const { data, stale } = await fpl.getBootstrapResult();
    setFreshness(res, stale);
    const events = data.events || [];
    const current =
      events.find((e) => e.is_current) || events.find((e) => !e.finished) || null;
    return ok(res, {
      gameweek: current ? current.id : null,
      deadlineTime: current ? current.deadline_time : null,
      teams: (data.teams || []).map((t) => ({
        id: t.id,
        name: t.name,
        short_name: t.short_name,
        strength: t.strength,
      })),
      totalPlayers: (data.elements || []).length,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/fpl/gameweek/current
router.get('/gameweek/current', async (req, res, next) => {
  try {
    const gw = await fpl.getCurrentGameweek();
    return ok(res, gw);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/fpl/fixtures?gw=
router.get('/fixtures', async (req, res, next) => {
  try {
    const gwRaw = req.query.gw;
    const gw = gwRaw != null && gwRaw !== '' ? Number(gwRaw) : null;
    if (gwRaw != null && gwRaw !== '' && !Number.isInteger(gw)) {
      return fail(res, 400, 'VALIDATION_ERROR', 'gw must be an integer.');
    }
    const { data, stale } = await fpl.getFixturesResult(gw);
    setFreshness(res, stale);
    return ok(res, data);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/fpl/stats/milestone — from ultimate_milestone_tracker.
router.get('/stats/milestone', async (req, res, next) => {
  try {
    if (!hasDb()) return ok(res, { currentUsers: 0, nextMilestone: 20 });
    const { data } = await supabase
      .from('ultimate_milestone_tracker')
      .select('current_users, next_milestone')
      .eq('season', fpl.CURRENT_SEASON)
      .maybeSingle();
    return ok(res, {
      currentUsers: data?.current_users ?? 0,
      nextMilestone: data?.next_milestone ?? 20,
    });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
   AUTHENTICATED routes (verifyToken → checkSubscription)
   ============================================================ */
const auth = [verifyToken, checkSubscription];

// GET /api/v1/fpl/players/search?q=&type=
router.get('/players/search', ...auth, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return fail(res, 400, 'VALIDATION_ERROR', 'Query must be at least 2 characters.');
    }
    const type = req.query.type ? Number(req.query.type) : undefined;
    const players = await fpl.searchPlayers(q, type);
    return ok(res, { players });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/fpl/players/:id — full stats, current-season active only.
router.get('/players/:id', ...auth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return fail(res, 400, 'VALIDATION_ERROR', 'Invalid player id.');
    }
    // getPlayerSummary throws FPL_3010 if the player isn't current/active.
    const summary = await fpl.getPlayerSummary(id);
    const baseMap = await fpl.getPlayersByIds([id]);
    return ok(res, { player: baseMap.get(id) || null, summary });
  } catch (err) {
    if (err.code === 'FPL_3010') {
      return fail(res, 404, 'FPL_3010', 'Player not found in current FPL season.');
    }
    next(err);
  }
});

// GET /api/v1/fpl/validate-team/:id — 10/min/user.
router.get('/validate-team/:id', ...auth, validateTeamLimiter, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return ok(res, { valid: false });
    }
    const result = await fpl.validateTeam(id);
    return ok(res, result);
  } catch (err) {
    next(err);
  }
});

/* Resolve the signed-in user's stored FPL team id. */
async function getUserFplTeamId(userId) {
  if (!hasDb()) return null;
  const { data } = await supabase
    .from('users')
    .select('fpl_team_id, fpl_team_name')
    .eq('id', userId)
    .maybeSingle();
  return data || null;
}

/* Build an enriched squad object from picks + current player rows. */
async function buildEnrichedSquad(fplTeamId, gameweek) {
  const team = await fpl.getUserTeam(fplTeamId, gameweek);
  const ids = team.picks.map((p) => p.element);
  const playerMap = await fpl.getPlayersByIds(ids);
  const picks = team.picks.map((p) => ({
    ...p,
    player: playerMap.get(p.element) || null,
  }));
  return { ...team, gameweek, picks };
}

// GET /api/v1/fpl/my-squad — enriched current-gameweek squad.
router.get('/my-squad', ...auth, async (req, res, next) => {
  try {
    const userRow = await getUserFplTeamId(req.user.userId);
    if (!userRow || !userRow.fpl_team_id) {
      return ok(res, { connected: false, squad: null });
    }
    const { gameweek } = await fpl.getCurrentGameweek();
    if (!gameweek) {
      return fail(res, 503, 'FPL_3008', 'Gameweek data unavailable. Try again shortly.');
    }
    const squad = await buildEnrichedSquad(userRow.fpl_team_id, gameweek);
    return ok(res, { connected: true, squad });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/fpl/sync-squad — force re-sync. 3/hour/user.
router.post('/sync-squad', ...auth, syncSquadLimiter, async (req, res, next) => {
  try {
    const userRow = await getUserFplTeamId(req.user.userId);
    if (!userRow || !userRow.fpl_team_id) {
      return fail(res, 400, 'FPL_NO_TEAM', 'No FPL team connected to your account.');
    }
    const { gameweek } = await fpl.getCurrentGameweek();
    // Bust the cached squad so the rebuild fetches fresh.
    await cache.del(`fpl:team:${userRow.fpl_team_id}:gw${gameweek}`);
    const squad = await buildEnrichedSquad(userRow.fpl_team_id, gameweek);
    return ok(res, { connected: true, squad });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/fpl/arab-stars — Arab players, current season, not removed.
router.get('/arab-stars', ...auth, async (req, res, next) => {
  try {
    const players = await fpl.getArabStars();
    return ok(res, { players });
  } catch (err) {
    next(err);
  }
});

export default router;
