/* ============================================================
   IQPREC — mini-league.js
   Mini-League Spy page. User enters a classic league ID to load
   standings. Rate-limited server-side; the table is pageable but
   defaults to page 1 (top 50 managers).
   Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations, t } from './i18n.js';
import { fetchMiniLeague } from './fpl.js';

let currentLeagueId = null;

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
        <h1 class="page-title" data-i18n="leaguePage.title">Mini-League</h1>
        <p class="page-sub" data-i18n="leaguePage.sub">Track your rivals and spot the gaps.</p>
      </div>
    </div>

    <div class="league-search-bar card">
      <label class="search-label" for="league-id-input" data-i18n="leaguePage.idLabel">League ID</label>
      <div class="league-search-field">
        <input
          type="number"
          id="league-id-input"
          class="search-input"
          min="1"
          data-i18n-placeholder="leaguePage.idPh"
          placeholder="Enter league ID…"
        >
        <button class="btn btn-primary" id="load-btn" type="button" data-i18n="leaguePage.load">Load Standings</button>
      </div>
      <p class="league-hint">
        Find the league ID in the URL on the FPL classic leagues page.
      </p>
    </div>

    <section class="card" id="league-host" aria-live="polite" hidden></section>
  `;
  applyTranslations(main);
}

/* ---- Renders ---- */
function renderLoading() {
  const host = $('#league-host');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `
    <div class="card-header">
      <div class="skeleton skeleton-text w-40"></div>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>
          ${['leaguePage.rank','leaguePage.manager','leaguePage.team','leaguePage.pts','leaguePage.gwPts']
            .map((k) => `<th data-i18n="${k}">${esc(t(k))}</th>`).join('')}
        </tr></thead>
        <tbody>${Array(10).fill(0).map(() =>
          `<tr>${Array(5).fill(0).map(() =>
            `<td><div class="skeleton skeleton-text w-75"></div></td>`
          ).join('')}</tr>`
        ).join('')}</tbody>
      </table>
    </div>`;
  applyTranslations(host);
}

function renderStandings(standings, leagueId) {
  const host = $('#league-host');
  if (!host) return;
  host.hidden = false;

  if (!standings.length) {
    host.innerHTML = `
      <div class="state state-empty">
        <p class="state-title" data-i18n="leaguePage.empty">${esc(t('leaguePage.empty'))}</p>
      </div>`;
    applyTranslations(host);
    return;
  }

  const rows = standings.map((entry, i) => {
    const rank = entry.rank ?? (i + 1);
    const prev = entry.last_rank;
    const arrow = prev == null ? '' : rank < prev
      ? '<span class="rank-arrow rank-up">↑</span>'
      : rank > prev
        ? '<span class="rank-arrow rank-down">↓</span>'
        : '<span class="rank-arrow rank-same">—</span>';
    return `
      <tr>
        <td class="mono rank-cell">${rank}${arrow}</td>
        <td>${esc(entry.player_name || '—')}</td>
        <td class="team-name-cell">${esc(entry.entry_name || '—')}</td>
        <td class="mono fw-bold">${esc(String(entry.total ?? '—'))}</td>
        <td class="mono">${esc(String(entry.event_total ?? '—'))}</td>
      </tr>`;
  }).join('');

  host.innerHTML = `
    <div class="card-header">
      <span class="card-title">${esc(t('leaguePage.title'))}</span>
      <span class="badge-count">${standings.length}</span>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>
          ${['leaguePage.rank','leaguePage.manager','leaguePage.team','leaguePage.pts','leaguePage.gwPts']
            .map((k) => `<th data-i18n="${k}">${esc(t(k))}</th>`).join('')}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  applyTranslations(host);
}

function renderError(code) {
  const host = $('#league-host');
  if (!host) return;
  host.hidden = false;
  const msg = code === 'FPL_3004' ? t('leaguePage.notFound') : t('leaguePage.failed');
  host.innerHTML = `
    <div class="state state-error" role="alert">
      <p class="state-title">${esc(msg)}</p>
      <button class="btn btn-secondary" type="button" id="retry-btn" data-i18n="action.retry">${esc(t('action.retry'))}</button>
    </div>`;
  $('#retry-btn')?.addEventListener('click', () => loadLeague(currentLeagueId));
  applyTranslations(host);
}

/* ---- Load ---- */
async function loadLeague(id) {
  if (!id || id <= 0) {
    const host = $('#league-host');
    if (host) {
      host.hidden = false;
      host.innerHTML = `
        <div class="state state-error" role="alert">
          <p class="state-title" data-i18n="leaguePage.invalidId">${esc(t('leaguePage.invalidId'))}</p>
        </div>`;
      applyTranslations(host);
    }
    return;
  }
  currentLeagueId = id;
  renderLoading();
  try {
    const data = await fetchMiniLeague(id, 1);
    renderStandings(data.standings || [], id);
  } catch (err) {
    renderError(err?.code);
  }
}

/* ---- Wire ---- */
function wire() {
  document.addEventListener('click', (e) => {
    if (e.target.closest('#load-btn')) {
      const id = Number($('#league-id-input')?.value?.trim());
      loadLeague(id);
    }
  });

  document.addEventListener('keydown', (e) => {
    const input = $('#league-id-input');
    if (e.target === input && e.key === 'Enter') loadLeague(Number(input.value?.trim()));
  });

  window.addEventListener('iqprec:languagechange', () => {
    applyTranslations();
    if (currentLeagueId) loadLeague(currentLeagueId);
  });
}

function init() {
  renderScaffold();
  wire();
}

document.addEventListener('DOMContentLoaded', init);
