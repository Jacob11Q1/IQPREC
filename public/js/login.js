/* ============================================================
   IQPREC — login.js
   Controller for login.html. Submits credentials to
   POST /api/v1/auth/login via apiFetch, keeps the access token in
   memory ONLY (Pentagon L6 — never localStorage), stores the safe
   user object in sessionStorage, then redirects to the dashboard
   (or the ?next= page that sent the user here).
   Shows ONE generic error for both wrong email and wrong password.
   ============================================================ */

import { api } from './api.js';
import { setAccessToken, setUser } from './auth.js';
import { t, applyTranslations } from './i18n.js';
import { createLogoHTML } from './layout.js';

const TOKEN_KEY = 'iqprec_token';
const USER_KEY = 'iqprec_user';

function $(id) {
  return document.getElementById(id);
}

function showError(message) {
  const box = $('login-error');
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}

function clearError() {
  const box = $('login-error');
  if (box) box.hidden = true;
}

function setLoading(isLoading) {
  const btn = $('login-submit');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? t('auth.login.submitting') : t('auth.login.submit');
}

/* Map server error codes → the right user-facing message. */
function messageForError(res) {
  if (res.error === 'AUTH_1005') return t('auth.login.unverified');
  if (res.error === 'AUTH_1011' || res.error === 'RATE_LIMITED') {
    return res.message || t('auth.login.locked');
  }
  // Generic credential failure (and anything else) — never reveal which.
  return t('auth.login.failed');
}

function safeNext() {
  const next = new URLSearchParams(window.location.search).get('next');
  // Only allow same-origin relative paths to prevent open-redirect.
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/dashboard.html';
}

function togglePassword(btn) {
  const input = $('login-password');
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  const key = showing ? 'auth.show' : 'auth.hide';
  btn.textContent = t(key);
  btn.setAttribute('aria-label', t(key));
}

async function handleSubmit(e) {
  e.preventDefault();
  clearError();

  const email = $('login-email').value.trim();
  const password = $('login-password').value;

  if (!email || !password) {
    showError(t('auth.login.failed'));
    return;
  }

  setLoading(true);
  const res = await api.post('/auth/login', { email, password });
  setLoading(false);

  if (res.success && res.data?.accessToken) {
    // Persist the access token + user for the session (per-tab; survives
    // navigation to the dashboard). setAccessToken/setUser already mirror
    // to sessionStorage; the explicit writes below make the intent obvious.
    setAccessToken(res.data.accessToken);
    try {
      sessionStorage.setItem(TOKEN_KEY, res.data.accessToken);
    } catch {
      /* sessionStorage may be unavailable — non-fatal */
    }
    if (res.data.user) {
      setUser(res.data.user);
      try {
        sessionStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
      } catch {
        /* non-fatal */
      }
    }
    window.location.replace(safeNext());
    return;
  }

  showError(messageForError(res));
}

function init() {
  // Reticle logo (reuses the shared brand helper) linking to the landing page.
  const logo = $('auth-logo');
  if (logo) logo.innerHTML = createLogoHTML('full');

  applyTranslations();

  const form = $('login-form');
  if (form) form.addEventListener('submit', handleSubmit);

  const toggle = document.querySelector('[data-role="toggle-password"]');
  if (toggle) toggle.addEventListener('click', () => togglePassword(toggle));

  // Re-localize the dynamic submit label when the language flips.
  window.addEventListener('iqprec:languagechange', () => setLoading(false));
}

document.addEventListener('DOMContentLoaded', init);
