/* ============================================================
   IQPREC — jobs/fpl-sync.job.js
   Keeps the FPL data engine fresh and enforces ACTIVE PLAYERS ONLY on
   a schedule (node-cron):
     • every 6 hours      → full bootstrap refresh + player sync
     • Thu 08:00 (Amman)  → invalidate gameweek caches before the
                            typical Friday/Saturday deadline run
   Also runs one cold-start sync if the bootstrap cache is empty.
   All work is wrapped so a failure logs but never crashes the server.
   ============================================================ */

import cron from 'node-cron';

import * as fplService from '../services/fpl.service.js';
import * as cache from './../services/cache.service.js';

const BOOTSTRAP_KEY = `fpl:bootstrap:${fplService.CURRENT_SEASON}`;

/** Full refresh: fetch bootstrap, upsert players, mark removals. */
export async function syncFplData() {
  try {
    const { active, removed } = await fplService.refreshBootstrap();
    console.log(`[fpl-sync] FPL sync complete. Active players: ${active}. Removed: ${removed}.`);
    return { active, removed };
  } catch (err) {
    console.error('[fpl-sync] sync failed:', err?.message || err);
    return null;
  }
}

/** Drop gameweek-scoped caches so the next request refetches. */
export async function invalidateGameweekCache() {
  try {
    const a = await cache.invalidatePattern(`fpl:fixtures:${fplService.CURRENT_SEASON}`);
    const b = await cache.invalidatePattern('fpl:player:');
    console.log(`[fpl-sync] gameweek cache invalidated (fixtures: ${a}, players: ${b}).`);
  } catch (err) {
    console.error('[fpl-sync] cache invalidation failed:', err?.message || err);
  }
}

/**
 * initFplJobs() — register cron schedules and run a cold-start sync if the
 * bootstrap cache is empty. Called once from index.js on startup.
 */
export function initFplJobs() {
  // Every 6 hours: full refresh + player sync.
  cron.schedule('0 */6 * * *', () => {
    syncFplData();
  });

  // Thursday 08:00 Asia/Jerusalem (Amman time): clear gameweek caches.
  cron.schedule('0 8 * * 4', () => {
    invalidateGameweekCache();
  }, { timezone: 'Asia/Jerusalem' });

  // Cold start: only sync immediately if nothing is cached yet.
  (async () => {
    const warm = await cache.exists(BOOTSTRAP_KEY);
    if (warm) {
      console.log('[fpl-sync] bootstrap cache warm — skipping cold-start sync.');
      return;
    }
    console.log('[fpl-sync] cold start — running initial FPL sync…');
    syncFplData();
  })();

  console.log('[fpl-sync] cron jobs registered (every 6h + Thu 08:00 Asia/Jerusalem).');
}

export default initFplJobs;
