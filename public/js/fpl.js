/* ============================================================
   IQPREC — fpl.js (frontend)
   All FPL-related API calls for page controllers. Each wraps the
   shared apiFetch (which attaches the in-memory bearer token and
   transparently refreshes), unwraps the { success, data } envelope,
   returns a clean data object, and throws a clear Error on failure.
   ============================================================ */

import { api } from './api.js';

/* Unwrap the standard envelope → data, or throw a labelled Error. */
async function unwrap(resPromise) {
  const res = await resPromise;
  if (!res.success) {
    const err = new Error(res.message || res.error || 'Request failed');
    err.code = res.error || 'request_failed';
    throw err;
  }
  return res.data;
}

/* ---- Public reads ---- */
export function fetchBootstrap() {
  return unwrap(api.get('/fpl/bootstrap'));
}

export function fetchCurrentGameweek() {
  return unwrap(api.get('/fpl/gameweek/current'));
}

export function fetchFixtures(gw) {
  const qs = gw != null && gw !== '' ? `?gw=${encodeURIComponent(gw)}` : '';
  return unwrap(api.get(`/fpl/fixtures${qs}`));
}

export function fetchMilestone() {
  return unwrap(api.get('/fpl/stats/milestone'));
}

export function fetchStats() {
  return unwrap(api.get('/stats'));
}

/* ---- Authenticated ---- */
export function fetchMySquad() {
  return unwrap(api.get('/fpl/my-squad'));
}

export function syncMySquad() {
  return unwrap(api.post('/fpl/sync-squad'));
}

export function validateTeam(teamId) {
  return unwrap(api.get(`/fpl/validate-team/${encodeURIComponent(teamId)}`));
}

export function searchPlayers(query, type) {
  const params = new URLSearchParams({ q: query });
  if (type) params.set('type', type);
  return unwrap(api.get(`/fpl/players/search?${params.toString()}`));
}

export function fetchPlayer(id) {
  return unwrap(api.get(`/fpl/players/${encodeURIComponent(id)}`));
}

export function fetchArabStars() {
  return unwrap(api.get('/fpl/arab-stars'));
}

/* ------------------------------------------------------------
   debounce(fn, wait) — returns a debounced version of fn.
   For async fns it resolves with the latest call's result.
   ------------------------------------------------------------ */
export function debounce(fn, wait = 300) {
  let timer = null;
  return function debounced(...args) {
    return new Promise((resolve, reject) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          resolve(await fn.apply(this, args));
        } catch (err) {
          reject(err);
        }
      }, wait);
    });
  };
}

// Debounced player search (300ms) for type-ahead inputs.
export const debouncedSearchPlayers = debounce(searchPlayers, 300);

/* ------------------------------------------------------------
   useTrialStatus() — derive trial state from the cached user object
   (sessionStorage; written by login.js). Pure/no network.
   Returns { daysRemaining, isExpired, isTrialUser, percentUsed }.
   ------------------------------------------------------------ */
const TRIAL_LENGTH_DAYS = 7;

export function useTrialStatus() {
  let user = null;
  try {
    user = JSON.parse(sessionStorage.getItem('iqprec_user') || 'null');
  } catch {
    user = null;
  }

  const status = user?.subscriptionStatus || user?.subscription_status || null;
  const endsRaw = user?.trialEndsAt || user?.trial_ends_at || null;
  const isTrialUser = status === 'trial';

  if (!endsRaw) {
    return { daysRemaining: null, isExpired: false, isTrialUser, percentUsed: 0 };
  }

  const end = new Date(endsRaw).getTime();
  const daysRemaining = Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
  const isExpired = daysRemaining < 0;
  const used = TRIAL_LENGTH_DAYS - Math.max(0, Math.min(TRIAL_LENGTH_DAYS, daysRemaining));
  const percentUsed = Math.round((used / TRIAL_LENGTH_DAYS) * 100);

  return { daysRemaining, isExpired, isTrialUser, percentUsed };
}

export default {
  fetchBootstrap,
  fetchCurrentGameweek,
  fetchFixtures,
  fetchMilestone,
  fetchStats,
  fetchMySquad,
  syncMySquad,
  validateTeam,
  searchPlayers,
  fetchPlayer,
  fetchArabStars,
  debounce,
  debouncedSearchPlayers,
  useTrialStatus,
};
