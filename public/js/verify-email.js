/* ============================================================
   IQPREC — verify-email.js
   Controller for verify-email.html. Reads the ?token= from the URL,
   POSTs it to /api/v1/auth/verify-email, and on success persists the
   returned access token + user to sessionStorage (so the session
   survives the redirect), then sends the user to onboarding.
   Renders loading → success | error states.
   ============================================================ */

import { api } from './api.js';
import { setAccessToken, setUser } from './auth.js';
import { t, applyTranslations, getLanguage } from './i18n.js';

const TOKEN_KEY = 'iqprec_token';
const USER_KEY = 'iqprec_user';

function host() {
  return document.querySelector('.content-body');
}

function render(html) {
  const main = host();
  if (!main) return;
  main.innerHTML = html;
  applyTranslations(main);
}

function loadingView() {
  return `
    <div class="auth-wrap">
      <div class="auth-card card card-elevated" style="text-align:center">
        <div class="skeleton skeleton-avatar" style="margin:0 auto var(--space-4)"></div>
        <p class="state-message">${t('verify.verifying')}</p>
      </div>
    </div>`;
}

function successView() {
  return `
    <div class="auth-wrap">
      <div class="auth-card card card-elevated" style="text-align:center">
        <h1 style="color:var(--green)">${t('verify.success')}</h1>
        <p class="state-message">${t('verify.redirecting')}</p>
      </div>
    </div>`;
}

function errorView(messageKey) {
  return `
    <div class="auth-wrap">
      <div class="auth-card card card-elevated" style="text-align:center">
        <h1>IQPREC</h1>
        <p class="state-message state-error">${t(messageKey)}</p>
        <div class="row" style="justify-content:center;gap:var(--space-3);margin-block-start:var(--space-4)">
          <a class="btn btn-primary" href="/login.html">${t('verify.toLogin')}</a>
          <a class="btn btn-ghost" href="/register.html">${t('verify.toRegister')}</a>
        </div>
      </div>
    </div>`;
}

async function verify() {
  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) {
    render(errorView('verify.noToken'));
    return;
  }

  render(loadingView());

  const res = await api.post('/auth/verify-email', { token });

  if (res.success && res.data?.accessToken) {
    // Persist for the session so onboarding/dashboard see an authed user.
    setAccessToken(res.data.accessToken);
    try {
      sessionStorage.setItem(TOKEN_KEY, res.data.accessToken);
    } catch {
      /* sessionStorage unavailable — non-fatal */
    }
    if (res.data.user) {
      setUser(res.data.user);
      try {
        sessionStorage.setItem(USER_KEY, JSON.stringify(res.data.user));
      } catch {
        /* non-fatal */
      }
    }
    render(successView());
    setTimeout(() => window.location.replace('/onboarding.html'), 900);
    return;
  }

  render(errorView('verify.failed'));
}

function init() {
  // Keep the document language/dir in sync before rendering.
  document.documentElement.lang = getLanguage();
  verify();
}

document.addEventListener('DOMContentLoaded', init);
