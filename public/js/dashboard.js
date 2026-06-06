/* ============================================================
   IQPREC — dashboard.js
   Real FPL data on the dashboard:
     • current gameweek + live deadline countdown (turns red < 2h)
     • the manager's squad stat cards (or an empty "connect team" state)
   Loads after auth, i18n, layout. Uses /js/fpl.js for all API calls.
   ============================================================ */

import { applyTranslations, t } from './i18n.js';
import { formatNumber } from './ui.js';
import { fetchCurrentGameweek, fetchMySquad } from './fpl.js';

const RED_THRESHOLD_SECONDS = 7200; // 2 hours
let countdownTimer = null;

function $(id) {
  return document.getElementById(id);
}

/* ------------------------------------------------------------
   Scaffold — inject the dashboard stat grid into the page.
   ------------------------------------------------------------ */
function renderScaffold() {
  const main = document.querySelector('.content-body');
  if (!main || $('dash-top')) return;

  const top = document.createElement('section');
  top.id = 'dash-top';
  top.innerHTML = `
    <div class="dash-grid">
      <div class="stats-card" id="gw-card">
        <div class="stats-label" data-i18n="dash.gameweek">Gameweek</div>
        <div class="stats-number" id="gw-number">—</div>
        <div class="stats-sub" id="gw-countdown" aria-live="polite"></div>
      </div>
      <div class="stats-card accent-gold" id="squad-points-card">
        <div class="stats-label" data-i18n="dash.points">Total points</div>
        <div class="stats-number" id="squad-points">—</div>
        <div class="stats-sub" id="squad-gw-points"></div>
      </div>
      <div class="stats-card accent-blue" id="squad-value-card">
        <div class="stats-label" data-i18n="dash.teamValue">Team value</div>
        <div class="stats-number" id="squad-value">—</div>
      </div>
      <div class="stats-card" id="squad-bank-card">
        <div class="stats-label" data-i18n="dash.inBank">In the bank</div>
        <div class="stats-number" id="squad-bank">—</div>
      </div>
    </div>
    <div id="squad-empty" hidden></div>
  `;

  const h1 = main.querySelector('h1');
  if (h1 && h1.nextSibling) main.insertBefore(top, h1.nextSibling);
  else main.prepend(top);

  applyTranslations(top);
}

/* ------------------------------------------------------------
   Deadline countdown
   ------------------------------------------------------------ */
function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${d}d ${h}h ${m}m ${sec}s`;
}

function startCountdown(deadlineIso) {
  const el = $('gw-countdown');
  const card = $('gw-card');
  if (!el || !deadlineIso) return;

  const deadline = new Date(deadlineIso).getTime();
  if (Number.isNaN(deadline)) return;

  if (countdownTimer) clearInterval(countdownTimer);

  const tick = () => {
    const remaining = (deadline - Date.now()) / 1000;
    if (remaining <= 0) {
      el.textContent = t('dash.deadlinePassed');
      card?.classList.remove('accent-red');
      clearInterval(countdownTimer);
      countdownTimer = null;
      return;
    }
    el.textContent = formatCountdown(remaining);
    card?.classList.toggle('accent-red', remaining < RED_THRESHOLD_SECONDS);
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* ------------------------------------------------------------
   Loaders
   ------------------------------------------------------------ */
async function loadGameweek() {
  try {
    const gw = await fetchCurrentGameweek();
    const numEl = $('gw-number');
    if (numEl) numEl.textContent = gw.gameweek != null ? `GW${gw.gameweek}` : '—';
    if (gw.deadlineTime) startCountdown(gw.deadlineTime);
    return gw;
  } catch {
    const numEl = $('gw-number');
    if (numEl) numEl.textContent = '—';
    return null;
  }
}

function renderSquadEmpty() {
  // Keep the GW card; hide squad cards, show the connect-team prompt.
  ['squad-points-card', 'squad-value-card', 'squad-bank-card'].forEach((id) => {
    const el = $(id);
    if (el) el.hidden = true;
  });
  const empty = $('squad-empty');
  if (!empty) return;
  empty.hidden = false;
  empty.innerHTML = `
    <div class="card state state-empty">
      <p class="state-title" data-i18n="dash.noTeam.title">${t('dash.noTeam.title')}</p>
      <p class="state-message" data-i18n="dash.noTeam.msg">${t('dash.noTeam.msg')}</p>
      <a class="btn btn-primary" href="/onboarding.html" data-i18n="dash.connectTeam">${t('dash.connectTeam')}</a>
    </div>
  `;
  applyTranslations(empty);
}

function renderSquad(squad) {
  const empty = $('squad-empty');
  if (empty) empty.hidden = true;
  ['squad-points-card', 'squad-value-card', 'squad-bank-card'].forEach((id) => {
    const el = $(id);
    if (el) el.hidden = false;
  });

  const pts = $('squad-points');
  if (pts) pts.textContent = formatNumber(squad.points ?? 0);
  const gwPts = $('squad-gw-points');
  if (gwPts && squad.gameweekPoints != null) {
    gwPts.textContent = `${t('dash.gwPoints')}: ${formatNumber(squad.gameweekPoints)}`;
  }
  const val = $('squad-value');
  if (val) val.textContent = `£${Number(squad.teamValue ?? 0).toFixed(1)}m`;
  const bank = $('squad-bank');
  if (bank) bank.textContent = `£${Number(squad.bankValue ?? 0).toFixed(1)}m`;
}

async function loadSquad() {
  try {
    const data = await fetchMySquad();
    if (!data.connected || !data.squad) {
      renderSquadEmpty();
      return;
    }
    renderSquad(data.squad);
  } catch {
    renderSquadEmpty();
  }
}

/* ------------------------------------------------------------
   Init
   ------------------------------------------------------------ */
function init() {
  applyTranslations();
  renderScaffold();
  loadGameweek();
  loadSquad();
}

// Stop the countdown when the page is hidden/unloaded.
window.addEventListener('beforeunload', () => {
  if (countdownTimer) clearInterval(countdownTimer);
});

document.addEventListener('DOMContentLoaded', init);
