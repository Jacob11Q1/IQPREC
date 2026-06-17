/* ============================================================
   IQPREC — chips.js
   Chip Planner page. Manager selects which chips are still available,
   then AI advises: PLAY NOW / HOLD / NOT YET for each chip with a
   confidence score and reasoning based on their squad + fixtures.
   Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations, t, getLanguage } from './i18n.js';
import { callAIEndpoint } from './ai.js';
import { fetchCurrentGameweek, fetchMySquad } from './fpl.js';

const CHIPS = [
  { id: 'wildcard',      icon: '🔄', key: 'chipsPage.wildcard' },
  { id: 'freehit',       icon: '⚡', key: 'chipsPage.freehit' },
  { id: 'triplecaptain', icon: '👑', key: 'chipsPage.triplecaptain' },
  { id: 'benchboost',    icon: '📈', key: 'chipsPage.benchboost' },
];

const state = {
  gameweek: null,
  squadIds: [],
  connected: false,
  selectedChips: new Set(['wildcard', 'freehit', 'triplecaptain', 'benchboost']),
};

function $(sel, root = document) { return root.querySelector(sel); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function toParas(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/* ---- Scaffold ---- */
function renderScaffold() {
  const main = $('.content-body');
  if (!main) return;
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title" data-i18n="chipsPage.title">Chip Planner</h1>
        <p class="page-sub" data-i18n="chipsPage.sub">When should you play your chips?</p>
      </div>
      <span class="gw-badge" id="gw-badge" aria-live="polite">—</span>
    </div>

    <div class="card chips-selector" id="chips-selector">
      <div class="card-header">
        <span class="card-title" data-i18n="chipsPage.selectChips">Select your available chips</span>
      </div>
      <div class="chips-toggle-grid" id="chips-toggle-grid">
        ${CHIPS.map((c) => `
          <button
            class="chip-toggle chip-toggle--on"
            type="button"
            data-chip="${c.id}"
            aria-pressed="true"
          >
            <span class="chip-icon" aria-hidden="true">${c.icon}</span>
            <span class="chip-toggle-label" data-i18n="${c.key}">${esc(t(c.key))}</span>
            <span class="chip-toggle-state" data-i18n="chipsPage.available">${esc(t('chipsPage.available'))}</span>
          </button>`).join('')}
      </div>
    </div>

    <div class="generate-bar">
      <button class="btn btn-primary btn-lg btn-generate" id="generate-btn" type="button" disabled>
        <svg class="bolt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <span data-i18n="chipsPage.generate">Generate Chip Plan</span>
      </button>
    </div>

    <section id="chips-results" class="ai-analysis card" hidden></section>
  `;
  applyTranslations(main);
}

/* ---- Toggle ---- */
function toggleChip(id) {
  if (state.selectedChips.has(id)) {
    state.selectedChips.delete(id);
  } else {
    state.selectedChips.add(id);
  }
  const btn = $(`[data-chip="${id}"]`);
  if (!btn) return;
  const on = state.selectedChips.has(id);
  btn.classList.toggle('chip-toggle--on', on);
  btn.classList.toggle('chip-toggle--off', !on);
  btn.setAttribute('aria-pressed', String(on));
  const stateSpan = btn.querySelector('.chip-toggle-state');
  if (stateSpan) {
    stateSpan.setAttribute('data-i18n', on ? 'chipsPage.available' : 'chipsPage.used');
    stateSpan.textContent = t(on ? 'chipsPage.available' : 'chipsPage.used');
  }
  // Disable generate if nothing selected
  const generateBtn = $('#generate-btn');
  if (generateBtn) generateBtn.disabled = !state.selectedChips.size || !state.connected || state.gameweek == null;
}

/* ---- Renders ---- */
function renderNoTeam() {
  const selector = $('#chips-selector');
  const bar = $('.generate-bar');
  if (bar) bar.hidden = true;
  if (selector) {
    selector.innerHTML = `
      <div class="state state-empty">
        <p class="state-title" data-i18n="chipsPage.noTeamTitle">${esc(t('chipsPage.noTeamTitle'))}</p>
        <p class="state-message" data-i18n="chipsPage.noTeamMsg">${esc(t('chipsPage.noTeamMsg'))}</p>
        <a class="btn btn-primary" href="/onboarding.html" data-i18n="dash.connectTeam">${esc(t('dash.connectTeam'))}</a>
      </div>`;
    applyTranslations(selector);
  }
}

function renderLoading() {
  const host = $('#chips-results');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `
    <div class="card-header"><span class="card-title" data-i18n="chipsPage.results">${esc(t('chipsPage.results'))}</span></div>
    ${Array(state.selectedChips.size || 2).fill(0).map(() => `
      <div class="chip-result-skeleton">
        <div class="skeleton skeleton-text w-40"></div>
        <div class="skeleton skeleton-text w-100" style="margin-top:8px"></div>
        <div class="skeleton skeleton-text w-75"></div>
      </div>`).join('')}`;
  applyTranslations(host);
}

function parseVerdicts(text) {
  const PLAY = /play now|العب الآن|يستحق اللعب الآن/i;
  const HOLD = /\bhold\b|احتفظ/i;
  const lines = String(text || '');

  const results = {};
  for (const chip of CHIPS) {
    const names = {
      wildcard: /wildcard|ورقة البدل/i,
      freehit: /free.?hit|الضربة المجانية/i,
      triplecaptain: /triple.?captain|الكابتن الثلاثي/i,
      benchboost: /bench.?boost|تعزيز الاحتياطي/i,
    };
    const re = names[chip.id];
    const match = lines.match(new RegExp(`${re.source}[^\\n]*\\n?([^\\n]*)`, 'i'));
    if (match) {
      const context = match[0];
      results[chip.id] = PLAY.test(context) ? 'play' : HOLD.test(context) ? 'hold' : 'notyet';
    }
  }
  return results;
}

function verdictBadge(verdict) {
  if (verdict === 'play') return `<span class="verdict-badge verdict-play" data-i18n="chipsPage.playNow">${esc(t('chipsPage.playNow'))}</span>`;
  if (verdict === 'hold') return `<span class="verdict-badge verdict-hold" data-i18n="chipsPage.hold">${esc(t('chipsPage.hold'))}</span>`;
  return `<span class="verdict-badge verdict-notyet" data-i18n="chipsPage.notYet">${esc(t('chipsPage.notYet'))}</span>`;
}

function renderResult(text) {
  const host = $('#chips-results');
  if (!host) return;
  const verdicts = parseVerdicts(text);
  host.hidden = false;
  host.innerHTML = `
    <div class="card-header">
      <span class="card-title" data-i18n="chipsPage.results">${esc(t('chipsPage.results'))}</span>
    </div>
    <div class="chip-verdicts">
      ${CHIPS.filter((c) => state.selectedChips.has(c.id)).map((c) => {
        const verdict = verdicts[c.id] || 'notyet';
        return `
          <div class="chip-verdict-row">
            <span class="chip-verdict-icon" aria-hidden="true">${c.icon}</span>
            <span class="chip-verdict-name" data-i18n="${c.key}">${esc(t(c.key))}</span>
            ${verdictBadge(verdict)}
          </div>`;
      }).join('')}
    </div>
    <div class="analysis-body" lang="${getLanguage()}">${toParas(text)}</div>`;
  applyTranslations(host);
}

function renderError(message) {
  const host = $('#chips-results');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `
    <div class="state state-error" role="alert">
      <p class="state-title">${esc(t('chipsPage.failed'))}</p>
      <p class="state-message">${esc(message || '')}</p>
      <button class="btn btn-secondary" type="button" id="retry-btn" data-i18n="action.retry">${esc(t('action.retry'))}</button>
    </div>`;
  $('#retry-btn')?.addEventListener('click', generate);
  applyTranslations(host);
}

/* ---- Generate ---- */
let busy = false;
async function generate() {
  if (busy || !state.connected || !state.squadIds.length || !state.selectedChips.size) return;
  busy = true;
  const btn = $('#generate-btn');
  if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
  renderLoading();

  try {
    const data = await callAIEndpoint('/ai/chips', {
      squadPlayerIds: state.squadIds,
      gameweek: state.gameweek,
      language: getLanguage(),
      availableChips: [...state.selectedChips],
    });
    renderResult(data.recommendation || '');
  } catch (err) {
    const msg = err.code === 'AI_4001' || err.code === 'RATE_LIMITED'
      ? t('chipsPage.rateLimited')
      : err.message;
    renderError(msg);
  } finally {
    busy = false;
    if (btn) {
      btn.disabled = !state.selectedChips.size || !state.connected || state.gameweek == null;
      btn.classList.remove('is-loading');
    }
  }
}

/* ---- Init ---- */
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
      state.squadIds = squad.squad.picks
        .map((p) => p.player?.id ?? p.element ?? p.id)
        .filter((n) => Number.isInteger(Number(n)))
        .map(Number);
    } else {
      renderNoTeam();
      return;
    }
  } catch {
    renderNoTeam();
    return;
  }

  const btn = $('#generate-btn');
  if (btn && state.gameweek != null && state.selectedChips.size) btn.disabled = false;
}

function wire() {
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.chip-toggle');
    if (toggle) { toggleChip(toggle.dataset.chip); return; }
    if (e.target.closest('#generate-btn')) generate();
  });

  window.addEventListener('iqprec:languagechange', () => applyTranslations());
}

function init() {
  renderScaffold();
  wire();
  loadContext();
}

document.addEventListener('DOMContentLoaded', init);
