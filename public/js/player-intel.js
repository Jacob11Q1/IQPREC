/* ============================================================
   IQPREC — player-intel.js
   Player Intel page. Debounced search → pick player → show full stats.
   Only shows active current-season players (server enforces this).
   Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations, t } from './i18n.js';
import { debouncedSearchPlayers, fetchPlayer } from './fpl.js';

const POS_CLASS = { 1: 'pos-gk', 2: 'pos-def', 3: 'pos-mid', 4: 'pos-fwd' };
const POS_NAME = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

function $(sel, root = document) { return root.querySelector(sel); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

/* ---- Scaffold ---- */
function renderScaffold() {
  const main = $('.content-body');
  if (!main) return;
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title" data-i18n="intelPage.title">Player Intel</h1>
        <p class="page-sub" data-i18n="intelPage.sub">Detailed stats for any active FPL player.</p>
      </div>
    </div>

    <div class="search-bar card">
      <label class="search-label sr-only" for="player-search" data-i18n="intelPage.search">Search for a player</label>
      <div class="search-field">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             width="18" height="18" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          type="search"
          id="player-search"
          class="search-input"
          autocomplete="off"
          maxlength="50"
          data-i18n-placeholder="intelPage.searchPh"
          placeholder="Type player name…"
        >
        <div class="search-dropdown" id="search-dropdown" hidden role="listbox"></div>
      </div>
    </div>

    <section class="card" id="player-detail" aria-live="polite">
      <div class="state state-empty intel-empty">
        <p class="state-title" data-i18n="intelPage.selectPlayer">Select a player to view their stats.</p>
      </div>
    </section>
  `;
  applyTranslations(main);
}

/* ---- Dropdown ---- */
function renderSearchResults(players) {
  const dropdown = $('#search-dropdown');
  if (!dropdown) return;
  if (!players.length) {
    dropdown.hidden = false;
    dropdown.innerHTML = `<div class="search-no-results" data-i18n="intelPage.noResults">${esc(t('intelPage.noResults'))}</div>`;
    return;
  }
  dropdown.hidden = false;
  dropdown.innerHTML = players.map((p) => {
    const pos = POS_NAME[p.element_type] || '—';
    const posClass = POS_CLASS[p.element_type] || 'pos-mid';
    const price = p.now_cost != null ? `£${(Number(p.now_cost) / 10).toFixed(1)}m` : '';
    return `
      <button class="search-result-item" type="button" data-id="${esc(p.id)}" data-name="${esc(p.web_name || '')}" role="option">
        <span class="player-circle player-circle--sm ${posClass}">${esc((p.web_name || '').slice(0, 3).toUpperCase())}</span>
        <span class="result-info">
          <span class="result-name">${esc(p.web_name || '—')}</span>
          <span class="result-meta">${esc(p.team_name || '')} · ${esc(pos)} · ${esc(price)}</span>
        </span>
      </button>`;
  }).join('');
}

function closeDropdown() {
  const d = $('#search-dropdown');
  if (d) { d.hidden = true; d.innerHTML = ''; }
}

/* ---- Player detail ---- */
function renderLoading() {
  const host = $('#player-detail');
  if (!host) return;
  host.innerHTML = `
    <div class="card-header"><div class="skeleton skeleton-text w-40"></div></div>
    <div class="intel-stats-grid">
      ${Array(6).fill(0).map(() => `
        <div class="intel-stat-card">
          <div class="skeleton skeleton-text w-60"></div>
          <div class="skeleton skeleton-text w-40" style="margin-top:6px"></div>
        </div>`).join('')}
    </div>`;
}

function renderDetail(player, summary) {
  const host = $('#player-detail');
  if (!host) return;

  const price = player.now_cost != null ? `£${(Number(player.now_cost) / 10).toFixed(1)}m` : '—';
  const posClass = POS_CLASS[player.element_type] || 'pos-mid';
  const pos = POS_NAME[player.element_type] || '—';
  const statusOk = !player.status || player.status === 'a';
  const statusDub = player.status === 'd';
  const statusCls = statusOk ? 'status-ok' : statusDub ? 'status-warn' : 'status-bad';
  const statusSym = statusOk ? '✓' : statusDub ? '⚠' : '✗';
  const news = player.news
    ? `<div class="intel-news"><strong>${esc(t('intelPage.news'))}:</strong> ${esc(player.news)}</div>`
    : '';

  const STATS = [
    { key: 'intelPage.pts',     val: player.total_points },
    { key: 'intelPage.form',    val: player.form },
    { key: 'intelPage.xG',      val: player.expected_goals },
    { key: 'intelPage.xA',      val: player.expected_assists },
    { key: 'intelPage.minutes', val: player.minutes },
    { key: 'intelPage.owned',   val: player.selected_by_percent != null ? `${player.selected_by_percent}%` : null },
  ];

  const history = summary?.history?.slice(-5) || [];
  const historyHtml = history.length ? `
    <div class="intel-history">
      <h3 class="intel-section-title">Last ${history.length} GW</h3>
      <div class="history-bars">
        ${history.map((gw) => {
          const pts = Number(gw.total_points ?? gw.points ?? 0);
          const h = Math.max(8, Math.min(100, pts * 8));
          return `<div class="history-bar" style="--h:${h}%" title="GW${gw.round||'?'}: ${pts}pts">
            <span class="history-pts">${pts}</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : '';

  host.innerHTML = `
    <div class="card-header intel-player-header">
      <div class="intel-player-id">
        <span class="player-circle player-circle--lg ${posClass}">${esc((player.web_name || '').slice(0, 3).toUpperCase())}</span>
        <div>
          <div class="intel-player-name">${esc(player.web_name || '—')}</div>
          <div class="intel-player-meta">${esc(player.team_name || '')} · ${esc(pos)} · ${esc(price)}</div>
        </div>
      </div>
      <span class="intel-status ${statusCls}">${statusSym}</span>
    </div>
    ${news}
    <div class="intel-stats-grid">
      ${STATS.map(({ key, val }) => `
        <div class="intel-stat-card">
          <div class="intel-stat-label" data-i18n="${key}">${esc(t(key))}</div>
          <div class="intel-stat-value mono">${esc(String(val ?? '—'))}</div>
        </div>`).join('')}
    </div>
    ${historyHtml}`;
  applyTranslations(host);
}

function renderDetailError() {
  const host = $('#player-detail');
  if (!host) return;
  host.innerHTML = `
    <div class="state state-error" role="alert">
      <p class="state-title" data-i18n="intelPage.failed">${esc(t('intelPage.failed'))}</p>
    </div>`;
  applyTranslations(host);
}

async function loadPlayer(id) {
  renderLoading();
  closeDropdown();
  try {
    const data = await fetchPlayer(id);
    renderDetail(data.player || {}, data.summary || {});
  } catch {
    renderDetailError();
  }
}

/* ---- Wire ---- */
function wire() {
  const input = $('#player-search');
  if (input) {
    input.addEventListener('input', async (e) => {
      const q = e.target.value.trim();
      if (q.length < 2) { closeDropdown(); return; }
      try {
        const data = await debouncedSearchPlayers(q);
        renderSearchResults(data.players || []);
      } catch {
        closeDropdown();
      }
    });
    input.addEventListener('blur', () => setTimeout(closeDropdown, 180));
    input.addEventListener('focus', (e) => {
      if (e.target.value.trim().length >= 2) {
        const dropdown = $('#search-dropdown');
        if (dropdown && dropdown.innerHTML) dropdown.hidden = false;
      }
    });
  }

  document.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (item) {
      const id = Number(item.dataset.id);
      if (id) {
        const inp = $('#player-search');
        if (inp) inp.value = item.dataset.name || '';
        loadPlayer(id);
      }
    }
  });

  window.addEventListener('iqprec:languagechange', () => applyTranslations());
}

function init() {
  renderScaffold();
  wire();
}

document.addEventListener('DOMContentLoaded', init);
