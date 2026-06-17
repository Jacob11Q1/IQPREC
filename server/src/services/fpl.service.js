/* ============================================================
   IQPREC — services/fpl.service.js
   The FPL data engine. THE most important rule in IQPREC lives here:
   ACTIVE PLAYERS ONLY. After every bootstrap fetch we upsert every
   player returned by the API for the current season, and mark any
   player NOT in the response as status='removed'. This makes mid-season
   exits (e.g. Mohamed Salah leaving after 2025/26) disappear from every
   recommendation automatically — with zero hardcoded player names.
   ============================================================ */

import fplFetch from '../lib/fpl-fetch.js';
import * as cache from './cache.service.js';
import { pool, hasDb } from '../db/client.js';
import { queryOne, queryMany, execute } from '../db/query.js';

export const CURRENT_SEASON = '2026-27';

/* Cache keys (single source so routes + jobs stay consistent). */
const KEYS = {
  bootstrap: `fpl:bootstrap:${CURRENT_SEASON}`,
  fixtures: (gw) =>
    gw ? `fpl:fixtures:${CURRENT_SEASON}:gw${gw}` : `fpl:fixtures:${CURRENT_SEASON}:all`,
  player: (id) => `fpl:player:${id}:summary`,
  team: (id, gw) => `fpl:team:${id}:gw${gw}`,
  validate: (id) => `fpl:validate:${id}`,
  league: (id, page) => `fpl:league:${id}:page${page}`,
};

/* Arab-country nationality set — matched against nationality field if the
   FPL API exposes it. The API typically omits nationality, so we keep a
   curated set of known Arab FPL player IDs as a fallback. Both checks
   apply; the curated set wins to prevent flapping on each sync. */
const ARAB_COUNTRIES = new Set([
  'egypt', 'morocco', 'algeria', 'tunisia', 'saudi arabia', 'jordan',
  'palestine', 'libya', 'sudan', 'united arab emirates', 'uae', 'qatar',
  'kuwait', 'bahrain', 'oman', 'iraq', 'syria', 'lebanon', 'yemen',
  'eg', 'ma', 'dz', 'tn', 'sa', 'jo', 'ps', 'ly', 'sd', 'ae', 'qa',
  'kw', 'bh', 'om', 'iq', 'sy', 'lb', 'ye',
]);

const ARAB_PLAYER_IDS = new Set([
  381, // M.Salah — Egyptian (Liverpool)
  413, // Marmoush — Egyptian (Man City)
  402, // Aït-Nouri — Algerian (Man City)
]);

function isArabNationality(el) {
  if (ARAB_PLAYER_IDS.has(Number(el.id))) return true;
  const raw =
    el.nationality || el.country || el.region || el.birth_country || '';
  return ARAB_COUNTRIES.has(String(raw).trim().toLowerCase());
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------------
   ACTIVE PLAYERS ONLY — sync bootstrap players into PostgreSQL.
   Returns { active, removed }.
   ------------------------------------------------------------ */
async function syncPlayersToDb(bootstrap) {
  if (!hasDb()) {
    console.warn('[fpl] DB not configured — skipping player sync.');
    return { active: bootstrap?.elements?.length || 0, removed: 0 };
  }

  const elements = bootstrap.elements || [];
  const teamMap = new Map((bootstrap.teams || []).map((t) => [t.id, t.name]));
  const now = new Date().toISOString();

  if (!elements.length) return { active: 0, removed: 0 };

  // Build column arrays for efficient unnest bulk upsert (~700 rows at once).
  const ids = [], webNames = [], firstNames = [], secondNames = [];
  const teamIds = [], teamNames = [], elementTypes = [], nowCosts = [];
  const forms = [], totalPoints = [], minutes = [], goalsScored = [];
  const assists = [], cleanSheets = [], expectedGoals = [], expectedAssists = [];
  const selectedByPcts = [], statuses = [], newsArr = [], chanceOfPlayings = [];
  const photos = [], isArabPlayers = [], seasons = [], lastSyncedAts = [], updatedAts = [];

  for (const el of elements) {
    ids.push(el.id);
    webNames.push(el.web_name);
    firstNames.push(el.first_name || null);
    secondNames.push(el.second_name || null);
    teamIds.push(el.team);
    teamNames.push(teamMap.get(el.team) || null);
    elementTypes.push(el.element_type);
    nowCosts.push(el.now_cost);
    forms.push(num(el.form));
    totalPoints.push(num(el.total_points));
    minutes.push(num(el.minutes));
    goalsScored.push(num(el.goals_scored));
    assists.push(num(el.assists));
    cleanSheets.push(num(el.clean_sheets));
    expectedGoals.push(num(el.expected_goals));
    expectedAssists.push(num(el.expected_assists));
    selectedByPcts.push(num(el.selected_by_percent));
    statuses.push('available');
    newsArr.push(el.news || null);
    chanceOfPlayings.push(
      el.chance_of_playing_next_round ?? el.chance_of_playing_this_round ?? 100
    );
    photos.push(el.photo || null);
    isArabPlayers.push(isArabNationality(el));
    seasons.push(CURRENT_SEASON);
    lastSyncedAts.push(now);
    updatedAts.push(now);
  }

  await pool.query(
    `INSERT INTO fpl_players (
       id, web_name, first_name, second_name, team_id, team_name, element_type,
       now_cost, form, total_points, minutes, goals_scored, assists, clean_sheets,
       expected_goals, expected_assists, selected_by_percent, status, news,
       chance_of_playing, photo, is_arab_player, season, last_synced_at, updated_at
     )
     SELECT
       unnest($1::int[]),     unnest($2::text[]),      unnest($3::text[]),
       unnest($4::text[]),    unnest($5::int[]),        unnest($6::text[]),
       unnest($7::int[]),     unnest($8::int[]),        unnest($9::numeric[]),
       unnest($10::int[]),    unnest($11::int[]),       unnest($12::int[]),
       unnest($13::int[]),    unnest($14::int[]),       unnest($15::numeric[]),
       unnest($16::numeric[]),unnest($17::numeric[]),   unnest($18::text[]),
       unnest($19::text[]),   unnest($20::int[]),       unnest($21::text[]),
       unnest($22::bool[]),   unnest($23::text[]),      unnest($24::timestamptz[]),
       unnest($25::timestamptz[])
     ON CONFLICT (id) DO UPDATE SET
       web_name             = EXCLUDED.web_name,
       first_name           = EXCLUDED.first_name,
       second_name          = EXCLUDED.second_name,
       team_id              = EXCLUDED.team_id,
       team_name            = EXCLUDED.team_name,
       element_type         = EXCLUDED.element_type,
       now_cost             = EXCLUDED.now_cost,
       form                 = EXCLUDED.form,
       total_points         = EXCLUDED.total_points,
       minutes              = EXCLUDED.minutes,
       goals_scored         = EXCLUDED.goals_scored,
       assists              = EXCLUDED.assists,
       clean_sheets         = EXCLUDED.clean_sheets,
       expected_goals       = EXCLUDED.expected_goals,
       expected_assists     = EXCLUDED.expected_assists,
       selected_by_percent  = EXCLUDED.selected_by_percent,
       status               = EXCLUDED.status,
       news                 = EXCLUDED.news,
       chance_of_playing    = EXCLUDED.chance_of_playing,
       photo                = EXCLUDED.photo,
       is_arab_player       = EXCLUDED.is_arab_player,
       season               = EXCLUDED.season,
       last_synced_at       = EXCLUDED.last_synced_at,
       updated_at           = EXCLUDED.updated_at`,
    [
      ids, webNames, firstNames, secondNames, teamIds, teamNames, elementTypes,
      nowCosts, forms, totalPoints, minutes, goalsScored, assists, cleanSheets,
      expectedGoals, expectedAssists, selectedByPcts, statuses, newsArr,
      chanceOfPlayings, photos, isArabPlayers, seasons, lastSyncedAts, updatedAts,
    ]
  );

  // Mark every previously-known player NOT in this response as removed.
  const currentIds = new Set(elements.map((e) => e.id));
  const existing = await queryMany(
    `SELECT id FROM fpl_players WHERE season = $1 AND status != $2`,
    [CURRENT_SEASON, 'removed']
  );

  const toRemove = existing.map((r) => r.id).filter((id) => !currentIds.has(id));
  if (toRemove.length) {
    await execute(
      `UPDATE fpl_players SET status = 'removed', updated_at = $1 WHERE id = ANY($2::int[])`,
      [now, toRemove]
    );
  }

  const counts = { active: elements.length, removed: toRemove.length };
  console.log(`[fpl] sync → active players: ${counts.active}, removed: ${counts.removed}`);
  return counts;
}

/* ------------------------------------------------------------
   Stale-aware cache-aside. Returns { data, stale }.
   On fetch failure, falls back to a long-lived "<key>:stale" copy.
   ------------------------------------------------------------ */
async function cachedFetch(key, ttl, fetchFn) {
  const hit = await cache.get(key);
  if (hit !== null) return { data: hit, stale: false };

  try {
    const data = await fetchFn();
    await cache.set(key, data, ttl);
    await cache.set(`${key}:stale`, data, cache.TTL.STALE);
    return { data, stale: false };
  } catch (err) {
    const stale = await cache.get(`${key}:stale`);
    if (stale !== null) return { data: stale, stale: true };
    throw err;
  }
}

/* ------------------------------------------------------------
   Bootstrap
   ------------------------------------------------------------ */
async function fetchAndSyncBootstrap() {
  const data = await fplFetch('/bootstrap-static/');
  await syncPlayersToDb(data);
  return data;
}

/** getBootstrapResult() — { data, stale }. Use in routes for freshness. */
export async function getBootstrapResult() {
  return cachedFetch(KEYS.bootstrap, cache.TTL.BOOTSTRAP, fetchAndSyncBootstrap);
}

/** getBootstrap() — the full bootstrap payload (cached, syncs on miss). */
export async function getBootstrap() {
  return (await getBootstrapResult()).data;
}

/** refreshBootstrap() — force a fresh fetch + sync (cron). Returns counts. */
export async function refreshBootstrap() {
  const data = await fplFetch('/bootstrap-static/');
  const counts = await syncPlayersToDb(data);
  await cache.set(KEYS.bootstrap, data, cache.TTL.BOOTSTRAP);
  await cache.set(`${KEYS.bootstrap}:stale`, data, cache.TTL.STALE);
  return counts;
}

/* ------------------------------------------------------------
   Current gameweek
   ------------------------------------------------------------ */
export async function getCurrentGameweek() {
  const bootstrap = await getBootstrap();
  const events = bootstrap.events || [];
  let event = events.find((e) => e.is_current);
  if (!event) event = events.find((e) => !e.finished);
  if (!event) return { gameweek: null, deadlineTime: null };
  return {
    gameweek: event.id,
    deadlineTime: event.deadline_time,
    finished: Boolean(event.finished),
    isCurrent: Boolean(event.is_current),
  };
}

/* ------------------------------------------------------------
   Fixtures
   ------------------------------------------------------------ */
export async function getFixturesResult(gameweek) {
  const path = gameweek ? `/fixtures/?event=${gameweek}` : '/fixtures/';
  return cachedFetch(KEYS.fixtures(gameweek), cache.TTL.FIXTURES, () =>
    fplFetch(path)
  );
}

export async function getFixtures(gameweek) {
  return (await getFixturesResult(gameweek)).data;
}

/* ------------------------------------------------------------
   Player summary — current-season active players only.
   ------------------------------------------------------------ */
export async function getPlayerSummary(playerId) {
  const id = Number(playerId);

  if (hasDb()) {
    const row = await queryOne(
      `SELECT id FROM fpl_players WHERE id = $1 AND season = $2 AND status != $3`,
      [id, CURRENT_SEASON, 'removed']
    );
    if (!row) {
      throw Object.assign(
        new Error('Player not found in current FPL season'),
        { code: 'FPL_3010', status: 404 }
      );
    }
  }

  return cache.getOrSet(KEYS.player(id), cache.TTL.PLAYER_SUMMARY, () =>
    fplFetch(`/element-summary/${id}/`)
  );
}

/* ------------------------------------------------------------
   User team (picks + entry)
   ------------------------------------------------------------ */
export async function getUserTeam(fplTeamId, gameweek) {
  const id = Number(fplTeamId);
  return cache.getOrSet(KEYS.team(id, gameweek), cache.TTL.USER_TEAM, async () => {
    const [picks, entry] = await Promise.all([
      fplFetch(`/entry/${id}/event/${gameweek}/picks/`),
      fplFetch(`/entry/${id}/`),
    ]);
    return {
      picks: picks.picks || [],
      activeChip: picks.active_chip || null,
      teamName: entry.name || null,
      managerName: `${entry.player_first_name || ''} ${entry.player_last_name || ''}`.trim(),
      bankValue: (entry.last_deadline_bank ?? 0) / 10,
      teamValue: (entry.last_deadline_value ?? 0) / 10,
      transfersAvailable: entry.last_deadline_total_transfers ?? null,
      points: picks.entry_history?.total_points ?? entry.summary_overall_points ?? 0,
      gameweekPoints: picks.entry_history?.points ?? 0,
      overallRank: entry.summary_overall_rank ?? null,
    };
  });
}

/* ------------------------------------------------------------
   Validate a manager's FPL team ID
   ------------------------------------------------------------ */
export async function validateTeam(fplTeamId) {
  const id = Number(fplTeamId);
  return cache.getOrSet(KEYS.validate(id), cache.TTL.USER_TEAM, async () => {
    try {
      const entry = await fplFetch(`/entry/${id}/`);
      return {
        valid: true,
        teamName: entry.name || null,
        managerName: `${entry.player_first_name || ''} ${entry.player_last_name || ''}`.trim(),
      };
    } catch (err) {
      if (err.status === 404) return { valid: false };
      throw err;
    }
  });
}

/* ------------------------------------------------------------
   Mini-league standings
   ------------------------------------------------------------ */
export async function getMiniLeague(leagueId, page = 1) {
  const id = Number(leagueId);
  return cache.getOrSet(KEYS.league(id, page), cache.TTL.COMMUNITY, async () => {
    const data = await fplFetch(
      `/leagues-classic/${id}/standings/?page_standings=${page}`
    );
    return data.standings?.results || [];
  });
}

/* ------------------------------------------------------------
   Search — current-season active players ONLY (from PostgreSQL).
   ------------------------------------------------------------ */
export async function searchPlayers(query, elementType) {
  if (!hasDb()) return [];
  const q = String(query || '').replace(/[,()*%]/g, '').trim();
  if (q.length < 2) return [];

  const params = [CURRENT_SEASON, 'removed', `%${q}%`];
  let sql = `
    SELECT id, web_name, first_name, second_name, team_name, element_type,
           now_cost, form, total_points, selected_by_percent, status, is_arab_player
    FROM fpl_players
    WHERE season = $1 AND status != $2
      AND (web_name ILIKE $3 OR first_name ILIKE $3 OR second_name ILIKE $3)
  `;
  if (elementType) {
    params.push(Number(elementType));
    sql += ` AND element_type = $${params.length}`;
  }
  sql += ` LIMIT 10`;

  try {
    const rows = await queryMany(sql, params);
    return rows.filter((p) => p.status !== 'removed');
  } catch (err) {
    console.error('[fpl] searchPlayers failed:', err.message);
    return [];
  }
}

/* ------------------------------------------------------------
   Arab Stars Watch
   ------------------------------------------------------------ */
export async function getArabStars() {
  if (!hasDb()) return [];
  try {
    return await queryMany(
      `SELECT id, web_name, first_name, second_name, team_name, element_type,
              now_cost, form, total_points, goals_scored, assists,
              selected_by_percent, status, is_arab_player, photo
       FROM fpl_players
       WHERE season = $1 AND is_arab_player = true AND status != $2
       ORDER BY total_points DESC`,
      [CURRENT_SEASON, 'removed']
    );
  } catch (err) {
    console.error('[fpl] getArabStars failed:', err.message);
    return [];
  }
}

/* ------------------------------------------------------------
   Players-by-id helper (squad enrichment)
   ------------------------------------------------------------ */
export async function getPlayersByIds(ids) {
  if (!hasDb() || !ids?.length) return new Map();
  try {
    const rows = await queryMany(
      `SELECT id, web_name, team_name, element_type, now_cost, form,
              total_points, status, news, chance_of_playing, photo,
              expected_goals, expected_assists
       FROM fpl_players
       WHERE id = ANY($1::int[]) AND season = $2`,
      [ids, CURRENT_SEASON]
    );
    return new Map(rows.map((p) => [p.id, p]));
  } catch {
    return new Map();
  }
}

/* ============================================================
   CRITICAL — validatePlayers
   MUST be called before EVERY AI prompt build (lineup, captain,
   transfer, intel, differentials, chips, chat — no exceptions).
   ============================================================ */
export async function validatePlayers(playerIds) {
  const ids = (Array.isArray(playerIds) ? playerIds : [playerIds])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n));

  if (!ids.length) return true;

  if (!hasDb()) {
    throw Object.assign(new Error('Database not configured for validation'), {
      code: 'DB_UNAVAILABLE',
      status: 503,
    });
  }

  const rows = await queryMany(
    `SELECT id FROM fpl_players WHERE id = ANY($1::int[]) AND season = $2 AND status != $3`,
    [ids, CURRENT_SEASON, 'removed']
  );

  const validIds = new Set(rows.map((r) => r.id));
  const invalidPlayerIds = ids.filter((id) => !validIds.has(id));

  if (invalidPlayerIds.length) {
    const err = new Error('One or more players not found in current FPL season');
    err.code = 'FPL_3010';
    err.status = 422;
    err.invalidPlayerIds = invalidPlayerIds;
    throw err;
  }

  return true;
}

export default {
  CURRENT_SEASON,
  getBootstrap,
  getBootstrapResult,
  refreshBootstrap,
  getCurrentGameweek,
  getFixtures,
  getFixturesResult,
  getPlayerSummary,
  getUserTeam,
  validateTeam,
  getMiniLeague,
  searchPlayers,
  getArabStars,
  getPlayersByIds,
  validatePlayers,
};
