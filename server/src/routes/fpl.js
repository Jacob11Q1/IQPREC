/* ============================================================
   IQPREC — routes/fpl.js   (mounted at /api/v1/fpl)
   Public read endpoints + authenticated, subscription-gated squad
   endpoints. globalLimiter is already applied to /api in index.js.
   Every data path enforces ACTIVE PLAYERS ONLY via fpl.service.
   ============================================================ */

import { Router } from 'express';

import * as fpl from '../services/fpl.service.js';
import * as cache from '../services/cache.service.js';
import { hasDb } from '../db/client.js';
import { queryOne } from '../db/query.js';
import { verifyToken } from '../middleware/auth/verify-token.js';
import { checkSubscription } from '../middleware/auth/check-subscription.js';
import { createRateLimiter } from '../middleware/security/rate-limiter.js';

const router = Router();

const byUser = (req) => req.user?.userId || `ip:${req.ip}`;

const validateTeamLimiter = createRateLimiter({
  name: 'fpl-validate',
  windowMs: 60_000,
  max: 10,
  keyResolver: byUser,
});
const syncSquadLimiter = createRateLimiter({
  name: 'fpl-sync-squad',
  windowMs: 60 * 60_000,
  max: 3,
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

router.get('/gameweek/current', async (req, res, next) => {
  try {
    const gw = await fpl.getCurrentGameweek();
    return ok(res, gw);
  } catch (err) {
    next(err);
  }
});

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

router.get('/stats/milestone', async (req, res, next) => {
  try {
    if (!hasDb()) return ok(res, { currentUsers: 0, nextMilestone: 20 });
    const tracker = await queryOne(
      `SELECT current_users, next_milestone FROM ultimate_milestone_tracker WHERE season = $1`,
      [fpl.CURRENT_SEASON]
    );
    return ok(res, {
      currentUsers: tracker?.current_users ?? 0,
      nextMilestone: tracker?.next_milestone ?? 20,
    });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
   AUTHENTICATED routes (verifyToken → checkSubscription)
   ============================================================ */
const auth = [verifyToken, checkSubscription];

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

router.get('/players/:id', ...auth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return fail(res, 400, 'VALIDATION_ERROR', 'Invalid player id.');
    }
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

async function getUserFplTeamId(userId) {
  if (!hasDb()) return null;
  return queryOne(
    'SELECT fpl_team_id, fpl_team_name FROM users WHERE id = $1',
    [userId]
  );
}

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

router.post('/sync-squad', ...auth, syncSquadLimiter, async (req, res, next) => {
  try {
    const userRow = await getUserFplTeamId(req.user.userId);
    if (!userRow || !userRow.fpl_team_id) {
      return fail(res, 400, 'FPL_NO_TEAM', 'No FPL team connected to your account.');
    }
    const { gameweek } = await fpl.getCurrentGameweek();
    await cache.del(`fpl:team:${userRow.fpl_team_id}:gw${gameweek}`);
    const squad = await buildEnrichedSquad(userRow.fpl_team_id, gameweek);
    return ok(res, { connected: true, squad });
  } catch (err) {
    next(err);
  }
});

router.get('/arab-stars', async (req, res, next) => {
  try {
    const players = await fpl.getArabStars();
    return ok(res, players);
  } catch (err) {
    next(err);
  }
});

router.get('/mini-league/:id', ...auth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return fail(res, 400, 'VALIDATION_ERROR', 'Invalid league id.');
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const standings = await fpl.getMiniLeague(id, page);
    return ok(res, { standings, leagueId: id, page });
  } catch (err) {
    if (err.code === 'FPL_3004') {
      return fail(res, 404, 'FPL_3004', 'Mini-league not found.');
    }
    next(err);
  }
});

export default router;
