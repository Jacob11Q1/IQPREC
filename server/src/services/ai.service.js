/* ============================================================
   IQPREC — services/ai.service.js
   The core AI engine. Everything that talks to Claude flows through
   here so the rules are enforced in ONE place.
   ============================================================ */

import Anthropic from '@anthropic-ai/sdk';

import { env } from '../config/env.js';
import { redis, isRedisReady } from '../lib/redis.js';
import { hasDb } from '../db/client.js';
import { queryOne, queryMany, execute } from '../db/query.js';
import { getFixtures, getBootstrap, CURRENT_SEASON } from './fpl.service.js';

const hasRealKey =
  Boolean(env.ANTHROPIC_API_KEY) && !env.ANTHROPIC_API_KEY.startsWith('will_add');
const anthropic = hasRealKey ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
if (!hasRealKey) {
  console.warn('[ai] ANTHROPIC_API_KEY not configured — AI endpoints return AI_5000.');
}

const MODEL = env.ANTHROPIC_MODEL || 'claude-opus-4-8';

const AI_RATE_MAX = 10;
const AI_RATE_WINDOW_SEC = 60;

const POSITION_NAME = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

/* ============================================================
   buildSystemPrompt(language)
   ============================================================ */
export function buildSystemPrompt(language = 'ar') {
  const lang = language === 'en' ? 'en' : 'ar';

  return `You are IQPREC — the world's first Arabic-first AI Fantasy Premier
League intelligence system. You were built by Jacob Qumsiyeh and Simon Haddad
from Beit Sahour, Palestine.
Your purpose: help Arab FPL managers make smarter decisions every gameweek.
You have access to real-time FPL data, personal squad context, and Arab
community ownership data that no other tool has.

LANGUAGE: The user's language is "${lang}".
If language is "ar" respond ENTIRELY in Arabic. Use a natural Levantine
dialect for the conversational parts and standard Arabic for the analytical
content. Use these Arabic FPL terms: Jawla (gameweek), Kaptin (captain),
Inteqal (transfer), Tashkila (lineup), Al-Form (form), Waraqat Al-Badal
(wildcard), Tazeez Al-Ihtyati (bench boost), Fariq (differential).
If language is "en" respond entirely in English.

PERSONALITY: You are confident, direct, and passionate about FPL. You explain
your reasoning clearly. You never hedge excessively. You are proud of being
built for the Arab community.

SCOPE: You ONLY discuss Fantasy Premier League topics. If asked about anything
else, respond in the user's language with the equivalent of:
"I am specialized in FPL only. Ask me about your squad, captain, transfers, or
anything FPL related."

ACTIVE PLAYERS ONLY: You only recommend players who are currently active in the
FPL ${CURRENT_SEASON} season. Never recommend retired or transferred players.
Player data is injected into every prompt — rely ONLY on the players given to
you, never on memory of past seasons.

CAPTAIN RULES:
- Fixture FDR 1 or 2 strongly preferred.
- Home games add a 0.5 confidence bonus.
- Form below 5.0 eliminates a player.
- Below 75% chance of playing eliminates a player.
- If the top pick is owned by over 65% of mini-league rivals, flag a
  differential alternative.

TRANSFER RULES:
- Never recommend a hit for less than 6 expected points gain.
- Wildcard signal: 4 or more players with form below 3.0 and hard fixtures.
- Never sell premium assets without a confirmed injury.

CHIP RULES:
- Triple Captain only on a confirmed Double Gameweek.
- Bench Boost with maximum bench coverage.
- Free Hit on a Blank Gameweek.
- Wildcard before a Double Gameweek run.

DIFFERENTIAL SIGNAL:
Under 10% ownership PLUS form above 6 PLUS FDR 2 or below equals a strong pick.

Be concise, structured, and decisive. When you give picks, number them and
give a confidence percentage and the single clearest reason for each.`;
}

/* ============================================================
   callClaude(messages, systemPrompt, options)
   ============================================================ */
export async function callClaude(messages, systemPrompt, options = {}) {
  const {
    stream = false,
    maxTokens = 1000,
    userId = null,
    type = 'chat',
    gameweek = null,
    language = 'ar',
    meta = null,
  } = options;

  if (!anthropic) {
    throw Object.assign(new Error('AI is not configured.'), {
      code: 'AI_5000',
      status: 503,
    });
  }

  if (userId) {
    const gate = await checkAiRateLimit(userId);
    if (gate.blocked) {
      throw Object.assign(new Error('AI rate limit exceeded.'), {
        code: 'AI_4001',
        status: 429,
        retryAfter: gate.retryAfter,
      });
    }
  }

  if (stream) {
    return anthropic.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });
  }

  const started = Date.now();
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  });
  const latencyMs = Date.now() - started;

  const text =
    response?.content?.find((b) => b.type === 'text')?.text ??
    response?.content?.[0]?.text ??
    '';

  await logRecommendation({
    userId,
    type,
    gameweek,
    language,
    outputText: text,
    promptTokens: response?.usage?.input_tokens ?? 0,
    completionTokens: response?.usage?.output_tokens ?? 0,
    latencyMs,
    cached: false,
    meta,
  });

  return text;
}

/* ------------------------------------------------------------
   Per-user AI rate limit — fixed 60s window via Redis INCR.
   ------------------------------------------------------------ */
async function checkAiRateLimit(userId) {
  if (!isRedisReady()) return { blocked: false, retryAfter: 0 };
  const key = `ai:rl:${userId}`;
  try {
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, AI_RATE_WINDOW_SEC);
    if (count > AI_RATE_MAX) {
      let ttl = await redis.ttl(key);
      if (ttl < 0) ttl = AI_RATE_WINDOW_SEC;
      return { blocked: true, retryAfter: ttl };
    }
    return { blocked: false, retryAfter: 0 };
  } catch {
    return { blocked: false, retryAfter: 0 };
  }
}

/* ------------------------------------------------------------
   logRecommendation — append to ai_recommendations (best-effort).
   ------------------------------------------------------------ */
export async function logRecommendation({
  userId,
  type,
  gameweek = null,
  language = 'ar',
  outputText = '',
  promptTokens = 0,
  completionTokens = 0,
  latencyMs = 0,
  cached = false,
  meta = null,
}) {
  if (!hasDb() || !userId) return;
  try {
    await execute(
      `INSERT INTO ai_recommendations
         (user_id, type, gameweek, language, output_text,
          prompt_tokens, completion_tokens, latency_ms, cached, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [userId, type, gameweek, language, outputText,
       promptTokens, completionTokens, latencyMs, cached,
       meta ? JSON.stringify(meta) : null]
    );
  } catch (err) {
    console.warn('[ai] logRecommendation failed:', err?.message);
  }
}

/* ============================================================
   getCachedOrGenerate(cacheKey, ttlSeconds, generateFn)
   DB-backed (ai_cache) response cache. Returns { text, cached }.
   ============================================================ */
export async function getCachedOrGenerate(cacheKey, ttlSeconds, generateFn) {
  if (hasDb()) {
    try {
      const row = await queryOne(
        `SELECT id, response_text, hit_count, expires_at FROM ai_cache WHERE cache_key = $1`,
        [cacheKey]
      );
      if (row && new Date(row.expires_at).getTime() > Date.now()) {
        execute(
          `UPDATE ai_cache SET hit_count = hit_count + 1 WHERE id = $1`,
          [row.id]
        ).catch(() => {});
        return { text: row.response_text, cached: true };
      }
    } catch (err) {
      console.warn('[ai] cache read failed:', err?.message);
    }
  }

  const text = await generateFn();

  if (hasDb()) {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
      await execute(
        `INSERT INTO ai_cache (cache_key, response_text, expires_at, hit_count)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (cache_key) DO UPDATE SET
           response_text = EXCLUDED.response_text,
           expires_at    = EXCLUDED.expires_at,
           hit_count     = 0,
           updated_at    = NOW()`,
        [cacheKey, text, expiresAt]
      );
    } catch (err) {
      console.warn('[ai] cache write failed:', err?.message);
    }
  }

  return { text, cached: false };
}

/* ============================================================
   buildPlayerContext(players, fixtureMap)
   ============================================================ */
export function buildPlayerContext(players, fixtureMap = new Map()) {
  if (!Array.isArray(players) || !players.length) return 'No players provided.';

  return players
    .map((p) => {
      const price = (Number(p.now_cost ?? 0) / 10).toFixed(1);
      const pos = POSITION_NAME[p.element_type] || '—';
      const next = (fixtureMap.get(p.team_id) || [])
        .slice(0, 3)
        .map((f) => `${f.opp}(${f.home ? 'H' : 'A'},FDR${f.fdr})`)
        .join(', ') || 'TBC';

      return (
        `${p.web_name} | ${p.team_name || '—'} | ${pos} | £${price}m | ` +
        `Form: ${p.form ?? 0} | Pts: ${p.total_points ?? 0} | ` +
        `Mins: ${p.minutes ?? 0} | xG: ${p.expected_goals ?? 0} | ` +
        `xA: ${p.expected_assists ?? 0} | Own: ${p.selected_by_percent ?? 0}% | ` +
        `Status: ${p.status ?? 'a'} | Play%: ${p.chance_of_playing ?? 100} | ` +
        `News: ${p.news || 'None'} | Next: ${next}`
      );
    })
    .join('\n');
}

/* ------------------------------------------------------------
   buildFixtureMap(gameweek) — Map<teamId, [{opp, fdr, home}]>
   ------------------------------------------------------------ */
export async function buildFixtureMap(gameweek) {
  const map = new Map();
  try {
    const [bootstrap, fixtures] = await Promise.all([
      getBootstrap(),
      getFixtures(),
    ]);

    const shortById = new Map(
      (bootstrap.teams || []).map((t) => [t.id, t.short_name || t.name])
    );

    const fromGw = Number(gameweek) || 0;
    const upcoming = (fixtures || [])
      .filter((f) => !f.finished && (f.event == null || f.event >= fromGw))
      .sort((a, b) => (a.event ?? 999) - (b.event ?? 999));

    for (const f of upcoming) {
      if (f.team_h != null) {
        const arr = map.get(f.team_h) || [];
        arr.push({ opp: shortById.get(f.team_a) || '?', fdr: f.team_h_difficulty ?? 3, home: true });
        map.set(f.team_h, arr);
      }
      if (f.team_a != null) {
        const arr = map.get(f.team_a) || [];
        arr.push({ opp: shortById.get(f.team_h) || '?', fdr: f.team_a_difficulty ?? 3, home: false });
        map.set(f.team_a, arr);
      }
    }
  } catch (err) {
    console.warn('[ai] buildFixtureMap failed:', err?.message);
  }
  return map;
}

/* ============================================================
   getCommunityOwnership(playerIds, gameweek)
   ============================================================ */
export async function getCommunityOwnership(playerIds, gameweek) {
  const ids = (Array.isArray(playerIds) ? playerIds : [])
    .map((n) => Number(n))
    .filter(Number.isInteger);

  const ownership = {};
  ids.forEach((id) => (ownership[id] = 0));

  if (!hasDb() || !ids.length) return { ownership, totalSquads: 0 };

  try {
    const rows = await queryMany(
      `SELECT picks FROM user_squads WHERE gameweek = $1`,
      [Number(gameweek)]
    );

    const total = rows.length;
    if (!total) return { ownership, totalSquads: 0 };

    const counts = new Map(ids.map((id) => [id, 0]));
    for (const row of rows) {
      const owned = extractPlayerIds(row.picks);
      for (const id of ids) {
        if (owned.has(id)) counts.set(id, counts.get(id) + 1);
      }
    }

    for (const id of ids) {
      ownership[id] = Math.round((counts.get(id) / total) * 1000) / 10;
    }
    return { ownership, totalSquads: total };
  } catch (err) {
    console.warn('[ai] getCommunityOwnership failed:', err?.message);
    return { ownership, totalSquads: 0 };
  }
}

function extractPlayerIds(picks) {
  const set = new Set();
  if (!Array.isArray(picks)) return set;
  for (const item of picks) {
    if (item == null) continue;
    if (typeof item === 'number') set.add(item);
    else if (typeof item === 'object') {
      const id = item.element ?? item.id ?? item.player?.id ?? item.player_id;
      if (Number.isInteger(Number(id))) set.add(Number(id));
    }
  }
  return set;
}

export function buildCommunityContext(players, ownership) {
  const lines = [];
  for (const p of players) {
    const pct = ownership?.[p.id];
    if (pct && pct > 0) {
      lines.push(`${p.web_name}: ${pct}% of IQPREC Arab managers own this player`);
    }
  }
  if (!lines.length) {
    return 'IQPREC Arab Community Data: not enough community squads yet for this gameweek.';
  }
  return 'IQPREC Arab Community Data for this gameweek:\n' + lines.join('\n');
}

export async function getActivePlayersByIds(ids) {
  if (!hasDb() || !ids?.length) return [];
  try {
    return await queryMany(
      `SELECT id, web_name, team_id, team_name, element_type, now_cost, form,
              total_points, minutes, expected_goals, expected_assists,
              selected_by_percent, status, news, chance_of_playing, photo
       FROM fpl_players
       WHERE id = ANY($1::int[]) AND season = $2 AND status != $3`,
      [ids, CURRENT_SEASON, 'removed']
    );
  } catch {
    return [];
  }
}

export default {
  buildSystemPrompt,
  callClaude,
  getCachedOrGenerate,
  buildPlayerContext,
  buildFixtureMap,
  getCommunityOwnership,
  buildCommunityContext,
  getActivePlayersByIds,
  logRecommendation,
};
