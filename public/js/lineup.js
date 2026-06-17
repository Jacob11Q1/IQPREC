/* ============================================================
   IQPREC — lineup.js
   Lineup Builder page controller. Renders the manager's real squad on an
   SVG pitch with player photos, lets them pick a formation and generate an
   AI lineup recommendation.
   ============================================================ */

import { applyTranslations, t, getLanguage } from './i18n.js';
import { callAIEndpoint } from './ai.js';
import { fetchCurrentGameweek, fetchMySquad } from './fpl.js';
import { formatNumber } from './ui.js';

const state = { gameweek: null, squadIds: [], picks: [], connected: false };

const POS_CLASS = { 1: 'pos-gk', 2: 'pos-def', 3: 'pos-mid', 4: 'pos-fwd' };
const ROW_Y    = { 1: 90, 2: 72, 3: 50, 4: 28 };
const FORMATIONS = ['3-4-3', '3-5-2', '4-4-2', '4-3-3', '4-5-1', '5-3-2', '5-4-1'];

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

/* FPL CDN photo URL */
function photoUrl(photo) {
  if (!photo) return null;
  const id = String(photo).replace('.jpg', '').replace('.png', '');
  return `https://resources.premierleague.com/premierleague/photos/players/110x140/p${id}.png`;
}

/* CSP-safe image fallback — call after any innerHTML set that contains .player-img */
function wireImgFallbacks(root) {
  root.querySelectorAll('img.player-img').forEach((img) => {
    img.addEventListener('error', () => {
      img.hidden = true;
      const fb = img.nextElementSibling;
      if (fb && fb.classList.contains('player-img-fallback')) fb.hidden = false;
    });
  });
}

/* ------------------------------------------------------------
   Scaffold
   ------------------------------------------------------------ */
function renderScaffold() {
  const main = $('.content-body');
  if (!main) return;
  const options = FORMATIONS.map((f) => `<option value="${f}">${f}</option>`).join('');
  main.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title" data-i18n="lineupPage.title">Lineup Builder</h1>
        <p class="page-sub" data-i18n="lineupPage.sub">Your strongest XI, picked by data.</p>
      </div>
      <span class="gw-badge" id="gw-badge" aria-live="polite">—</span>
    </div>

    <div class="generate-bar lineup-controls">
      <label class="formation-select">
        <span data-i18n="lineupPage.formation">Formation</span>
        <select id="formation-select">
          <option value="" data-i18n="lineupPage.formationAuto">Auto (recommended)</option>
          ${options}
        </select>
      </label>
      <button class="btn btn-primary btn-lg btn-generate" id="generate-btn" type="button" disabled>
        <svg class="bolt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
        <span data-i18n="lineupPage.generate">Generate Lineup</span>
      </button>
    </div>

    <section id="lineup-pitch" class="squad-section" aria-label="Pitch"></section>
    <section id="lineup-analysis" class="ai-analysis card" hidden></section>
  `;
  applyTranslations(main);
}

/* ------------------------------------------------------------
   Pitch SVG background
   ------------------------------------------------------------ */
function pitchSvg() {
  return `
    <svg class="pitch-bg" viewBox="0 0 300 450" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="lpg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#0d6b3a"/>
          <stop offset="25%"  stop-color="#0f7a42"/>
          <stop offset="50%"  stop-color="#0d6b3a"/>
          <stop offset="75%"  stop-color="#0f7a42"/>
          <stop offset="100%" stop-color="#0a4f2b"/>
        </linearGradient>
      </defs>
      <rect width="300" height="450" fill="url(#lpg)"/>
      <rect x="0"   y="0"   width="300" height="45"  fill="rgba(255,255,255,0.02)"/>
      <rect x="0"   y="90"  width="300" height="45"  fill="rgba(255,255,255,0.02)"/>
      <rect x="0"   y="180" width="300" height="45"  fill="rgba(255,255,255,0.02)"/>
      <rect x="0"   y="270" width="300" height="45"  fill="rgba(255,255,255,0.02)"/>
      <rect x="0"   y="360" width="300" height="45"  fill="rgba(255,255,255,0.02)"/>
      <rect x="8" y="8" width="284" height="434" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
      <line x1="8" y1="225" x2="292" y2="225" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
      <circle cx="150" cy="225" r="36" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
      <circle cx="150" cy="225" r="3"  fill="rgba(255,255,255,0.4)"/>
      <rect x="68"  y="8"   width="164" height="66" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
      <rect x="68"  y="376" width="164" height="66" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
      <rect x="114" y="8"   width="72"  height="26" fill="none" stroke="rgba(255,255,255,0.3)"  stroke-width="1.5"/>
      <rect x="114" y="416" width="72"  height="26" fill="none" stroke="rgba(255,255,255,0.3)"  stroke-width="1.5"/>
    </svg>`;
}

/* ------------------------------------------------------------
   Player node — photo ring + name + pts.
   Positioning uses data-pitch-x/y (CSP-safe — inline style= is blocked).
   ------------------------------------------------------------ */
function nodeHtml(pick, opts = {}) {
  const p = pick.player || {};
  const name = p.web_name || '';
  const label = esc(name.length > 7 ? name.slice(0, 7) : name);
  const posClass = POS_CLASS[p.element_type] || 'pos-mid';
  const cap = pick.is_captain ? ' is-captain' : '';
  const pts = p.total_points != null ? formatNumber(p.total_points) : '—';
  const flagged = p.status && p.status !== 'a' ? ' is-flagged' : '';
  const posAttr = opts.bench ? '' : `data-pitch-x="${opts.x}" data-pitch-y="${opts.y}"`;
  const url = photoUrl(p.photo);
  const initials = esc(String(name).slice(0, 3).toUpperCase());

  const photoInner = url
    ? `<img src="${esc(url)}" alt="${esc(name)}" loading="lazy" class="player-img">
       <span class="player-initials player-img-fallback" hidden>${initials}</span>`
    : `<span class="player-initials">${initials}</span>`;

  return `
    <button class="player-node${opts.bench ? ' bench-node' : ''}${flagged}" type="button"
            data-pid="${esc(String(p.id ?? ''))}" ${posAttr}>
      <div class="player-card">
        <div class="player-photo-ring ${posClass}${cap}">
          <div class="player-photo-inner">${photoInner}</div>
        </div>
        <span class="player-card-name">${label}</span>
        <span class="player-card-pts">${esc(String(pts))}</span>
      </div>
    </button>`;
}

/* ------------------------------------------------------------
   Pitch render
   ------------------------------------------------------------ */
function renderPitch(picks, formationLabel) {
  const host = $('#lineup-pitch');
  if (!host) return;

  const starters = picks.filter((p) => p.position <= 11);
  const bench    = picks.filter((p) => p.position >= 12).sort((a, b) => a.position - b.position);

  const lines = { 1: [], 2: [], 3: [], 4: [] };
  starters.forEach((p) => {
    const type = p.player?.element_type || 1;
    (lines[type] || lines[1]).push(p);
  });

  const def = lines[2].length, mid = lines[3].length, fwd = lines[4].length;
  const badge = formationLabel || `${def}-${mid}-${fwd}`;

  let nodes = '';
  Object.keys(lines).forEach((type) => {
    const row = lines[type];
    const y = ROW_Y[type];
    row.forEach((pick, i) => {
      const x = ((i + 1) / (row.length + 1)) * 100;
      nodes += nodeHtml(pick, { x: x.toFixed(1), y });
    });
  });

  const benchNodes = bench.map((p) => nodeHtml(p, { bench: true })).join('');

  host.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title" data-i18n="lineupPage.yourPitch">Your pitch</span>
        <span class="formation-badge">${esc(badge)}</span>
      </div>
      <div class="pitch-container">
        ${pitchSvg()}
        ${nodes}
      </div>
      <div class="bench-label">${esc(t('dash.formation.bench'))}</div>
      <div class="bench-row">${benchNodes}</div>
    </div>`;

  /* Apply pitch positions via JS — CSP blocks inline style= attributes */
  host.querySelectorAll('.player-node[data-pitch-x]').forEach((node) => {
    node.style.left = node.dataset.pitchX + '%';
    node.style.top  = node.dataset.pitchY + '%';
  });

  wireImgFallbacks(host);
  applyTranslations(host);
}

function renderNoTeam() {
  const bar = $('.lineup-controls');
  if (bar) bar.hidden = true;
  const host = $('#lineup-pitch');
  if (host) {
    host.innerHTML = `
      <div class="state state-empty card">
        <p class="state-title">${esc(t('lineupPage.noTeamTitle'))}</p>
        <p class="state-message">${esc(t('lineupPage.noTeamMsg'))}</p>
        <a class="btn btn-primary" href="/onboarding.html">${esc(t('dash.connectTeam'))}</a>
      </div>`;
  }
}

/* ------------------------------------------------------------
   AI analysis
   ------------------------------------------------------------ */
function parseFormation(text) {
  const m = String(text || '').match(/\b([345]-[2-5]-[1-4])\b/);
  return m ? m[1] : null;
}

function renderAnalysisLoading() {
  const host = $('#lineup-analysis');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `
    <div class="card-header"><span class="card-title">${esc(t('lineupPage.analysis'))}</span></div>
    <div class="skeleton skeleton-text w-100"></div>
    <div class="skeleton skeleton-text w-75"></div>
    <div class="skeleton skeleton-text w-100"></div>
    <div class="skeleton skeleton-text w-50"></div>`;
}

function renderAnalysis(text) {
  const host = $('#lineup-analysis');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `
    <div class="card-header"><span class="card-title" data-i18n="lineupPage.analysis">AI Analysis</span></div>
    <div class="analysis-body" lang="${getLanguage()}">${toParas(text)}</div>`;
  applyTranslations(host);
}

function renderAnalysisError(message) {
  const host = $('#lineup-analysis');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `
    <div class="state state-error" role="alert">
      <p class="state-title">${esc(t('lineupPage.failed'))}</p>
      <p class="state-message">${esc(message || '')}</p>
      <button class="btn btn-secondary" type="button" id="retry-btn">${esc(t('action.retry'))}</button>
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
  const formation = $('#formation-select')?.value || '';
  if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
  renderAnalysisLoading();

  try {
    const data = await callAIEndpoint('/ai/lineup', {
      squadPlayerIds: state.squadIds,
      gameweek: state.gameweek,
      language: getLanguage(),
      ...(formation ? { formation } : {}),
    });
    const rec = data.recommendation || '';
    renderAnalysis(rec);
    const f = formation || parseFormation(rec);
    if (f) renderPitch(state.picks, f);
  } catch (err) {
    const msg = err.code === 'AI_4001' || err.code === 'RATE_LIMITED'
      ? t('lineupPage.rateLimited')
      : err.message;
    renderAnalysisError(msg);
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
      renderPitch(state.picks);
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
  });
}

function init() {
  renderScaffold();
  wire();
  loadContext();
}

document.addEventListener('DOMContentLoaded', init);
