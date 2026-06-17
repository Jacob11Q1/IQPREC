/* ============================================================
   IQPREC — arab-stars.js
   Arab Stars Watch page. Loads all Arab players active in the
   current FPL season (is_arab_player=true, status≠removed) and
   renders them sorted by total_points.
   Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations, t } from './i18n.js';
import { fetchArabStars } from './fpl.js';

const POS_NAME = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const POS_NAME_AR = { 1: 'حارس', 2: 'مدافع', 3: 'وسط', 4: 'مهاجم' };
const POS_CLASS = { 1: 'pos-gk', 2: 'pos-def', 3: 'pos-mid', 4: 'pos-fwd' };

function $(sel, root = document) { return root.querySelector(sel); }

function photoUrl(photo) {
  if (!photo) return null;
  const id = String(photo).replace('.jpg', '').replace('.png', '');
  return `https://resources.premierleague.com/premierleague/photos/players/110x140/p${id}.png`;
}

function wireImgFallbacks(root) {
  root.querySelectorAll('img.player-img').forEach((img) => {
    img.addEventListener('error', () => {
      img.hidden = true;
      const fb = img.nextElementSibling;
      if (fb && fb.classList.contains('player-img-fallback')) fb.hidden = false;
    });
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function posLabel(type) {
  const lang = window.currentLang || 'ar';
  return lang === 'ar' ? (POS_NAME_AR[type] || '—') : (POS_NAME[type] || '—');
}

const COL_KEYS = [
  'arabPage.player', 'arabPage.team', 'arabPage.pos',
  'arabPage.price', 'arabPage.form', 'arabPage.pts',
  'arabPage.goals', 'arabPage.assists', 'arabPage.owned',
];

function renderScaffold() {
  const main = $('.content-body');
  if (!main) return;
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title" data-i18n="arabPage.title">Arab Stars</h1>
        <p class="page-sub" data-i18n="arabPage.sub">Arab players active in FPL this season.</p>
      </div>
    </div>
    <section class="card" id="stars-host" aria-live="polite"></section>
  `;
  applyTranslations(main);
}

function tableHead() {
  return COL_KEYS.map((k) => `<th data-i18n="${k}">${esc(t(k))}</th>`).join('');
}

function renderLoading() {
  const host = $('#stars-host');
  if (!host) return;
  host.innerHTML = `
    <div class="card-header">
      <span class="card-title" data-i18n="arabPage.title">${esc(t('arabPage.title'))}</span>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>${tableHead()}</tr></thead>
        <tbody>${Array(8).fill(0).map(() =>
          `<tr>${Array(9).fill(0).map(() =>
            `<td><div class="skeleton skeleton-text w-75"></div></td>`
          ).join('')}</tr>`
        ).join('')}</tbody>
      </table>
    </div>`;
  applyTranslations(host);
}

function renderPlayers(players) {
  const host = $('#stars-host');
  if (!host) return;

  if (!players.length) {
    host.innerHTML = `
      <div class="state state-empty">
        <p class="state-title" data-i18n="arabPage.empty">${esc(t('arabPage.empty'))}</p>
      </div>`;
    applyTranslations(host);
    return;
  }

  const rows = players.map((p) => {
    const price = p.now_cost != null ? `£${(Number(p.now_cost) / 10).toFixed(1)}m` : '—';
    const pos = posLabel(p.element_type);
    const posClass = POS_CLASS[p.element_type] || 'pos-mid';
    const owned = p.selected_by_percent != null ? `${p.selected_by_percent}%` : '—';
    const formVal = Number(p.form ?? 0);
    const formCls = formVal >= 6 ? 'form-hot' : formVal < 3 ? 'form-cold' : '';
    const url = photoUrl(p.photo);
    const initials = esc((p.web_name || '').slice(0, 3).toUpperCase());
    const photoInner = url
      ? `<img src="${esc(url)}" alt="${esc(p.web_name || '')}" loading="lazy" class="player-img">
         <span class="player-initials player-img-fallback" hidden>${initials}</span>`
      : `<span class="player-initials">${initials}</span>`;
    return `
      <tr>
        <td class="player-name-cell">
          <div class="player-photo-ring player-photo-ring--sm ${posClass}">
            <div class="player-photo-inner">${photoInner}</div>
          </div>
          <span class="player-cell-name">${esc(p.web_name || '—')}</span>
        </td>
        <td>${esc(p.team_name || '—')}</td>
        <td><span class="pos-tag pos-tag--${posClass}">${esc(pos)}</span></td>
        <td class="mono">${esc(price)}</td>
        <td class="mono ${formCls}">${esc(String(p.form ?? '—'))}</td>
        <td class="mono fw-bold">${esc(String(p.total_points ?? '—'))}</td>
        <td class="mono">${esc(String(p.goals_scored ?? '—'))}</td>
        <td class="mono">${esc(String(p.assists ?? '—'))}</td>
        <td class="mono">${esc(owned)}</td>
      </tr>`;
  }).join('');

  host.innerHTML = `
    <div class="card-header">
      <span class="card-title" data-i18n="arabPage.title">${esc(t('arabPage.title'))}</span>
      <span class="badge-count">${players.length}</span>
    </div>
    <div class="table-scroll">
      <table class="data-table">
        <thead><tr>${tableHead()}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  wireImgFallbacks(host);
  applyTranslations(host);
}

function renderError() {
  const host = $('#stars-host');
  if (!host) return;
  host.innerHTML = `
    <div class="state state-error" role="alert">
      <p class="state-title" data-i18n="arabPage.failed">${esc(t('arabPage.failed'))}</p>
      <button class="btn btn-secondary" type="button" id="retry-btn" data-i18n="action.retry">${esc(t('action.retry'))}</button>
    </div>`;
  $('#retry-btn')?.addEventListener('click', load);
  applyTranslations(host);
}

async function load() {
  renderLoading();
  try {
    const data = await fetchArabStars();
    renderPlayers(Array.isArray(data) ? data : (data?.players || []));
  } catch {
    renderError();
  }
}

function wire() {
  window.addEventListener('iqprec:languagechange', () => { applyTranslations(); load(); });
}

function init() {
  renderScaffold();
  wire();
  load();
}

document.addEventListener('DOMContentLoaded', init);
