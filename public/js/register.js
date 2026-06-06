/* ============================================================
   IQPREC — register.js
   Controller for register.html. Validates all fields client-side,
   drives the 4-stage password strength meter, and submits to
   POST /api/v1/auth/register. On success it shows a "check your
   email" state (the server NEVER reveals whether the email already
   exists, so success is always the check-email message).
   Auto-fills the referral code from a ?ref= query param.
   ============================================================ */

import { api } from './api.js';
import { t, applyTranslations, getLanguage } from './i18n.js';
import { createLogoHTML } from './layout.js';

function $(id) {
  return document.getElementById(id);
}

/* ------------------------------------------------------------
   Password strength — 5 criteria mapped to 4 visual stages.
   Returns { stage: 0..4, valid: boolean }.
   ------------------------------------------------------------ */
function evaluatePassword(pw) {
  const checks = [
    pw.length >= 8,
    /[A-Z]/.test(pw),
    /[a-z]/.test(pw),
    /[0-9]/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ];
  const met = checks.filter(Boolean).length;
  const valid = met === 5; // backend requires all five
  let stage = 0;
  if (!pw) stage = 0;
  else if (met <= 1) stage = 1;
  else if (met === 2) stage = 2;
  else if (met === 3 || met === 4) stage = 3;
  else stage = 4;
  return { stage, valid };
}

const STRENGTH_LABEL = {
  1: 'auth.strength.weak',
  2: 'auth.strength.fair',
  3: 'auth.strength.good',
  4: 'auth.strength.strong',
};

function renderStrength(pw) {
  const wrap = $('reg-strength');
  if (!wrap) return;
  const { stage } = evaluatePassword(pw);
  wrap.classList.remove('s1', 's2', 's3', 's4');
  const label = wrap.querySelector('.pw-strength-label');
  if (stage === 0) {
    if (label) label.textContent = '';
    return;
  }
  wrap.classList.add(`s${stage}`);
  if (label) label.textContent = `${t('auth.strength.label')}: ${t(STRENGTH_LABEL[stage])}`;
}

/* ------------------------------------------------------------
   Errors
   ------------------------------------------------------------ */
function setFieldError(id, message) {
  const el = $(id);
  if (!el) return;
  const input = $(el.id.replace('-error', ''));
  if (message) {
    el.textContent = message;
    el.hidden = false;
    if (input) input.classList.add('input-error');
  } else {
    el.hidden = true;
    if (input) input.classList.remove('input-error');
  }
}

function clearErrors() {
  ['reg-name-error', 'reg-email-error', 'reg-confirm-error'].forEach((id) =>
    setFieldError(id, '')
  );
  const banner = $('register-error');
  if (banner) banner.hidden = true;
}

function showBanner(message) {
  const banner = $('register-error');
  if (!banner) return;
  banner.textContent = message;
  banner.hidden = false;
}

function setLoading(isLoading) {
  const btn = $('register-submit');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? t('auth.register.submitting') : t('auth.register.submit');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(values) {
  let ok = true;
  if (values.fullName.length < 2) {
    setFieldError('reg-name-error', t('auth.register.nameShort'));
    ok = false;
  }
  if (!EMAIL_RE.test(values.email)) {
    setFieldError('reg-email-error', t('auth.register.emailInvalid'));
    ok = false;
  }
  if (!evaluatePassword(values.password).valid) {
    showBanner(t('auth.register.weakPassword'));
    ok = false;
  }
  if (values.password !== values.confirm) {
    setFieldError('reg-confirm-error', t('auth.register.mismatch'));
    ok = false;
  }
  return ok;
}

/* ------------------------------------------------------------
   Success state — replace the card body with "check your email".
   ------------------------------------------------------------ */
function showSuccess() {
  const card = $('register-card');
  if (!card) return;
  card.innerHTML = `
    <div class="auth-success">
      <svg class="auth-success-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
      </svg>
      <h1 class="auth-title" data-i18n="auth.register.successTitle">Check your email</h1>
      <p class="auth-subtitle" data-i18n="auth.register.successMsg">We sent a verification link to your inbox.</p>
      <a class="btn btn-secondary btn-block" href="/login.html" data-i18n="auth.register.backToLogin">Back to sign in</a>
    </div>
  `;
  applyTranslations(card);
}

async function handleSubmit(e) {
  e.preventDefault();
  clearErrors();

  const values = {
    fullName: $('reg-name').value.trim(),
    email: $('reg-email').value.trim(),
    password: $('reg-password').value,
    confirm: $('reg-confirm').value,
    referralCode: $('reg-ref').value.trim(),
    language: getLanguage(),
  };

  if (!validate(values)) return;

  const payload = {
    fullName: values.fullName,
    email: values.email,
    password: values.password,
    language: values.language,
  };
  if (values.referralCode) payload.referralCode = values.referralCode;

  setLoading(true);
  const res = await api.post('/auth/register', payload);
  setLoading(false);

  if (res.success) {
    showSuccess();
    return;
  }

  // Surface a server validation detail if present, else a generic message.
  if (res.data && Array.isArray(res.data.details) && res.data.details.length) {
    showBanner(res.data.details[0].message);
  } else {
    showBanner(res.message || t('state.error.message'));
  }
}

function togglePassword(btn, inputId) {
  const input = $(inputId);
  if (!input) return;
  const showing = input.type === 'text';
  input.type = showing ? 'password' : 'text';
  const key = showing ? 'auth.show' : 'auth.hide';
  btn.textContent = t(key);
  btn.setAttribute('aria-label', t(key));
}

function init() {
  const logo = $('auth-logo');
  if (logo) logo.innerHTML = createLogoHTML('full');

  // Auto-fill referral code from ?ref=
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (ref) $('reg-ref').value = ref.trim().slice(0, 16);

  applyTranslations();

  const form = $('register-form');
  if (form) form.addEventListener('submit', handleSubmit);

  const pw = $('reg-password');
  if (pw) pw.addEventListener('input', () => renderStrength(pw.value));

  document
    .querySelector('[data-role="toggle-password"]')
    ?.addEventListener('click', (e) => togglePassword(e.currentTarget, 'reg-password'));
  document
    .querySelector('[data-role="toggle-confirm"]')
    ?.addEventListener('click', (e) => togglePassword(e.currentTarget, 'reg-confirm'));

  window.addEventListener('iqprec:languagechange', () => {
    setLoading(false);
    if (pw && pw.value) renderStrength(pw.value);
  });
}

document.addEventListener('DOMContentLoaded', init);
