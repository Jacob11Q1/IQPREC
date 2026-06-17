/* ============================================================
   IQPREC — onboarding.js
   3-step first-run flow (a full page, not an overlay):
     1) language selection  → setLanguage + advance
     2) FPL team ID         → validate (numbers only) / confirm or skip
     3) trial confirmation  → go to dashboard, or open subscribe modal
   The subscribe button (data-action="subscribe") is handled globally
   by trial.js, which is loaded on this page.
   ============================================================ */

import { t, applyTranslations, setLanguage } from './i18n.js';
import { api } from './api.js';

const ONB_KEY = 'iqprec_onboarding';
const TOTAL_STEPS = 3;
let currentStep = 1;

function $(id) {
  return document.getElementById(id);
}

function renderCounter() {
  const el = $('step-counter');
  if (el) el.textContent = t('auth.onboarding.step', { n: currentStep });
}

function goToStep(step) {
  currentStep = Math.min(TOTAL_STEPS, Math.max(1, step));

  document.querySelectorAll('.onb-step').forEach((sec) => {
    const isCurrent = Number(sec.dataset.step) === currentStep;
    sec.classList.toggle('is-active', isCurrent);
    sec.hidden = !isCurrent;
  });

  document.querySelectorAll('.step-dot').forEach((dot) => {
    const n = Number(dot.dataset.step);
    dot.classList.toggle('is-active', n === currentStep);
    dot.classList.toggle('is-done', n < currentStep);
  });

  const indicator = $('step-indicator');
  if (indicator) indicator.setAttribute('aria-valuenow', String(currentStep));

  const back = $('onb-back');
  if (back) back.hidden = currentStep === 1;

  renderCounter();
}

/* ------------------------------------------------------------
   Step 2 — FPL team ID validation + persistence
   ------------------------------------------------------------ */
function saveOnboarding(data) {
  let existing = {};
  try {
    existing = JSON.parse(sessionStorage.getItem(ONB_KEY) || '{}');
  } catch {
    existing = {};
  }
  const merged = { ...existing, ...data };
  try {
    sessionStorage.setItem(ONB_KEY, JSON.stringify(merged));
  } catch {
    /* sessionStorage may be unavailable — non-fatal */
  }
  // NOTE: server-side persistence (PUT /app/profile) lands with the
  // authenticated profile endpoint on a later day. Stored locally for now.
}

async function confirmFplTeam() {
  const input = $('fpl-id');
  const err = $('fpl-error');
  const btn = document.querySelector('[data-role="fpl-confirm"]');
  const value = (input?.value || '').trim();

  if (!/^\d{1,9}$/.test(value)) {
    if (err) {
      err.textContent = t('auth.onboarding.s2.invalid');
      err.hidden = false;
    }
    input?.classList.add('input-error');
    return;
  }

  if (err) err.hidden = true;
  input?.classList.remove('input-error');

  if (btn) btn.disabled = true;
  try {
    await api.put('/app/profile', { fplTeamId: Number(value) });
  } catch {
    /* non-fatal — still advance; team ID saved locally as fallback */
  } finally {
    if (btn) btn.disabled = false;
  }

  saveOnboarding({ fplTeamId: Number(value) });
  goToStep(3);
}

function skipFplTeam() {
  saveOnboarding({ fplTeamId: null, skipped: true });
  goToStep(3);
}

/* ------------------------------------------------------------
   Wiring
   ------------------------------------------------------------ */
function wire() {
  // Step 1: language buttons
  document.querySelectorAll('.lang-choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      setLanguage(lang); // persists + flips dir/lang + re-applies translations
      saveOnboarding({ language: lang });
      goToStep(2);
    });
  });

  // Step 2: confirm / skip
  $('fpl-id')?.addEventListener('input', (e) => {
    // keep digits only as the user types
    e.target.value = e.target.value.replace(/\D/g, '');
  });
  document
    .querySelector('[data-role="fpl-confirm"]')
    ?.addEventListener('click', confirmFplTeam);
  document
    .querySelector('[data-role="fpl-skip"]')
    ?.addEventListener('click', skipFplTeam);

  // Step 3: start → dashboard (subscribe is handled by trial.js globally)
  document
    .querySelector('[data-role="onb-start"]')
    ?.addEventListener('click', () => {
      window.location.href = '/dashboard.html';
    });

  // Back
  $('onb-back')?.addEventListener('click', () => goToStep(currentStep - 1));

  // Re-render the interpolated counter when language changes.
  window.addEventListener('iqprec:languagechange', renderCounter);
}

function init() {
  applyTranslations();
  wire();
  goToStep(1);
}

document.addEventListener('DOMContentLoaded', init);
