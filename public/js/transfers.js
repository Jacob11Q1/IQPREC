/* ============================================================
   IQPREC — transfers.js
   Transfers page controller. Shows the manager's 15-man squad with weak
   players auto-highlighted (red = unavailable, amber = cold form), then
   generates AI transfer suggestions (OUT/IN + hit analysis + wildcard
   signal) into the analysis panel. Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations, t, getLanguage } from './i18n.js';
import { callAIEndpoint } from './ai.js';
import { fetchCurrentGameweek, fetchMySquad } from './fpl.js';
import { formatNumber } from './ui.js';

const state = {
  gameweek: null,
  squadIds: [],
  picks: [],
  connected: false,
  transfersAvailable: 1,
  bankValue: 0,
};

function $(sel, root = document) { return root.querySelector(sel); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function toParas(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

const POS_CLASS = { 1: 'pos-gk', 2: 'pos-def', 3: 'pos-mid', 4: 'pos-fwd' };

/* unavailable → red; cold form (<3) → amber. */
function weakness(p) {
  if (!p) return '';
  const unavailable = (p.status && p.status !== 'a') || Number(p.chance_of_playing) < 75;
  if (unavailable) return 'weak-out';
  if (Number(p.form) < 3) return 'weak-form';
  return '';
}

/* ------------------------------------------------------------
   Scaffold
   ------------------------------------------------------------ */
function renderScaffold() {
  const main = $('.content-body');
  if (!main) return;
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title" data-i18n="transfersPage.title">Transfers</h1>
        <p class="page-sub" data-i18n="transfersPage.sub">Smart moves, never wasted hits.</p>
      </div>
      <span class="gw-badge" id="gw-badge" aria-live="polite">—</span>
    </div>

    <div class="transfer-meta" id="transfer-meta" hidden>
      <div class="meta-chip"><span data-i18n="transfersPage.free">Free transfers</span>
        <strong id="meta-transfers">—</strong></div>
      <div class="meta-chip"><span data-i18n="dash.bank">In the bank</span>
        <strong id="meta-bank">—</strong></div>
    </div>

    <section id="squad-grid" class="squad-grid card" aria-label="My squad"></section>

    <div class="generate-bar">
      <button class="btn btn-primary btn-lg btn-generate" id="generate-btn" type="button" disabled>
        <svg class="bolt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        <span data-i18n="transfersPage.generate">Generate Transfer Plan</span>
      </button>
    </div>

    <section id="wildcard-banner" hidden></section>
    <section id="transfers-analysis" class="ai-analysis card" hidden></section>
  `;
  applyTranslations(main);
}

/* ------------------------------------------------------------
   Squad grid (weak players highlighted)
   ------------------------------------------------------------ */
function playerChip(pick) {
  const p = pick.player || {};
  const cls = weakness(p);
  const pos = POS_CLASS[p.element_type] || 'pos-mid';
  const name = p.web_name || '—';
  const price = p.now_cost != null ? `£${(Number(p.now_cost) / 10).toFixed(1)}m` : '';
  const form = p.form != null ? `${t('dash.form')} ${p.form}` : '';
  return `
    <div class="squad-chip ${cls}">
      <span class="player-circle ${pos}${pick.is_captain ? ' is-captain' : ''}">${esc(name.slice(0, 3).toUpperCase())}</span>
      <span class="chip-name">${esc(name)}</span>
      <span class="chip-meta">${esc(price)}${form ? ' · ' + esc(form) : ''}</span>
    </div>`;
}

function renderSquadGrid() {
  const host = $('#squad-grid');
  if (!host) return;
  const ordered = [...state.picks].sort((a, b) => (a.position || 0) - (b.position || 0));
  const weakCount = ordered.filter((p) => weakness(p.player)).length;
  host.innerHTML = `
    <div class="card-header">
      <span class="card-title" data-i18n="transfersPage.mySquad">My squad</span>
      ${weakCount ? `<span class="weak-count">${esc(t('transfersPage.weakFlagged', { n: weakCount }))}</span>` : ''}
    </div>
    <div class="squad-chips">${ordered.map(playerChip).join('')}</div>
    <div class="weak-legend">
      <span class="legend-item"><span class="dot dot-red"></span>${esc(t('transfersPage.legendOut'))}</span>
      <span class="legend-item"><span class="dot dot-amber"></span>${esc(t('transfersPage.legendForm'))}</span>
    </div>`;
  applyTranslations(host);
}

function renderNoTeam() {
  const host = $('#squad-grid');
  const bar = $('.generate-bar');
  if (bar) bar.hidden = true;
  if (host) {
    host.innerHTML = `
      <div class="state state-empty">
        <p class="state-title">${esc(t('transfersPage.noTeamTitle'))}</p>
        <p class="state-message">${esc(t('transfersPage.noTeamMsg'))}</p>
        <a class="btn btn-primary" href="/onboarding.html">${esc(t('dash.connectTeam'))}</a>
      </div>`;
  }
}

/* ------------------------------------------------------------
   AI analysis + wildcard banner
   ------------------------------------------------------------ */
function maybeWildcard(text) {
  const banner = $('#wildcard-banner');
  if (!banner) return;
  const t1 = String(text || '').toLowerCase();
  const isWildcard = /wildcard|waraqat|ورقة البدل|وايلد/.test(t1);
  if (isWildcard) {
    banner.hidden = false;
    banner.innerHTML = `
      <div class="wildcard-banner">
        <strong>${esc(t('transfersPage.wildcardTitle'))}</strong>
        <span>${esc(t('transfersPage.wildcardMsg'))}</span>
      </div>`;
  } else {
    banner.hidden = true;
    banner.innerHTML = '';
  }
}

function renderLoading() {
  const host = $('#transfers-analysis');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `
    <div class="card-header"><span class="card-title">${esc(t('transfersPage.suggestions'))}</span></div>
    <div class="skeleton skeleton-text w-100"></div>
    <div class="skeleton skeleton-text w-75"></div>
    <div class="skeleton skeleton-text w-100"></div>
    <div class="skeleton skeleton-text w-50"></div>`;
}

function renderAnalysis(text) {
  const host = $('#transfers-analysis');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `
    <div class="card-header"><span class="card-title" data-i18n="transfersPage.suggestions">Transfer suggestions</span></div>
    <div class="analysis-body" lang="${getLanguage()}">${toParas(text)}</div>`;
  applyTranslations(host);
  maybeWildcard(text);
}

function renderError(message) {
  const host = $('#transfers-analysis');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `
    <div class="state state-error" role="alert">
      <p class="state-title">${esc(t('transfersPage.failed'))}</p>
      <p class="state-message">${esc(message || '')}</p>
      <button class="btn btn-secondary" type="button" id="retry-btn" data-i18n="action.retry">${esc(t('action.retry'))}</button>
    </div>`;
  $('#retry-btn')?.addEventListener('click', generate);
}

/* ------------------------------------------------------------
   Generate
   ------------------------------------------------------------ */
let busy = false;
async function generate() {
  if (busy || !state.connected || !state.squadIds.length || state.gameweek == null) return;
  busy = true;
  const btn = $('#generate-btn');
  if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
  renderLoading();

  try {
    const data = await callAIEndpoint('/ai/transfers', {
      squadPlayerIds: state.squadIds,
      gameweek: state.gameweek,
      language: getLanguage(),
      transfersAvailable: Math.min(2, Math.max(1, Number(state.transfersAvailable) || 1)),
      bankValue: Math.max(0, Number(state.bankValue) || 0),
    });
    renderAnalysis(data.recommendation || '');
  } catch (err) {
    const msg = err.code === 'AI_4001' || err.code === 'RATE_LIMITED'
      ? t('transfersPage.rateLimited')
      : err.message;
    renderError(msg);
  } finally {
    busy = false;
    if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
  }
}

/* ------------------------------------------------------------
   Init
   ------------------------------------------------------------ */
async function loadContext() {
  const badge = $('#gw-badge');
  try {
    const gw = await fetchCurrentGameweek();
    state.gameweek = gw.gameweek;
    if (badge) badge.textContent = gw.gameweek != null ? `GW${gw.gameweek}` : '—';
  } catch {
    if (badge) badge.textContent = '—';
  }

  try {
    const squad = await fetchMySquad();
    if (squad.connected && squad.squad?.picks?.length) {
      state.connected = true;
      state.picks = squad.squad.picks;
      state.squadIds = squad.squad.picks
        .map((p) => p.player?.id ?? p.element ?? p.id)
        .filter((n) => Number.isInteger(Number(n)))
        .map(Number);
      state.transfersAvailable = squad.squad.transfersAvailable ?? 1;
      state.bankValue = squad.squad.bankValue ?? 0;

      const meta = $('#transfer-meta');
      if (meta) meta.hidden = false;
      const mt = $('#meta-transfers');
      if (mt) mt.textContent = formatNumber(Math.min(2, Math.max(1, state.transfersAvailable)));
      const mb = $('#meta-bank');
      if (mb) mb.textContent = `£${Number(state.bankValue).toFixed(1)}m`;

      renderSquadGrid();
    } else {
      renderNoTeam();
      return;
    }
  } catch {
    renderNoTeam();
    return;
  }

  const btn = $('#generate-btn');
  if (btn && state.gameweek != null) btn.disabled = false;
}

function wire() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('#generate-btn')) generate();
  });
  window.addEventListener('iqprec:languagechange', () => {
    const main = $('.content-body');
    if (main) applyTranslations(main);
    if (state.connected) renderSquadGrid();
  });
}

function init() {
  renderScaffold();
  wire();
  loadContext();
}

document.addEventListener('DOMContentLoaded', init);
