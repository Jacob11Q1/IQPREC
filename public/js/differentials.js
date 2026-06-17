/* ============================================================
   IQPREC — differentials.js
   Differentials page controller. Calls /ai/differentials with an
   optional budget cap and renders the AI's top-5 rank-gain picks
   as cards with Hidden-Gem badges for sub-5% ownership.
   Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations, t, getLanguage } from './i18n.js';
import { callAIEndpoint } from './ai.js';
import { fetchCurrentGameweek } from './fpl.js';

const state = { gameweek: null };

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
        <h1 class="page-title" data-i18n="diffPage.title">Differentials</h1>
        <p class="page-sub" data-i18n="diffPage.sub">Low-owned, high-upside picks.</p>
      </div>
      <span class="gw-badge" id="gw-badge" aria-live="polite">—</span>
    </div>

    <div class="generate-bar diff-controls">
      <label class="budget-label">
        <span data-i18n="diffPage.budget">Max budget (optional)</span>
        <input
          type="number"
          id="budget-input"
          class="budget-input"
          min="3.0" max="15.0" step="0.1"
          data-i18n-placeholder="diffPage.budgetPh"
          placeholder="e.g. 7.5"
        >
      </label>
      <button class="btn btn-primary btn-lg btn-generate" id="generate-btn" type="button" disabled>
        <svg class="bolt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
        <span data-i18n="diffPage.generate">Find Differentials</span>
      </button>
    </div>

    <section id="diff-cards" class="diff-grid" aria-live="polite" hidden></section>
    <section id="diff-analysis" class="ai-analysis card" hidden></section>
  `;
  applyTranslations(main);
}

/* ---- Parse ---- */
function parsePicks(text) {
  const clean = String(text || '').trim();
  if (!clean) return [];
  // Split on leading number markers: 1. / 2. / ١. etc.
  const parts = clean.split(/(?:^|\n)\s*(?:[1-5]|[١٢٣٤٥])[.):\-]\s+/).filter(Boolean);
  const blocks = parts.length >= 2 ? parts.slice(0, 5) : [];
  if (!blocks.length) return [];
  return blocks.map((block) => {
    const firstLine = block.split('\n')[0].trim();
    const name = firstLine.replace(/\*\*/g, '').split(/[—\-–:|(]/)[0].trim().slice(0, 32);
    const ownMatch = block.match(/(\d+(?:\.\d+)?)\s*%/);
    const ownership = ownMatch ? parseFloat(ownMatch[1]) : null;
    const isGem = ownership != null && ownership < 5;
    return { name, ownership, isGem, reasoning: block.trim() };
  });
}

/* ---- Render ---- */
function renderLoading() {
  const cards = $('#diff-cards');
  const analysis = $('#diff-analysis');
  if (cards) {
    cards.hidden = false;
    cards.innerHTML = Array(5).fill(0).map(() => `
      <article class="diff-card diff-card--skeleton">
        <div class="skeleton skeleton-text w-50"></div>
        <div class="skeleton skeleton-text w-75" style="margin-top:8px"></div>
        <div class="skeleton skeleton-text w-100" style="margin-top:8px"></div>
        <div class="skeleton skeleton-text w-60"></div>
      </article>`).join('');
  }
  if (analysis) analysis.hidden = true;
}

function renderResult(text) {
  const cards = $('#diff-cards');
  const analysis = $('#diff-analysis');
  const picks = parsePicks(text);

  if (picks.length && cards) {
    cards.hidden = false;
    cards.innerHTML = picks.map((p, i) => {
      const gem = p.isGem
        ? `<span class="diff-gem-badge" data-i18n="diffPage.hiddenGem">${esc(t('diffPage.hiddenGem'))}</span>`
        : '';
      const own = p.ownership != null
        ? `<span class="diff-own">${p.ownership}% ${esc(t('diffPage.ownership'))}</span>`
        : '';
      return `
        <article class="diff-card${p.isGem ? ' diff-card--gem' : ''}">
          ${gem}
          <div class="diff-rank">${i + 1}</div>
          <div class="diff-name">${esc(p.name || '—')}</div>
          ${own}
          <div class="diff-reasoning" lang="${getLanguage()}">${toParas(p.reasoning)}</div>
        </article>`;
    }).join('');
  } else if (cards) {
    cards.hidden = true;
  }

  if (analysis) {
    analysis.hidden = false;
    analysis.innerHTML = `
      <div class="card-header">
        <span class="card-title" data-i18n="diffPage.results">${esc(t('diffPage.results'))}</span>
      </div>
      <div class="analysis-body" lang="${getLanguage()}">${toParas(text)}</div>`;
    applyTranslations(analysis);
  }
}

function renderEmpty() {
  const cards = $('#diff-cards');
  const analysis = $('#diff-analysis');
  if (cards) cards.hidden = true;
  if (analysis) {
    analysis.hidden = false;
    analysis.innerHTML = `
      <div class="state state-empty">
        <p class="state-title" data-i18n="diffPage.empty">${esc(t('diffPage.empty'))}</p>
      </div>`;
    applyTranslations(analysis);
  }
}

function renderError(message) {
  const cards = $('#diff-cards');
  const analysis = $('#diff-analysis');
  if (cards) cards.hidden = true;
  if (analysis) {
    analysis.hidden = false;
    analysis.innerHTML = `
      <div class="state state-error" role="alert">
        <p class="state-title">${esc(t('diffPage.failed'))}</p>
        <p class="state-message">${esc(message || '')}</p>
        <button class="btn btn-secondary" type="button" id="retry-btn" data-i18n="action.retry">${esc(t('action.retry'))}</button>
      </div>`;
    $('#retry-btn')?.addEventListener('click', generate);
    applyTranslations(analysis);
  }
}

/* ---- Generate ---- */
let busy = false;
async function generate() {
  if (busy || state.gameweek == null) return;
  busy = true;
  const btn = $('#generate-btn');
  if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
  renderLoading();

  const rawBudget = $('#budget-input')?.value?.trim();
  const budget = rawBudget ? parseFloat(rawBudget) : undefined;

  try {
    const data = await callAIEndpoint('/ai/differentials', {
      gameweek: state.gameweek,
      language: getLanguage(),
      ...(budget && !isNaN(budget) ? { budget } : {}),
    });
    const text = data.recommendation || '';
    if (!text || text.length < 20) renderEmpty();
    else renderResult(text);
  } catch (err) {
    const msg = err.code === 'AI_4001' || err.code === 'RATE_LIMITED'
      ? t('diffPage.rateLimited')
      : err.message;
    renderError(msg);
  } finally {
    busy = false;
    if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
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
  const btn = $('#generate-btn');
  if (btn && state.gameweek != null) btn.disabled = false;
}

function wire() {
  document.addEventListener('click', (e) => {
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
