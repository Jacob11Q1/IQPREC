/* ============================================================
   IQPREC — captain.js
   Captain Picker page controller. Loads the manager's squad, lets them
   generate an AI captain recommendation, and renders the top-3 picks as
   cards (Top Pick / Alternative / Differential) with animated confidence
   rings, plus the full AI analysis. WhatsApp share for the top pick.
   Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations, t, getLanguage } from './i18n.js';
import { callAIEndpoint } from './ai.js';
import { fetchCurrentGameweek, fetchMySquad } from './fpl.js';

const state = { gameweek: null, squadIds: [], picks: [], connected: false };

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

/* Match a parsed AI name against the actual squad to find the photo. */
function findPhoto(parsedName) {
  if (!parsedName || !state.picks.length) return null;
  const needle = parsedName.toLowerCase();
  const match = state.picks.find((pick) => {
    const wn = (pick.player?.web_name || '').toLowerCase();
    return wn === needle || wn.includes(needle) || needle.includes(wn);
  });
  return match?.player?.photo || null;
}

/* Escape DB/AI text before innerHTML (Pentagon L6). */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* Text → escaped paragraphs (preserve line breaks safely). */
function toParas(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/* ------------------------------------------------------------
   Page scaffold
   ------------------------------------------------------------ */
function renderScaffold() {
  const main = $('.content-body');
  if (!main) return;
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title" data-i18n="captainPage.title">Captain Picker</h1>
        <p class="page-sub" data-i18n="captainPage.sub">Your optimal armband, backed by data.</p>
      </div>
      <span class="gw-badge" id="gw-badge" aria-live="polite">—</span>
    </div>

    <div class="generate-bar">
      <button class="btn btn-primary btn-lg btn-generate" id="generate-btn" type="button" disabled>
        <svg class="bolt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        <span data-i18n="captainPage.generate">Generate Captain Pick</span>
      </button>
    </div>

    <section id="captain-results" class="captain-results" aria-live="polite" hidden></section>
    <section id="captain-analysis" class="ai-analysis card" hidden></section>
  `;
  applyTranslations(main);
}

/* ------------------------------------------------------------
   Confidence ring (matches the dashboard ring styling).
   ------------------------------------------------------------ */
function ringHtml(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const r = 32;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - p / 100);
  const tone = p >= 70 ? 'ring-green' : p >= 40 ? 'ring-gold' : 'ring-red';
  return `
    <div class="progress-ring captain-ring ${tone}">
      <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true">
        <circle class="ring-track" cx="40" cy="40" r="${r}" fill="none" stroke-width="7"></circle>
        <circle class="ring-fill" cx="40" cy="40" r="${r}" fill="none" stroke-width="7"
                stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}"
                data-target="${offset.toFixed(1)}"></circle>
      </svg>
      <span class="ring-label">${p}%</span>
    </div>`;
}

function animateRings(root) {
  root.querySelectorAll('.ring-fill[data-target]').forEach((circle) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        circle.style.strokeDashoffset = circle.getAttribute('data-target');
      })
    );
  });
}

/* ------------------------------------------------------------
   Best-effort parse of the AI text into up to 3 pick blocks.
   Resilient: if it can't find structured picks, the caller falls
   back to showing the full analysis only.
   ------------------------------------------------------------ */
function parsePicks(text) {
  const clean = String(text || '').trim();
  if (!clean) return [];

  // Split on leading "1." / "2." / "3." markers (Arabic or Latin digits).
  const parts = clean.split(/(?:^|\n)\s*(?:[1-3]|[١٢٣])[.):\-]\s+/).filter(Boolean);
  const blocks = parts.length >= 2 ? parts.slice(0, 3) : [];
  if (!blocks.length) return [];

  return blocks.map((block) => {
    const firstLine = block.split('\n')[0].trim();
    // Name heuristic: text before the first separator, stripped of markdown.
    const name = firstLine
      .replace(/\*\*/g, '')
      .split(/[—\-–:|(]/)[0]
      .trim()
      .slice(0, 32);
    const confMatch = block.match(/(\d{2,3})\s*%/);
    const confidence = confMatch ? Math.min(100, Number(confMatch[1])) : null;
    return { name, confidence, reasoning: block.trim() };
  });
}

const BADGES = [
  { cls: 'badge-gold', key: 'captainPage.topPick' },
  { cls: 'badge-silver', key: 'captainPage.alternative' },
  { cls: 'badge-blue', key: 'captainPage.differential' },
];

function initials(name) {
  const clean = String(name || '').trim();
  return clean ? clean.slice(0, 3).toUpperCase() : '?';
}

function cardHtml(pick, i) {
  const badge = BADGES[i] || BADGES[2];
  const conf = pick.confidence;
  const photo = findPhoto(pick.name);
  const url = photoUrl(photo);
  const init = esc(initials(pick.name));
  const posRingClass = ['pos-gk', 'pos-mid', 'pos-fwd'][i] || 'pos-mid';

  const photoInner = url
    ? `<img src="${esc(url)}" alt="${esc(pick.name || '')}" loading="lazy" class="player-img">
       <span class="player-initials player-img-fallback" hidden>${init}</span>`
    : `<span class="player-initials">${init}</span>`;

  return `
    <article class="captain-pick-card ${badge.cls}">
      <span class="pick-badge" data-i18n="${badge.key}">${esc(t(badge.key))}</span>
      <div class="pick-top">
        <div class="player-photo-ring ${posRingClass} is-captain jersey-${i}">
          <div class="player-photo-inner">${photoInner}</div>
        </div>
        ${conf != null ? ringHtml(conf) : ''}
      </div>
      <div class="pick-name">${esc(pick.name || '—')}</div>
      <div class="pick-reason" lang="${getLanguage()}">${toParas(pick.reasoning)}</div>
    </article>`;
}

/* ------------------------------------------------------------
   Render
   ------------------------------------------------------------ */
function renderLoading() {
  const results = $('#captain-results');
  if (!results) return;
  results.hidden = false;
  results.innerHTML = [0, 1, 2].map(() => `
    <article class="captain-pick-card skeleton-card">
      <div class="skeleton skeleton-text w-50"></div>
      <div class="skeleton skeleton-avatar" style="margin:16px 0"></div>
      <div class="skeleton skeleton-text w-75"></div>
      <div class="skeleton skeleton-text w-100"></div>
      <div class="skeleton skeleton-text w-75"></div>
    </article>`).join('');
  const analysis = $('#captain-analysis');
  if (analysis) analysis.hidden = true;
}

function renderResult(recommendation) {
  const results = $('#captain-results');
  const analysis = $('#captain-analysis');
  const picks = parsePicks(recommendation);

  if (picks.length) {
    results.hidden = false;
    results.innerHTML = picks.map((p, i) => cardHtml(p, i)).join('');
    animateRings(results);
    wireImgFallbacks(results);
    results.dataset.topPick = picks[0]?.name || '';
  } else {
    results.hidden = true;
  }

  analysis.hidden = false;
  analysis.innerHTML = `
    <div class="card-header">
      <span class="card-title" data-i18n="captainPage.analysis">AI Analysis</span>
      <button class="btn btn-secondary btn-sm" type="button" id="share-btn">
        ${esc(t('captainPage.share'))}
      </button>
    </div>
    <div class="analysis-body" lang="${getLanguage()}">${toParas(recommendation)}</div>`;
  applyTranslations(analysis);
}

function renderError(message) {
  const results = $('#captain-results');
  if (!results) return;
  results.hidden = false;
  results.innerHTML = `
    <div class="state state-error card" role="alert" style="grid-column:1/-1">
      <p class="state-title">${esc(t('captainPage.failed'))}</p>
      <p class="state-message">${esc(message || '')}</p>
      <button class="btn btn-secondary" type="button" id="retry-btn" data-i18n="action.retry">${esc(t('action.retry'))}</button>
    </div>`;
  const analysis = $('#captain-analysis');
  if (analysis) analysis.hidden = true;
  $('#retry-btn')?.addEventListener('click', generate);
}

function renderNoTeam() {
  const main = $('.content-body');
  const bar = $('.generate-bar');
  if (bar) bar.hidden = true;
  const results = $('#captain-results');
  if (results) {
    results.hidden = false;
    results.innerHTML = `
      <div class="state state-empty card" style="grid-column:1/-1">
        <p class="state-title">${esc(t('captainPage.noTeamTitle'))}</p>
        <p class="state-message">${esc(t('captainPage.noTeamMsg'))}</p>
        <a class="btn btn-primary" href="/onboarding.html">${esc(t('dash.connectTeam'))}</a>
      </div>`;
  }
  applyTranslations(main);
}

/* ------------------------------------------------------------
   Generate
   ------------------------------------------------------------ */
let busy = false;
async function generate() {
  if (busy || !state.connected || !state.squadIds.length || state.gameweek == null) return;
  busy = true;
  const btn = $('#generate-btn');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('is-loading');
  }
  renderLoading();

  try {
    const data = await callAIEndpoint('/ai/captain', {
      squadPlayerIds: state.squadIds,
      gameweek: state.gameweek,
      language: getLanguage(),
    });
    renderResult(data.recommendation || '');
  } catch (err) {
    const msg = err.code === 'AI_4001' || err.code === 'RATE_LIMITED'
      ? t('captainPage.rateLimited')
      : err.message;
    renderError(msg);
  } finally {
    busy = false;
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  }
}

function shareTopPick() {
  const results = $('#captain-results');
  const name = results?.dataset.topPick || '';
  const gw = state.gameweek != null ? `GW${state.gameweek}` : '';
  const text = `${t('captainPage.shareMessage')} ${gw}: ${name} — iqprec.com`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
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
    else if (e.target.closest('#share-btn')) shareTopPick();
  });
  window.addEventListener('iqprec:languagechange', () => {
    const main = $('.content-body');
    if (main) applyTranslations(main);
  });
}

function init() {
  renderScaffold();
  wire();
  loadContext();
}

document.addEventListener('DOMContentLoaded', init);
