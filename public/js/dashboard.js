/* ============================================================
   IQPREC — dashboard.js
   The live dashboard. Connects every widget to real data:
     • Stat row: current gameweek + live deadline countdown
       (turns red < 2h), squad value, bank, transfers available.
     • Captain hook: latest AI captain pick, or a "generate" CTA.
     • Squad formation: SVG pitch with player nodes by formation.
   Loads after auth, i18n, layout. Uses /js/fpl.js for FPL calls.
   ============================================================ */

import { api } from './api.js';
import { applyTranslations, t, getLanguage } from './i18n.js';
import { formatNumber } from './ui.js';
import { fetchCurrentGameweek, fetchMySquad } from './fpl.js';

const RED_THRESHOLD_SECONDS = 7200; // 2 hours
let countdownTimer = null;

function $(id) {
  return document.getElementById(id);
}

/* Escape user/DB text before it ever touches innerHTML (L6). */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ------------------------------------------------------------
   Stat row scaffold — 4 cards, each showing a skeleton until data.
   ------------------------------------------------------------ */
function skeletonValue() {
  return '<div class="skeleton skeleton-text w-50" style="height:30px"></div>';
}

function renderStatScaffold() {
  const row = $('stats-row');
  if (!row || row.dataset.ready) return;
  row.dataset.ready = 'true';
  row.innerHTML = `
    <div class="stats-card" id="gw-card">
      <div class="stats-label" data-i18n="dash.gameweek">Gameweek</div>
      <div class="stats-number" id="gw-number">${skeletonValue()}</div>
      <div class="stats-sub" id="gw-countdown" aria-live="polite"></div>
    </div>
    <div class="stats-card accent-blue" id="squad-value-card">
      <div class="stats-label" data-i18n="dash.squadValue">Squad value</div>
      <div class="stats-number" id="squad-value">${skeletonValue()}</div>
    </div>
    <div class="stats-card accent-gold" id="squad-bank-card">
      <div class="stats-label" data-i18n="dash.bank">In the bank</div>
      <div class="stats-number" id="squad-bank">${skeletonValue()}</div>
    </div>
    <div class="stats-card" id="transfers-card">
      <div class="stats-label" data-i18n="dash.transfers">Transfers available</div>
      <div class="stats-number" id="transfers-value">${skeletonValue()}</div>
    </div>
  `;
  applyTranslations(row);
}

/* ------------------------------------------------------------
   Deadline countdown — Xd Xh Xm Xs, red + .urgent under 2 hours.
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
      el.classList.remove('urgent');
      card?.classList.remove('accent-red');
      clearInterval(countdownTimer);
      countdownTimer = null;
      return;
    }
    const urgent = remaining < RED_THRESHOLD_SECONDS;
    el.textContent = formatCountdown(remaining);
    el.classList.toggle('urgent', urgent);
    card?.classList.toggle('accent-red', urgent);
  };

  tick();
  countdownTimer = setInterval(tick, 1000);
}

async function loadGameweek() {
  const numEl = $('gw-number');
  try {
    const gw = await fetchCurrentGameweek();
    if (numEl) numEl.textContent = gw.gameweek != null ? `GW${gw.gameweek}` : '—';
    if (gw.deadlineTime) startCountdown(gw.deadlineTime);
    return gw;
  } catch {
    if (numEl) numEl.textContent = '—';
    return null;
  }
}

/* ------------------------------------------------------------
   Squad stat cards
   ------------------------------------------------------------ */
function connectLink() {
  return `<a class="dash-connect-link" href="/onboarding.html" data-i18n="dash.connectShort">${t('dash.connectShort')}</a>`;
}

function renderSquadEmpty() {
  const v = $('squad-value');
  if (v) v.innerHTML = connectLink();
  const b = $('squad-bank');
  if (b) b.textContent = '—';
  const tr = $('transfers-value');
  if (tr) tr.textContent = '—';
}

function renderSquadStats(squad) {
  const v = $('squad-value');
  if (v) v.textContent = `£${Number(squad.teamValue ?? 0).toFixed(1)}m`;

  const b = $('squad-bank');
  const bankCard = $('squad-bank-card');
  if (b) {
    const bank = Number(squad.bankValue ?? 0);
    b.textContent = `£${bank.toFixed(1)}m`;
    if (bankCard) bankCard.classList.toggle('value-positive', bank > 0);
  }

  const tr = $('transfers-value');
  const trCard = $('transfers-card');
  if (tr) {
    const n = squad.transfersAvailable;
    tr.textContent = n == null ? '—' : formatNumber(n);
    if (trCard) {
      trCard.classList.remove('value-positive', 'value-warn', 'value-danger');
      if (n != null) {
        if (n >= 2) trCard.classList.add('value-positive');
        else if (n === 1) trCard.classList.add('value-warn');
        else trCard.classList.add('value-danger');
      }
    }
  }
}

/* ------------------------------------------------------------
   Captain hook
   ------------------------------------------------------------ */
function captainCtaHtml() {
  return `
    <div class="card captain-cta">
      <div class="card-header"><span class="card-title">${esc(t('captain.title'))}</span></div>
      <p class="state-message">${esc(t('captain.cta.msg'))}</p>
      <a class="btn btn-primary btn-pulse" href="/captain.html">${esc(t('captain.generate'))}</a>
    </div>`;
}

/* SVG confidence ring: stroke-dasharray reveals `pct` on load. */
function confidenceRingHtml(pct) {
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

function initials(name) {
  const clean = String(name || '').trim();
  if (!clean) return '?';
  return clean.slice(0, 3).toUpperCase();
}

function captainCardHtml(rec) {
  const meta = rec.meta || {};
  const name = meta.playerName || meta.player_name || rec.player_name || '';
  const confidence = meta.confidence ?? rec.confidence ?? 0;
  const opponent = meta.opponent || meta.vs || '';
  const fdr = Number(meta.fdr ?? meta.opponentFdr ?? 3);
  const community = meta.communityPercent ?? meta.community ?? null;
  const reasoning = (rec.output_text || meta.reasoning || '').trim();
  const short = reasoning.length > 100 ? `${reasoning.slice(0, 100)}…` : reasoning;
  const fdrClass = fdr <= 2 ? 'fdr-good' : fdr === 3 ? 'fdr-mid' : 'fdr-bad';

  return `
    <div class="card captain-card">
      <div class="card-header"><span class="card-title">${esc(t('captain.title'))}</span></div>
      <div class="captain-body">
        <div class="captain-main">
          <span class="player-circle pos-mid is-captain">${esc(initials(name))}</span>
          <div class="captain-info">
            <div class="captain-name">${esc(name)}</div>
            ${opponent ? `<span class="fixture-badge ${fdrClass}">${esc(t('captain.vs'))} ${esc(opponent)}</span>` : ''}
          </div>
        </div>
        ${confidenceRingHtml(confidence)}
      </div>
      ${short ? `<p class="captain-reason" lang="${getLanguage()}">${esc(short)}
        <a href="/captain.html" class="link-inline">${esc(t('captain.readMore'))}</a></p>` : ''}
      ${community != null ? `<p class="captain-community">${esc(t('captain.community', { pct: Math.round(community) }))}</p>` : ''}
      <button class="btn btn-secondary btn-sm" type="button" data-action="captain-share"
              data-name="${esc(name)}">${esc(t('captain.share'))}</button>
    </div>`;
}

function animateRings(root) {
  root.querySelectorAll('.ring-fill[data-target]').forEach((circle) => {
    requestAnimationFrame(() => {
      circle.style.strokeDashoffset = circle.getAttribute('data-target');
    });
  });
}

async function loadCaptain() {
  const host = $('captain-hook');
  if (!host) return;
  host.innerHTML = `<div class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text w-75"></div></div>`;
  try {
    const res = await api.get('/app/captain/latest');
    if (!res.success) throw new Error('failed');
    if (res.data?.hasRecommendation && res.data.recommendation) {
      host.innerHTML = captainCardHtml(res.data.recommendation);
      animateRings(host);
    } else {
      host.innerHTML = captainCtaHtml();
    }
  } catch {
    host.innerHTML = captainCtaHtml();
  }
  applyTranslations(host);
}

function shareCaptain(name) {
  const text = `${t('captain.shareMessage')}: ${name} — iqprec.com`;
  const wa = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(wa, '_blank', 'noopener');
}

/* ------------------------------------------------------------
   Squad formation — SVG pitch + absolutely-positioned player nodes.
   ------------------------------------------------------------ */
const POS_CLASS = { 1: 'pos-gk', 2: 'pos-def', 3: 'pos-mid', 4: 'pos-fwd' };
const ROW_Y = { 1: 90, 2: 72, 3: 50, 4: 28 }; // GK / DEF / MID / FWD as % from top

function pitchSvg() {
  return `
    <svg class="pitch-bg" viewBox="0 0 300 420" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="pitchGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0f5c33"/>
          <stop offset="1" stop-color="#0a3f23"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="300" height="420" fill="url(#pitchGrad)"/>
      <line x1="0" y1="210" x2="300" y2="210" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
      <circle cx="150" cy="210" r="34" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
      <rect x="85" y="0" width="130" height="58" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
      <rect x="85" y="362" width="130" height="58" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
      <rect x="120" y="0" width="60" height="26" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
      <rect x="120" y="394" width="60" height="26" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
    </svg>`;
}

function nodeHtml(pick, opts = {}) {
  const p = pick.player || {};
  const name = p.web_name || '';
  const label = name.length > 6 ? name.slice(0, 6) : name;
  const posClass = POS_CLASS[p.element_type] || 'pos-mid';
  const cap = pick.is_captain ? ' is-captain' : '';
  const pts = p.total_points != null ? formatNumber(p.total_points) : '—';
  const flagged = p.status && p.status !== 'a' ? ' is-flagged' : '';
  const style = opts.bench ? '' : `style="inset-inline-start:${opts.x}%;inset-block-start:${opts.y}%"`;
  return `
    <button class="player-node${opts.bench ? ' bench-node' : ''}${flagged}" type="button"
            data-pid="${esc(p.id)}" ${style}>
      <span class="player-circle ${posClass}${cap}">${esc(label)}</span>
      <span class="player-node-pts">${esc(pts)}</span>
    </button>`;
}

function renderSquadFormation(squad) {
  const host = $('squad-formation');
  if (!host) return;

  const picks = Array.isArray(squad?.picks) ? squad.picks : [];
  const starters = picks.filter((p) => p.position <= 11);
  const bench = picks.filter((p) => p.position >= 12).sort((a, b) => a.position - b.position);

  // Group starters by line (GK/DEF/MID/FWD) preserving pick order.
  const lines = { 1: [], 2: [], 3: [], 4: [] };
  starters.forEach((p) => {
    const type = p.player?.element_type || 1;
    (lines[type] || lines[1]).push(p);
  });

  const def = lines[2].length, mid = lines[3].length, fwd = lines[4].length;

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
        <span class="card-title">${esc(t('dash.formation.title'))}</span>
        <span class="formation-badge">${def}-${mid}-${fwd}</span>
      </div>
      <div class="pitch-container">
        ${pitchSvg()}
        ${nodes}
      </div>
      <div class="bench-label">${esc(t('dash.formation.bench'))}</div>
      <div class="bench-row">${benchNodes}</div>
      <div class="player-tooltip" id="player-tooltip" hidden></div>
    </div>`;

  wirePitch(host, picks);
}

function renderFormationEmpty() {
  const host = $('squad-formation');
  if (!host) return;
  host.innerHTML = `
    <div class="card state state-empty">
      <p class="state-title">${esc(t('dash.formation.title'))}</p>
      <p class="state-message">${esc(t('dash.formation.empty'))}</p>
      <a class="btn btn-primary" href="/onboarding.html">${esc(t('dash.connectTeam'))}</a>
    </div>`;
}

function wirePitch(host, picks) {
  const tip = host.querySelector('#player-tooltip');
  if (!tip) return;
  const byId = new Map(picks.map((p) => [String(p.player?.id), p.player]));

  host.addEventListener('click', (e) => {
    const node = e.target.closest('.player-node');
    if (!node) { tip.hidden = true; return; }
    const p = byId.get(node.getAttribute('data-pid'));
    if (!p) return;
    const news = (p.news || '').trim();
    tip.innerHTML = `
      <strong>${esc(p.web_name || '')}</strong>
      <span>${esc(t('dash.points'))}: ${esc(p.total_points ?? 0)}</span>
      <span>${esc(t('dash.form'))}: ${esc(p.form ?? '0.0')}</span>
      ${news ? `<span class="tip-news">${esc(news)}</span>` : ''}`;
    tip.hidden = false;
  });
}

/* ------------------------------------------------------------
   Loaders for the squad-dependent widgets (one fetch, fan-out).
   ------------------------------------------------------------ */
async function loadSquad() {
  try {
    const data = await fetchMySquad();
    if (!data.connected || !data.squad) {
      renderSquadEmpty();
      renderFormationEmpty();
      return;
    }
    renderSquadStats(data.squad);
    renderSquadFormation(data.squad);
  } catch {
    renderSquadEmpty();
    renderFormationEmpty();
  }
}

/* ------------------------------------------------------------
   Delegated actions
   ------------------------------------------------------------ */
function wireActions() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="captain-share"]');
    if (btn) shareCaptain(btn.getAttribute('data-name') || '');
  });
}

/* ------------------------------------------------------------
   Init
   ------------------------------------------------------------ */
function init() {
  applyTranslations();
  renderStatScaffold();
  wireActions();
  loadGameweek();
  loadSquad();
  loadCaptain();
}

window.addEventListener('beforeunload', () => {
  if (countdownTimer) clearInterval(countdownTimer);
});

document.addEventListener('DOMContentLoaded', init);
