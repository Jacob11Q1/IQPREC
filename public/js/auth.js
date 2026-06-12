/* ============================================================
   IQPREC — auth.js
   Access-token lifecycle.

   The access token is held in memory (module-scoped) AND mirrored to
   sessionStorage('iqprec_token') so it survives page navigations within
   the same tab. sessionStorage — NOT localStorage — is used deliberately:
   it is per-tab and cleared when the tab closes, so the token never
   outlives the browsing session. (CLAUDE.md L6 forbids localStorage for
   tokens; this session-scoped store is the approved dev/auth-flow path.)

   The refresh token remains an httpOnly Secure SameSite=Strict cookie the
   browser sends automatically; JS can never read it. On a fresh tab with
   no sessionStorage token, we silently re-bootstrap from that cookie.
   ============================================================ */

const TOKEN_KEY = 'iqprec_token';
const USER_KEY = 'iqprec_user';

const PUBLIC_PAGES = new Set([
  '/', '/index.html',
  '/login.html', '/register.html', '/verify-email.html',
  '/about.html', '/privacy.html', '/terms.html', '/cookies.html',
  '/competitions.html',
]);

// In-memory mirror of the sessionStorage token (fast path).
let _accessToken = null;
let _user = null;

/* ---- small sessionStorage helpers (never throw) ---- */
function ssGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function ssSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* unavailable — non-fatal */ }
}
function ssDel(key) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}

/* ------------------------------------------------------------
   Access token
   ------------------------------------------------------------ */
export function setAccessToken(token) {
  _accessToken = token || null;
  // Mirror to window + sessionStorage so it persists across navigations.
  if (typeof window !== 'undefined') window.accessToken = _accessToken;
  if (_accessToken) ssSet(TOKEN_KEY, _accessToken);
  else ssDel(TOKEN_KEY);
}

export function getAccessToken() {
  // memory → window → sessionStorage (rehydrate on the way).
  if (_accessToken) return _accessToken;
  const fromWindow = typeof window !== 'undefined' ? window.accessToken : null;
  if (fromWindow) { _accessToken = fromWindow; return _accessToken; }
  const stored = ssGet(TOKEN_KEY);
  if (stored) {
    _accessToken = stored;
    if (typeof window !== 'undefined') window.accessToken = stored;
    return stored;
  }
  return null;
}

export function clearAccessToken() {
  _accessToken = null;
  _user = null;
  if (typeof window !== 'undefined') window.accessToken = null;
  ssDel(TOKEN_KEY);
  ssDel(USER_KEY);
}

export function isAuthenticated() {
  return Boolean(getAccessToken());
}

/* ------------------------------------------------------------
   User object
   ------------------------------------------------------------ */
export function setUser(user) {
  _user = user || null;
  if (_user) ssSet(USER_KEY, JSON.stringify(_user));
  else ssDel(USER_KEY);
}

export function getUser() {
  if (_user) return _user;
  const raw = ssGet(USER_KEY);
  if (raw) {
    try { _user = JSON.parse(raw); } catch { _user = null; }
  }
  return _user;
}

/* ------------------------------------------------------------
   Navigation helpers
   ------------------------------------------------------------ */
function currentPath() {
  return window.location.pathname || '/';
}

function isPublicPage() {
  return PUBLIC_PAGES.has(currentPath());
}

export function redirectToLogin() {
  const next = encodeURIComponent(currentPath() + window.location.search);
  window.location.replace(`/login.html?next=${next}`);
}

/* ------------------------------------------------------------
   Silent bootstrap from the httpOnly refresh cookie.
   Returns true and persists a fresh access token on success.
   ------------------------------------------------------------ */
export async function bootstrapSession() {
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return false;

    const body = await res.json().catch(() => null);
    const token = body?.data?.accessToken ?? body?.accessToken;
    if (!token) return false;

    setAccessToken(token); // persists to sessionStorage + window
    if (body?.data?.user) setUser(body.data.user);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------
   checkAuth — resolve the current session for a page load.
     1) sessionStorage token  → use it (fast, survives navigation/refresh)
     2) else refresh cookie    → mint + persist a new token
     3) else                   → clear storage, return null (caller redirects)
   Returns the user object when authenticated, otherwise null.
   ------------------------------------------------------------ */
export async function checkAuth() {
  // 1) sessionStorage token (set at login / verify / previous bootstrap).
  const stored = ssGet(TOKEN_KEY);
  if (stored) {
    _accessToken = stored;
    if (typeof window !== 'undefined') window.accessToken = stored;
    return getUser();
  }

  // 2) No token in this tab → try the refresh cookie.
  const ok = await bootstrapSession();
  if (ok) return getUser();

  // 3) Nothing worked → make sure no stale state lingers.
  clearAccessToken();
  return null;
}

/* ------------------------------------------------------------
   Page guard. Protected pages redirect to login when unauthenticated;
   public pages still resolve a session (for personalized UI) but never
   force a redirect.
   ------------------------------------------------------------ */
export async function initAuth({ requireAuth } = {}) {
  const onPublic = isPublicPage();
  const needsAuth = requireAuth ?? !onPublic;

  const user = await checkAuth();

  if (!user && needsAuth) {
    redirectToLogin();
    return false;
  }
  return Boolean(user);
}

/* ------------------------------------------------------------
   Logout — clear everything locally, revoke server-side, go to login.
   ------------------------------------------------------------ */
export async function logout() {
  // Clear local session first so nothing can be reused even if the
  // network call hangs.
  ssDel(TOKEN_KEY);
  ssDel(USER_KEY);
  clearAccessToken();

  try {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    /* best-effort; local state already cleared */
  }
  window.location.replace('/login.html');
}

// Auto-run the guard on import for protected pages.
// Public pages opt out via <body data-public="true">.
document.addEventListener('DOMContentLoaded', () => {
  const isPublic = document.body?.dataset?.public === 'true' || isPublicPage();
  initAuth({ requireAuth: !isPublic });
});
