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
import { supabase, hasDb } from '../db/client.js';

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

/* Arab-country nationality set for the Arab Stars Watch (data-driven —
   matched against whatever nationality field the FPL API exposes; NO
   player names are ever hardcoded). */
const ARAB_COUNTRIES = new Set([
  'egypt', 'morocco', 'algeria', 'tunisia', 'saudi arabia', 'jordan',
  'palestine', 'libya', 'sudan', 'united arab emirates', 'uae', 'qatar',
  'kuwait', 'bahrain', 'oman', 'iraq', 'syria', 'lebanon', 'yemen',
  // ISO-ish codes the API sometimes uses
  'eg', 'ma', 'dz', 'tn', 'sa', 'jo', 'ps', 'ly', 'sd', 'ae', 'qa',
  'kw', 'bh', 'om', 'iq', 'sy', 'lb', 'ye',
]);

function isArabNationality(el) {
  // The public bootstrap doesn't reliably expose nationality; check the
  // candidate fields defensively so this lights up if/when it does.
  const raw =
    el.nationality || el.country || el.region || el.birth_country || '';
  return ARAB_COUNTRIES.has(String(raw).trim().toLowerCase());
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------------
   ACTIVE PLAYERS ONLY — sync bootstrap players into Supabase.
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

  // 1–3) Build upsert rows from every player in the response.
  const rows = elements.map((el) => ({
    id: el.id,
    web_name: el.web_name,
    first_name: el.first_name,
    second_name: el.second_name,
    team_id: el.team,
    team_name: teamMap.get(el.team) || null,
    element_type: el.element_type,
    now_cost: el.now_cost,
    form: num(el.form),
    total_points: num(el.total_points),
    minutes: num(el.minutes),
    goals_scored: num(el.goals_scored),
    assists: num(el.assists),
    clean_sheets: num(el.clean_sheets),
    expected_goals: num(el.expected_goals),
    expected_assists: num(el.expected_assists),
    selected_by_percent: num(el.selected_by_percent),
    status: 'available', // present in bootstrap ⇒ active this season
    news: el.news || null,
    chance_of_playing:
      el.chance_of_playing_next_round ?? el.chance_of_playing_this_round ?? 100,
    photo: el.photo || null,
    is_arab_player: isArabNationality(el),
    season: CURRENT_SEASON,
    last_synced_at: now,
    updated_at: now,
  }));

  // 2) Upsert all players (conflict on primary key id).
  if (rows.length) {
    const { error } = await supabase
      .from('fpl_players')
      .upsert(rows, { onConflict: 'id' });
    if (error) {
      console.error('[fpl] player upsert failed:', error.message);
      throw Object.assign(new Error('Player sync failed'), { code: 'FPL_3011' });
    }
  }

  // 4) Mark every previously-known player NOT in this response as removed.
  const currentIds = new Set(elements.map((e) => e.id));
  const { data: existing } = await supabase
    .from('fpl_players')
    .select('id')
    .eq('season', CURRENT_SEASON)
    .neq('status', 'removed');

  const toRemove = (existing || [])
    .map((r) => r.id)
    .filter((id) => !currentIds.has(id));

  if (toRemove.length) {
    await supabase
      .from('fpl_players')
      .update({ status: 'removed', updated_at: now })
      .in('id', toRemove);
  }

  // 5) Log the active/removed tallies.
  const counts = { active: rows.length, removed: toRemove.length };
  console.log(
    `[fpl] sync → active players: ${counts.active}, removed: ${counts.removed}`
  );
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
    throw err; // FPL_3008 (or hard 4xx) bubbles to the caller
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
    const { data: player } = await supabase
      .from('fpl_players')
      .select('id')
      .eq('id', id)
      .eq('season', CURRENT_SEASON)
      .neq('status', 'removed')
      .maybeSingle();
    if (!player) {
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
   Search — current-season active players ONLY (from Supabase).
   ------------------------------------------------------------ */
export async function searchPlayers(query, elementType) {
  if (!hasDb()) return [];
  // Strip characters that would break the PostgREST or() filter syntax.
  const q = String(query || '').replace(/[,()*%]/g, '').trim();
  if (q.length < 2) return [];

  let builder = supabase
    .from('fpl_players')
    .select(
      'id, web_name, first_name, second_name, team_name, element_type, now_cost, form, total_points, selected_by_percent, status, is_arab_player'
    )
    .eq('season', CURRENT_SEASON)
    .neq('status', 'removed')
    .or(`web_name.ilike.%${q}%,first_name.ilike.%${q}%,second_name.ilike.%${q}%`)
    .limit(10);

  if (elementType) builder = builder.eq('element_type', Number(elementType));

  const { data, error } = await builder;
  if (error) {
    console.error('[fpl] searchPlayers failed:', error.message);
    return [];
  }
  // Defense-in-depth: never leak a removed player even if a filter slips.
  return (data || []).filter((p) => p.status !== 'removed');
}

/* ------------------------------------------------------------
   Arab Stars Watch
   ------------------------------------------------------------ */
export async function getArabStars() {
  if (!hasDb()) return [];
  const { data, error } = await supabase
    .from('fpl_players')
    .select(
      'id, web_name, first_name, second_name, team_name, element_type, now_cost, form, total_points, goals_scored, assists, selected_by_percent, status, is_arab_player'
    )
    .eq('season', CURRENT_SEASON)
    .eq('is_arab_player', true)
    .neq('status', 'removed')
    .order('total_points', { ascending: false });
  if (error) {
    console.error('[fpl] getArabStars failed:', error.message);
    return [];
  }
  return data || [];
}

/* ------------------------------------------------------------
   Players-by-id helper (squad enrichment)
   ------------------------------------------------------------ */
export async function getPlayersByIds(ids) {
  if (!hasDb() || !ids?.length) return new Map();
  const { data } = await supabase
    .from('fpl_players')
    .select(
      'id, web_name, team_name, element_type, now_cost, form, total_points, status, news, chance_of_playing'
    )
    .in('id', ids)
    .eq('season', CURRENT_SEASON);
  return new Map((data || []).map((p) => [p.id, p]));
}

/* ============================================================
   CRITICAL — validatePlayers
   MUST be called before EVERY AI prompt build (lineup, captain,
   transfer, intel, differentials, chips, chat — no exceptions).
   Rejects any player that is not registered + active in the CURRENT
   FPL season, so the AI can never recommend a retired/transferred
   player (this is what makes Salah-style exits vanish automatically).

   @param {number[]} playerIds  FPL element IDs to validate.
   @returns {Promise<true>}     when ALL ids are current-season active.
   @throws  {Error}             code FPL_3010 with .invalidPlayerIds[]
                                when any id is missing/removed.
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

  const { data, error } = await supabase
    .from('fpl_players')
    .select('id')
    .in('id', ids)
    .eq('season', CURRENT_SEASON)
    .neq('status', 'removed');

  if (error) {
    throw Object.assign(new Error('Player validation query failed'), {
      code: 'FPL_3012',
      status: 500,
    });
  }

  const validIds = new Set((data || []).map((r) => r.id));
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
