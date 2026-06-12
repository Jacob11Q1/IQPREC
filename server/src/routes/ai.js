/* ============================================================
   IQPREC — routes/ai.js
   Claude-backed endpoints. Mounted at /api/v1/ai behind
   verifyToken → checkSubscription → aiLimiter (10/60s/user).

   THE RULE: validatePlayers() runs before EVERY prompt build. Player
   data is always injected live from fpl_players (current season,
   non-removed) — never a hardcoded name. Responses come back in Arabic
   when language is 'ar'.

   Endpoints:
     POST /captain        top-3 captain picks (cached 6h)
     POST /lineup         optimal XI + formation (cached 6h)
     POST /transfers      transfer suggestions (never cached)
     POST /differentials  low-ownership gems (cached 12h, shared)
     POST /chat           streamed SSE chat (never cached)
   ============================================================ */

import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';

import { validateBody } from '../middleware/security/validate-body.js';
import {
  validatePlayers,
  getCurrentGameweek,
  CURRENT_SEASON,
} from '../services/fpl.service.js';
import {
  buildSystemPrompt,
  callClaude,
  getCachedOrGenerate,
  buildPlayerContext,
  buildFixtureMap,
  getCommunityOwnership,
  buildCommunityContext,
  getActivePlayersByIds,
  logRecommendation,
} from '../services/ai.service.js';
import { TTL } from '../services/cache.service.js';
import { buildExpertContext } from '../lib/fpl-expert-rules.js';
import { supabase, hasDb } from '../db/client.js';
import { redis, isRedisReady } from '../lib/redis.js';

const router = Router();

const ok = (res, data) =>
  res.json({ success: true, data, error: null, message: null });

/* Short, stable hash of squad ids for cache keys. */
function idsHash(ids) {
  return crypto
    .createHash('sha1')
    .update([...ids].sort((a, b) => a - b).join(','))
    .digest('hex')
    .slice(0, 12);
}

/* ------------------------------------------------------------
   Shared Zod pieces
   ------------------------------------------------------------ */
const squadIds = z
  .array(z.number().int().positive())
  .min(1)
  .max(15);
const language = z.enum(['ar', 'en']).default('ar');
const gameweek = z.number().int().positive();

/* ============================================================
   POST /api/v1/ai/captain
   ============================================================ */
const captainSchema = z.object({
  squadPlayerIds: squadIds,
  gameweek,
  language,
});

router.post('/captain', validateBody(captainSchema), async (req, res, next) => {
  try {
    const { squadPlayerIds, gameweek: gw, language: lang } = req.body;
    const userId = req.user.userId;

    // 1) THE RULE — validate before any prompt build.
    await validatePlayers(squadPlayerIds);

    // 8) Cache (6h) keyed by user + gw + squad.
    const cacheKey = `ai:captain:${userId}:${gw}:${idsHash(squadPlayerIds)}`;

    const { text, cached } = await getCachedOrGenerate(
      cacheKey,
      TTL.AI_DIFFERENTIALS / 2, // 6h
      async () => {
        // 2) Live player rows.
        const players = await getActivePlayersByIds(squadPlayerIds);

        // 3) Attacking captain candidates: MID/FWD, plus strong DEFs (>80pts).
        const candidates = players.filter(
          (p) =>
            p.element_type === 3 ||
            p.element_type === 4 ||
            (p.element_type === 2 && Number(p.total_points) > 80)
        );
        const pool = candidates.length ? candidates : players;

        // 4-7) Fixtures + community ownership + context strings.
        const fixtureMap = await buildFixtureMap(gw);
        const { ownership } = await getCommunityOwnership(squadPlayerIds, gw);
        const playerContext = buildPlayerContext(pool, fixtureMap);
        const communityContext = buildCommunityContext(pool, ownership);

        const messages = [
          {
            role: 'user',
            content:
              `Analyze my squad and recommend the best captain pick for Gameweek ${gw}.\n\n` +
              `Here is my squad data (captain candidates):\n${playerContext}\n\n` +
              `${communityContext}\n\n` +
              `Apply these expert rules:\n${buildExpertContext(['captain', 'fixture', 'form'])}\n\n` +
              `Give me your top 3 captain picks, each with: a confidence percentage, ` +
              `the opponent and home/away, a short fixture analysis, and clear reasoning. ` +
              `Number them 1-3 (1 = top pick, 2 = alternative, 3 = differential). ` +
              `Format as a structured, scannable analysis.`,
          },
        ];

        return callClaude(messages, buildSystemPrompt(lang), {
          userId,
          type: 'captain',
          gameweek: gw,
          language: lang,
          maxTokens: 1400,
        });
      }
    );

    if (cached) {
      // Still record that the user pulled a (cached) captain rec.
      await logRecommendation({
        userId,
        type: 'captain',
        gameweek: gw,
        language: lang,
        outputText: text,
        cached: true,
      });
    }

    return ok(res, { recommendation: text, gameweek: gw, cached, cachedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
   POST /api/v1/ai/lineup
   ============================================================ */
const lineupSchema = z.object({
  squadPlayerIds: squadIds,
  gameweek,
  language,
  formation: z.string().max(10).optional(),
});

router.post('/lineup', validateBody(lineupSchema), async (req, res, next) => {
  try {
    const { squadPlayerIds, gameweek: gw, language: lang, formation } = req.body;
    const userId = req.user.userId;

    await validatePlayers(squadPlayerIds);

    const cacheKey = `ai:lineup:${userId}:${gw}:${idsHash(squadPlayerIds)}:${formation || 'auto'}`;

    const { text, cached } = await getCachedOrGenerate(
      cacheKey,
      TTL.AI_DIFFERENTIALS / 2, // 6h
      async () => {
        const players = await getActivePlayersByIds(squadPlayerIds);
        const fixtureMap = await buildFixtureMap(gw);
        const { ownership } = await getCommunityOwnership(squadPlayerIds, gw);
        const playerContext = buildPlayerContext(players, fixtureMap);
        const communityContext = buildCommunityContext(players, ownership);

        const messages = [
          {
            role: 'user',
            content:
              `Pick my optimal starting 11 and bench order for Gameweek ${gw}.\n\n` +
              `My full 15-man squad:\n${playerContext}\n\n` +
              `${communityContext}\n\n` +
              (formation ? `Preferred formation: ${formation}.\n\n` : '') +
              `Apply these expert rules:\n${buildExpertContext(['fixture', 'form'])}\n\n` +
              `Recommend the best formation (e.g. 3-4-3) and the starting 11, then ` +
              `the 4 bench players in priority order. Give a one-line reason per ` +
              `starter and an overall formation rationale.`,
          },
        ];

        return callClaude(messages, buildSystemPrompt(lang), {
          userId,
          type: 'lineup',
          gameweek: gw,
          language: lang,
          maxTokens: 1600,
        });
      }
    );

    if (cached) {
      await logRecommendation({
        userId, type: 'lineup', gameweek: gw, language: lang, outputText: text, cached: true,
      });
    }

    return ok(res, { recommendation: text, gameweek: gw, cached, cachedAt: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
   POST /api/v1/ai/transfers   (never cached — squad-specific)
   ============================================================ */
const transfersSchema = z.object({
  squadPlayerIds: squadIds,
  gameweek,
  language,
  transfersAvailable: z.number().int().min(1).max(2),
  bankValue: z.number().min(0).max(100),
});

router.post('/transfers', validateBody(transfersSchema), async (req, res, next) => {
  try {
    const {
      squadPlayerIds,
      gameweek: gw,
      language: lang,
      transfersAvailable,
      bankValue,
    } = req.body;
    const userId = req.user.userId;

    await validatePlayers(squadPlayerIds);

    const players = await getActivePlayersByIds(squadPlayerIds);
    const fixtureMap = await buildFixtureMap(gw);

    // Auto-detect weak players: not available, OR cold form on hard fixtures.
    const weak = players.filter((p) => {
      const unavailable = (p.status && p.status !== 'a') || Number(p.chance_of_playing) < 75;
      const nextFdr = (fixtureMap.get(p.team_id) || [])[0]?.fdr ?? 3;
      const coldAndHard = Number(p.form) < 3 && nextFdr > 3;
      return unavailable || coldAndHard;
    });

    const playerContext = buildPlayerContext(players, fixtureMap);
    const weakContext = weak.length
      ? buildPlayerContext(weak, fixtureMap)
      : 'No obviously weak players detected — only suggest a move if clearly worth it.';

    const messages = [
      {
        role: 'user',
        content:
          `Recommend transfers for Gameweek ${gw}.\n\n` +
          `My squad:\n${playerContext}\n\n` +
          `Players I've flagged as weak:\n${weakContext}\n\n` +
          `I have ${transfersAvailable} free transfer(s) and £${bankValue.toFixed(1)}m in the bank.\n\n` +
          `Apply these expert rules:\n${buildExpertContext(['transfer', 'fixture', 'form', 'chip'])}\n\n` +
          `For each suggestion give: OUT player + why, IN player + fixture case, ` +
          `the price difference (must be affordable within my bank after the sale), ` +
          `and a confidence level. If a move needs a hit, state the expected points ` +
          `gain vs the hit cost. If a wildcard is warranted, say so clearly.`,
      },
    ];

    const text = await callClaude(messages, buildSystemPrompt(lang), {
      userId,
      type: 'transfers',
      gameweek: gw,
      language: lang,
      maxTokens: 1600,
    });

    return ok(res, { recommendation: text, gameweek: gw, cached: false });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
   POST /api/v1/ai/differentials  (cached 12h, shared across users)
   ============================================================ */
const differentialsSchema = z.object({
  gameweek,
  language,
  budget: z.number().min(0).max(100).optional(),
});

router.post('/differentials', validateBody(differentialsSchema), async (req, res, next) => {
  try {
    const { gameweek: gw, language: lang, budget } = req.body;
    const userId = req.user.userId;

    const cacheKey = `ai:differentials:${gw}:${lang}`;

    const { text, cached } = await getCachedOrGenerate(
      cacheKey,
      TTL.AI_DIFFERENTIALS, // 12h
      async () => {
        if (!hasDb()) {
          throw Object.assign(new Error('Database not configured'), {
            code: 'DB_UNAVAILABLE',
            status: 503,
          });
        }

        // Low ownership + good form + active.
        let query = supabase
          .from('fpl_players')
          .select(
            'id, web_name, team_id, team_name, element_type, now_cost, form, total_points, minutes, expected_goals, expected_assists, selected_by_percent, status, news, chance_of_playing'
          )
          .eq('season', CURRENT_SEASON)
          .neq('status', 'removed')
          .lt('selected_by_percent', 10)
          .gt('form', 5)
          .order('form', { ascending: false })
          .limit(25);
        if (budget) query = query.lte('now_cost', Math.round(budget * 10));

        const { data: pool, error } = await query;
        if (error) throw Object.assign(new Error(error.message), { code: 'FPL_3012', status: 500 });

        const candidates = pool || [];
        if (!candidates.length) {
          return lang === 'ar'
            ? 'لا يوجد حالياً لاعبون بملكية منخفضة وفورمة عالية يستوفون شروط الفِرَق لهذه الجولة.'
            : 'No low-ownership, in-form differentials qualify for this gameweek yet.';
        }

        // THE RULE — validate even DB-sourced candidates before the prompt.
        await validatePlayers(candidates.map((p) => p.id));

        const fixtureMap = await buildFixtureMap(gw);
        const playerContext = buildPlayerContext(candidates, fixtureMap);

        const messages = [
          {
            role: 'user',
            content:
              `Find the best differential picks for Gameweek ${gw}` +
              (budget ? ` under £${budget.toFixed(1)}m` : '') + `.\n\n` +
              `Candidate pool (all under 10% ownership, form above 5):\n${playerContext}\n\n` +
              `Apply these expert rules:\n${buildExpertContext(['differential', 'fixture', 'form'])}\n\n` +
              `Pick the top 5. For each: ownership %, price, the fixture case, and why ` +
              `they're a smart rank-gaining differential. Mark any under 5% as a Hidden Gem.`,
          },
        ];

        return callClaude(messages, buildSystemPrompt(lang), {
          userId,
          type: 'differentials',
          gameweek: gw,
          language: lang,
          maxTokens: 1400,
        });
      }
    );

    if (cached) {
      await logRecommendation({
        userId, type: 'differentials', gameweek: gw, language: lang, outputText: text, cached: true,
      });
    }

    return ok(res, { recommendation: text, gameweek: gw, cached });
  } catch (err) {
    next(err);
  }
});

/* ============================================================
   POST /api/v1/ai/chat   — streamed SSE
   ============================================================ */
const chatSchema = z.object({
  message: z.string().min(1).max(500),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      })
    )
    .max(10)
    .default([]),
  language,
  squadContext: z.record(z.string(), z.any()).optional(),
});

const JAILBREAK_PATTERNS = [
  'ignore previous',
  'forget instructions',
  'forget your instructions',
  'act as',
  'pretend you are',
  'you are now',
  'new instructions',
  'system prompt',
  'disregard',
];

function isJailbreak(message) {
  const m = String(message).toLowerCase();
  return JAILBREAK_PATTERNS.some((p) => m.includes(p));
}

router.post('/chat', validateBody(chatSchema), async (req, res, next) => {
  const { message, conversationHistory, language: lang, squadContext } = req.body;
  const userId = req.user.userId;

  try {
    // Suspended? (set after 5 strikes — Pentagon L8.)
    if (isRedisReady()) {
      try {
        const suspended = await redis.get(`ai:suspend:${userId}`);
        if (suspended) {
          return res.status(403).json({
            success: false,
            data: null,
            error: 'AI_4008',
            message: 'Chat access is temporarily suspended. Try again later.',
          });
        }
      } catch { /* fail open */ }
    }

    // Jailbreak detection (Pentagon L8): 3 strikes warn, 5 suspend 24h.
    if (isJailbreak(message)) {
      let strikes = 1;
      if (isRedisReady()) {
        try {
          strikes = await redis.incr(`ai:abuse:${userId}`);
          if (strikes === 1) await redis.expire(`ai:abuse:${userId}`, 24 * 60 * 60);
          if (strikes >= 5) {
            await redis.set(`ai:suspend:${userId}`, '1', 'EX', 24 * 60 * 60);
          }
        } catch { /* fail open on counter */ }
      }
      const suspended = strikes >= 5;
      return res.status(403).json({
        success: false,
        data: null,
        error: 'AI_4007',
        message: suspended
          ? 'Chat suspended for 24h after repeated policy violations.'
          : strikes >= 3
            ? 'Warning: repeated attempts to break IQPREC will suspend your chat.'
            : 'IQPREC only answers Fantasy Premier League questions.',
        strikes,
        suspended,
      });
    }

    // ---- SSE setup ----
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    // Build messages from history (last 10) + current message.
    const history = (conversationHistory || []).slice(-10);
    const messages = [...history, { role: 'user', content: buildChatContent(message, squadContext) }];

    const started = Date.now();
    let full = '';
    let aborted = false;

    let stream;
    try {
      stream = await callClaude(messages, buildSystemPrompt(lang), {
        stream: true,
        userId,
        type: 'chat',
        language: lang,
        maxTokens: 1000,
      });
    } catch (err) {
      // Rate-limited or AI down → emit an SSE error, then close.
      res.write(`data: {"error":"${err.code || 'AI_5001'}"}\n\n`);
      return res.end();
    }

    // Cancel the upstream stream if the client disconnects.
    req.on('close', () => {
      aborted = true;
      try { stream.abort?.(); } catch { /* ignore */ }
    });

    stream.on('text', (delta) => {
      if (aborted) return;
      full += delta;
      res.write(`data: ${JSON.stringify(delta)}\n\n`);
    });

    stream.on('error', (err) => {
      console.warn('[ai] chat stream error:', err?.message);
      if (!aborted) {
        res.write(`data: {"error":"AI_5001"}\n\n`);
        res.end();
      }
    });

    stream.on('end', async () => {
      if (aborted) return;
      res.write('data: [DONE]\n\n');
      res.end();

      // Audit log (best-effort) once the stream is complete.
      let usage = {};
      try {
        const finalMsg = await stream.finalMessage();
        usage = finalMsg?.usage || {};
      } catch { /* ignore */ }
      await logRecommendation({
        userId,
        type: 'chat',
        language: lang,
        outputText: full,
        promptTokens: usage.input_tokens ?? 0,
        completionTokens: usage.output_tokens ?? 0,
        latencyMs: Date.now() - started,
        cached: false,
      });
    });
  } catch (err) {
    // If headers already sent (SSE), close cleanly; else hand to error handler.
    if (res.headersSent) {
      try { res.write(`data: {"error":"AI_5001"}\n\n`); res.end(); } catch { /* ignore */ }
      return;
    }
    next(err);
  }
});

/* Inject light squad context into the chat message when provided. */
function buildChatContent(message, squadContext) {
  if (!squadContext || typeof squadContext !== 'object') return message;
  let ctx = '';
  try {
    ctx = JSON.stringify(squadContext).slice(0, 1500);
  } catch {
    ctx = '';
  }
  if (!ctx) return message;
  return `${message}\n\n[My current squad context (JSON): ${ctx}]`;
}

export default router;
