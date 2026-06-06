/* ============================================================
   IQPREC — api.js
   Single entry point for every backend call. Attaches the in-memory
   bearer token, transparently refreshes on 401 (once), retries the
   original request, and normalizes every response to:
       { success, data, error, message }
   ============================================================ */

import {
  getAccessToken,
  setAccessToken,
  setUser,
  clearAccessToken,
  redirectToLogin,
} from './auth.js';

const API_BASE = '/api/v1';

// Ensures concurrent 401s trigger only ONE refresh round-trip.
let _refreshPromise = null;

function buildUrl(endpoint) {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  if (endpoint.startsWith('/api/')) return endpoint;
  return `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
}

async function refreshToken() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
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
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

async function normalize(res) {
  let body = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { message: text };
    }
  }

  if (res.ok) {
    // Pass through if the server already used our envelope.
    if (body && typeof body === 'object' && 'success' in body) {
      return {
        success: body.success !== false,
        data: body.data ?? null,
        error: body.error ?? null,
        message: body.message ?? null,
      };
    }
    return { success: true, data: body, error: null, message: null };
  }

  return {
    success: false,
    data: body?.data ?? null,
    error: body?.error ?? res.statusText ?? 'request_failed',
    message: body?.message ?? `Request failed (${res.status})`,
  };
}

/**
 * apiFetch(endpoint, options)
 * @param {string} endpoint  e.g. "/auth/login" or "/captain/recommend"
 * @param {object} options   standard fetch init; `body` may be a plain
 *                           object and will be JSON-stringified.
 * @returns {Promise<{success, data, error, message}>}
 */
export async function apiFetch(endpoint, options = {}) {
  const url = buildUrl(endpoint);

  const makeInit = () => {
    const headers = new Headers(options.headers || {});
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let { body } = options;
    const isPlainObject =
      body &&
      typeof body === 'object' &&
      !(body instanceof FormData) &&
      !(body instanceof Blob) &&
      !(body instanceof ArrayBuffer);

    if (isPlainObject) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }

    return {
      ...options,
      headers,
      body,
      credentials: 'include',
    };
  };

  let res;
  try {
    res = await fetch(url, makeInit());
  } catch {
    return {
      success: false,
      data: null,
      error: 'network_error',
      message: 'Could not reach the server. Check your connection.',
    };
  }

  // Transparent single refresh + retry on 401.
  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (!refreshed) {
      clearAccessToken();
      redirectToLogin();
      return {
        success: false,
        data: null,
        error: 'unauthenticated',
        message: 'Session expired. Please sign in again.',
      };
    }
    try {
      res = await fetch(url, makeInit());
    } catch {
      return {
        success: false,
        data: null,
        error: 'network_error',
        message: 'Could not reach the server. Check your connection.',
      };
    }
  }

  return normalize(res);
}

/* Convenience verbs */
export const api = {
  get: (endpoint, options = {}) =>
    apiFetch(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options = {}) =>
    apiFetch(endpoint, { ...options, method: 'POST', body }),
  put: (endpoint, body, options = {}) =>
    apiFetch(endpoint, { ...options, method: 'PUT', body }),
  patch: (endpoint, body, options = {}) =>
    apiFetch(endpoint, { ...options, method: 'PATCH', body }),
  del: (endpoint, options = {}) =>
    apiFetch(endpoint, { ...options, method: 'DELETE' }),
};
