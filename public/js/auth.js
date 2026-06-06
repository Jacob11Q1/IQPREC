/* ============================================================
   IQPREC — auth.js
   Access-token lifecycle. The access token lives in memory ONLY
   (module-scoped). NEVER localStorage / sessionStorage (Pentagon L6).
   The refresh token is an httpOnly Secure cookie the browser sends
   automatically; JS cannot read it by design.
   ============================================================ */

const PUBLIC_PAGES = new Set([
  '/', '/index.html',
  '/login.html', '/register.html', '/verify-email.html',
  '/about.html', '/privacy.html', '/terms.html', '/cookies.html',
  '/competitions.html',
]);

// In-memory only. Resets on full page reload — auth.js re-bootstraps
// via the refresh cookie in initAuth().
let _accessToken = null;
let _user = null;

export function setAccessToken(token) {
  _accessToken = token || null;
}

export function getAccessToken() {
  return _accessToken;
}

export function clearAccessToken() {
  _accessToken = null;
  _user = null;
}

export function isAuthenticated() {
  return Boolean(_accessToken);
}

export function getUser() {
  return _user;
}

export function setUser(user) {
  _user = user || null;
}

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

/**
 * Attempt a silent token bootstrap using the httpOnly refresh cookie.
 * Returns true if a valid session was established.
 */
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

    setAccessToken(token);
    if (body?.data?.user) setUser(body.data.user);
    return true;
  } catch {
    return false;
  }
}

/**
 * Page guard. Call on every protected page load. On public pages it
 * still tries to bootstrap so logged-in users get personalized UI,
 * but never forces a redirect.
 */
export async function initAuth({ requireAuth } = {}) {
  const onPublic = isPublicPage();
  const needsAuth = requireAuth ?? !onPublic;

  const ok = await bootstrapSession();

  if (!ok && needsAuth) {
    redirectToLogin();
    return false;
  }
  return ok;
}

export async function logout() {
  try {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    /* best-effort; clear local state regardless */
  }
  clearAccessToken();
  window.location.replace('/login.html');
}

// Auto-run the guard on import for protected pages.
// Public pages opt out via <body data-public="true">.
document.addEventListener('DOMContentLoaded', () => {
  const isPublic = document.body?.dataset?.public === 'true' || isPublicPage();
  initAuth({ requireAuth: !isPublic });
});
