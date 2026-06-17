/* ============================================================
   IQPREC — dashboard.js  (v2 — with player photos)
   ============================================================ */

import { api } from './api.js';
import { applyTranslations, t, getLanguage } from './i18n.js';
import { formatNumber } from './ui.js';
import { fetchCurrentGameweek, fetchMySquad } from './fpl.js';

const RED_THRESHOLD_SECONDS = 7200;
let countdownTimer = null;

function $(id) { return document.getElementById(id); }

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* FPL player photo URL */
function photoUrl(photo) {
  if (!photo) return null;
  const id = String(photo).replace('.jpg', '').replace('.png', '');
  return `https://resources.premierleague.com/premierleague/photos/players/110x140/p${id}.png`;
}

/* CSP-safe img error handler — attaches after innerHTML insertion.
   Hides broken img and shows the adjacent .player-img-fallback sibling. */
function wireImgFallbacks(root = document) {
  root.querySelectorAll('img.player-img').forEach((img) => {
    img.addEventListener('error', () => {
      img.hidden = true;
      const fb = img.nextElementSibling;
      if (fb && fb.classList.contains('player-img-fallback')) fb.hidden = false;
    });
  });
}

/* Build a circular player photo element (falls back to initials) */
function playerPhotoImg(photo, name, extraClass = '') {
  const url = photoUrl(photo);
  const init = esc(String(name || '?').slice(0, 3).toUpperCase());
  if (url) {
    return `<img src="${esc(url)}" alt="${esc(name)}" loading="lazy" class="player-img">
      <span class="player-initials player-img-fallback" hidden>${init}</span>`;
  }
  return `<span class="player-initials">${init}</span>`;
}

/* ============================================================
   Quick actions bar
   ============================================================ */
function renderQuickActions() {
  const el = $('quick-actions');
  if (!el || el.dataset.ready) return;
  el.dataset.ready = 'true';

  const links = [
    { href: '/captain.html',      icon: '⭐', label: t('nav.captain'),    color: 'qa-green' },
    { href: '/transfers.html',    icon: '🔁', label: t('nav.transfers'),  color: 'qa-blue'  },
    { href: '/differentials.html',icon: '⚡', label: t('nav.diff'),       color: 'qa-red'   },
    { href: '/chips.html',        icon: '🃏', label: t('nav.chips'),      color: 'qa-gold'  },
    { href: '/player-intel.html', icon: '🔍', label: t('nav.intel'),      color: 'qa-blue'  },
    { href: '/chat.html',         icon: '💬', label: t('nav.chat'),       color: 'qa-green' },
  ];

  el.innerHTML = links.map((l) => `
    <a class="qa-link" href="${l.href}">
      <span class="qa-icon ${l.color}">${l.icon}</span>
      <span>${esc(l.label)}</span>
    </a>`).join('');
}

/* ============================================================
   Stat row scaffold
   ============================================================ */
function skeletonVal() {
  return '<div class="skeleton skeleton-text w-50" style="height:28px"></div>';
}

function renderStatScaffold() {
  const row = $('stats-row');
  if (!row || row.dataset.ready) return;
  row.dataset.ready = 'true';
  row.innerHTML = `
    <div class="stats-card accent-green" id="gw-card">
      <div class="stats-icon">📅</div>
      <div class="stats-label" data-i18n="dash.gameweek">Gameweek</div>
      <div class="stats-number" id="gw-number">${skeletonVal()}</div>
      <div class="stats-sub" id="gw-countdown" aria-live="polite"></div>
    </div>
    <div class="stats-card accent-blue" id="squad-value-card">
      <div class="stats-icon">💰</div>
      <div class="stats-label" data-i18n="dash.squadValue">Squad value</div>
      <div class="stats-number" id="squad-value">${skeletonVal()}</div>
    </div>
    <div class="stats-card accent-gold" id="squad-bank-card">
      <div class="stats-icon">🏦</div>
      <div class="stats-label" data-i18n="dash.bank">In the bank</div>
      <div class="stats-number" id="squad-bank">${skeletonVal()}</div>
    </div>
    <div class="stats-card" id="transfers-card">
      <div class="stats-icon">🔁</div>
      <div class="stats-label" data-i18n="dash.transfers">Transfers available</div>
      <div class="stats-number" id="transfers-value">${skeletonVal()}</div>
    </div>`;
  applyTranslations(row);
}

/* ============================================================
   Countdown
   ============================================================ */
function formatCountdown(s) {
  const total = Math.max(0, Math.floor(s));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
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
    const rem = (deadline - Date.now()) / 1000;
    if (rem <= 0) { el.textContent = t('dash.deadlinePassed'); el.classList.remove('urgent'); card?.classList.remove('accent-red'); clearInterval(countdownTimer); countdownTimer = null; return; }
    const urgent = rem < RED_THRESHOLD_SECONDS;
    el.textContent = formatCountdown(rem);
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
  } catch { if (numEl) numEl.textContent = '—'; return null; }
}

/* ============================================================
   Squad stat cards
   ============================================================ */
function connectLink() {
  return `<a class="dash-connect-link" href="/onboarding.html">${esc(t('dash.connectShort'))}</a>`;
}

function renderSquadEmpty() {
  const v = $('squad-value'); if (v) v.innerHTML = connectLink();
  const b = $('squad-bank'); if (b) b.textContent = '—';
  const tr = $('transfers-value'); if (tr) tr.textContent = '—';
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

/* ============================================================
   Captain hero card
   ============================================================ */
function captainCtaHtml() {
  return `
    <div class="captain-cta-card">
      <div class="card-header" style="margin-bottom:0">
        <span class="card-title">${esc(t('captain.title'))}</span>
      </div>
      <div class="captain-cta-body" style="display:flex;align-items:flex-start;gap:var(--space-4);padding-block-start:var(--space-3)">
        <div class="state-icon-wrap">⭐</div>
        <div>
          <p style="font-weight:600;color:var(--white);margin-bottom:6px">${esc(t('captain.cta.msg') || 'Get your AI captain pick')}</p>
          <p style="font-size:13px;color:var(--text-light);line-height:1.6">${esc(t('captain.cta.sub') || 'Based on fixtures, form, and your mini-league rivals.')}</p>
        </div>
      </div>
      <a class="btn btn-primary btn-pulse" href="/captain.html" style="align-self:flex-start">${esc(t('captain.generate'))}</a>
    </div>`;
}

function captainCardHtml(rec) {
  const meta = rec.meta || {};
  const name = meta.playerName || meta.player_name || rec.player_name || '';
  const team = meta.team || meta.teamName || '';
  const photo = meta.photo || '';
  const confidence = Number(meta.confidence ?? rec.confidence ?? 0);
  const opponent = meta.opponent || meta.vs || '';
  const fdr = Number(meta.fdr ?? meta.opponentFdr ?? 3);
  const community = meta.communityPercent ?? meta.community ?? null;
  const form = meta.form ?? '';
  const pts = meta.totalPoints ?? meta.total_points ?? '';
  const reasoning = (rec.output_text || meta.reasoning || '').trim();
  const short = reasoning.length > 200 ? `${reasoning.slice(0, 200)}…` : reasoning;
  const fdrClass = fdr <= 2 ? 'fdr-good' : fdr === 3 ? 'fdr-mid' : 'fdr-bad';
  const pctClass = confidence >= 70 ? 'pct-green' : confidence >= 40 ? 'pct-gold' : 'pct-red';
  const url = photoUrl(photo);
  const initials = esc(String(name).slice(0, 3).toUpperCase());

  const photoHtml = url
    ? `<img src="${esc(url)}" alt="${esc(name)}" loading="lazy" class="player-img">
       <div class="captain-photo-fallback player-img-fallback" hidden>${initials}</div>`
    : `<div class="captain-photo-fallback">${initials}</div>`;

  return `
    <div class="captain-hero-card">
      <div class="card-header">
        <span class="card-title">${esc(t('captain.title'))}</span>
        <span class="badge badge-green">${esc(t('dash.aiPick') || 'AI Pick')}</span>
      </div>
      <div class="captain-hero-inner">
        <div class="captain-photo-col">
          <div class="captain-photo-wrap">
            <div class="captain-photo-bg"></div>
            ${photoHtml}
            <span class="captain-badge-cap">${esc(t('dash.captain') || 'Captain')}</span>
          </div>
        </div>
        <div class="captain-info-col">
          <div class="captain-header-row">
            <div class="captain-name-block">
              <div class="captain-name">${esc(name || '—')}</div>
              ${team ? `<div class="captain-team">${esc(team)}</div>` : ''}
            </div>
            ${opponent ? `<span class="fixture-badge ${fdrClass}">vs ${esc(opponent)}</span>` : ''}
          </div>

          ${confidence > 0 ? `
          <div class="captain-confidence">
            <div class="confidence-label">
              <span class="confidence-title">${esc(t('captain.confidence') || 'Confidence')}</span>
              <span class="confidence-pct ${pctClass}">${confidence}%</span>
            </div>
            <div class="confidence-track">
              <div class="confidence-fill ${pctClass}" style="width:0" data-target="${confidence}%"></div>
            </div>
          </div>` : ''}

          ${(form || pts) ? `
          <div class="captain-stats-row">
            ${form ? `<div class="captain-stat"><div class="captain-stat-val">${esc(form)}</div><div class="captain-stat-lbl">${esc(t('dash.form') || 'Form')}</div></div>` : ''}
            ${pts  ? `<div class="captain-stat"><div class="captain-stat-val">${esc(pts)}</div><div class="captain-stat-lbl">${esc(t('dash.points') || 'Pts')}</div></div>` : ''}
          </div>` : ''}

          ${short ? `<p class="captain-reason" lang="${getLanguage()}">${esc(short)}</p>` : ''}
          ${community != null ? `<span class="captain-community-badge">👥 ${Math.round(community)}% ${esc(t('captain.ownThis') || 'of your league own this')}</span>` : ''}

          <div class="captain-actions">
            <a class="btn btn-primary btn-sm" href="/captain.html">${esc(t('captain.readMore'))}</a>
            <button class="btn btn-ghost btn-sm" type="button" data-action="captain-share" data-name="${esc(name)}">
              📤 ${esc(t('captain.share'))}
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

function animateConfidenceBars(root) {
  root.querySelectorAll('.confidence-fill[data-target]').forEach((el) => {
    const target = el.getAttribute('data-target');
    requestAnimationFrame(() => { el.style.width = target; });
  });
}

async function loadCaptain() {
  const host = $('captain-hook');
  if (!host) return;
  host.innerHTML = `<div class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text w-75"></div><div class="skeleton skeleton-text w-50" style="margin-top:8px"></div></div>`;
  try {
    const res = await api.get('/app/captain/latest');
    if (!res.success) throw new Error('failed');
    if (res.data?.hasRecommendation && res.data.recommendation) {
      host.innerHTML = captainCardHtml(res.data.recommendation);
      wireImgFallbacks(host);
      animateConfidenceBars(host);
    } else {
      host.innerHTML = captainCtaHtml();
    }
  } catch { host.innerHTML = captainCtaHtml(); }
  applyTranslations(host);
}

function shareCaptain(name) {
  const text = `${t('captain.shareMessage')}: ${name} — iqprec.com`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/* ============================================================
   Squad formation — pitch + sidebar list
   ============================================================ */
const POS_CLASS = { 1: 'pos-gk', 2: 'pos-def', 3: 'pos-mid', 4: 'pos-fwd' };
const ROW_Y = { 1: 88, 2: 68, 3: 46, 4: 24 };

function pitchSvg() {
  return `
    <svg class="pitch-bg" viewBox="0 0 300 450" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stop-color="#0d6b3a"/>
          <stop offset="25%"  stop-color="#0f7a42"/>
          <stop offset="50%"  stop-color="#0d6b3a"/>
          <stop offset="75%"  stop-color="#0f7a42"/>
          <stop offset="100%" stop-color="#0a4f2b"/>
        </linearGradient>
      </defs>
      <rect width="300" height="450" fill="url(#pg)"/>
      <!-- Stripe texture -->
      <rect x="0"   y="0"   width="300" height="45"  fill="rgba(255,255,255,0.02)"/>
      <rect x="0"   y="90"  width="300" height="45"  fill="rgba(255,255,255,0.02)"/>
      <rect x="0"   y="180" width="300" height="45"  fill="rgba(255,255,255,0.02)"/>
      <rect x="0"   y="270" width="300" height="45"  fill="rgba(255,255,255,0.02)"/>
      <rect x="0"   y="360" width="300" height="45"  fill="rgba(255,255,255,0.02)"/>
      <!-- Lines -->
      <rect x="8" y="8" width="284" height="434" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
      <line x1="8" y1="225" x2="292" y2="225" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
      <circle cx="150" cy="225" r="36" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
      <circle cx="150" cy="225" r="3" fill="rgba(255,255,255,0.4)"/>
      <!-- Penalty areas -->
      <rect x="68" y="8"   width="164" height="66" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
      <rect x="68" y="376" width="164" height="66" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
      <!-- Goal boxes -->
      <rect x="114" y="8"   width="72" height="26" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
      <rect x="114" y="416" width="72" height="26" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
    </svg>`;
}

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
            data-pid="${esc(String(p.id))}" ${posAttr}>
      <div class="player-card">
        <div class="player-photo-ring ${posClass}${cap}">
          <div class="player-photo-inner">${photoInner}</div>
        </div>
        <span class="player-card-name">${label}</span>
        <span class="player-card-pts">${esc(String(pts))}</span>
      </div>
    </button>`;
}

function sidebarPlayerRow(pick) {
  const p = pick.player || {};
  const url = photoUrl(p.photo);
  const name = p.web_name || '—';
  const pts = p.total_points != null ? formatNumber(p.total_points) : '—';
  const posClass = POS_CLASS[p.element_type] || 'pos-mid';
  const posLabel = { 1:'GK', 2:'DEF', 3:'MID', 4:'FWD' }[p.element_type] || '';
  const initials = esc(String(name).slice(0, 3).toUpperCase());
  const cap = pick.is_captain ? ' 🅲' : pick.is_vice_captain ? ' 🆅' : '';

  const photoEl = url
    ? `<img class="squad-player-photo player-img" src="${esc(url)}" alt="${esc(name)}" loading="lazy">
       <div class="squad-player-photo-fallback player-img-fallback" hidden>${initials}</div>`
    : `<div class="squad-player-photo-fallback">${initials}</div>`;

  return `
    <div class="squad-player-row">
      ${photoEl}
      <div class="squad-player-info">
        <div class="squad-player-name">${esc(name)}${cap}</div>
        <div class="squad-player-meta"><span class="badge badge-${posClass.replace('pos-','')} badge-muted" style="font-size:10px">${posLabel}</span> ${esc(p.team_name || '')}</div>
      </div>
      <div class="squad-player-pts">${esc(String(pts))}</div>
    </div>`;
}

function renderSquadFormation(squad) {
  const host = $('squad-formation');
  if (!host) return;

  const picks = Array.isArray(squad?.picks) ? squad.picks : [];
  const starters = picks.filter((p) => p.position <= 11);
  const bench = picks.filter((p) => p.position >= 12).sort((a, b) => a.position - b.position);

  const lines = { 1: [], 2: [], 3: [], 4: [] };
  starters.forEach((p) => { const type = p.player?.element_type || 1; (lines[type] || lines[1]).push(p); });

  const def = lines[2].length, mid = lines[3].length, fwd = lines[4].length;

  let pitchNodes = '';
  Object.keys(lines).forEach((type) => {
    const row = lines[type];
    const y = ROW_Y[type];
    row.forEach((pick, i) => {
      const x = ((i + 1) / (row.length + 1)) * 100;
      pitchNodes += nodeHtml(pick, { x: x.toFixed(1), y });
    });
  });

  const benchNodes = bench.map((p) => nodeHtml(p, { bench: true })).join('');
  const sidebarRows = picks.map((p) => sidebarPlayerRow(p)).join('');

  host.innerHTML = `
    <div class="squad-layout">
      <div class="card" style="padding:var(--space-4)">
        <div class="card-header">
          <span class="card-title">${esc(t('dash.formation.title'))}</span>
          <span class="formation-badge">${def}-${mid}-${fwd}</span>
        </div>
        <div class="pitch-container">
          ${pitchSvg()}
          ${pitchNodes}
        </div>
        <div class="bench-label">${esc(t('dash.formation.bench'))}</div>
        <div class="bench-row">${benchNodes}</div>
        <div class="player-tooltip" id="player-tooltip" hidden></div>
      </div>

      <div class="squad-sidebar">
        <div class="card squad-list-card">
          <div class="card-header">
            <span class="card-title" style="font-size:15px">${esc(t('dash.formation.squad') || 'Your Squad')}</span>
          </div>
          ${sidebarRows}
        </div>
      </div>
    </div>`;

  // Apply pitch positions via JS — CSP blocks inline style= attributes.
  host.querySelectorAll('.player-node[data-pitch-x]').forEach((node) => {
    node.style.left = node.dataset.pitchX + '%';
    node.style.top = node.dataset.pitchY + '%';
  });

  // CSP-safe image error fallback — onerror="..." is blocked by script-src.
  wireImgFallbacks(host);

  wirePitch(host, picks);
}

function renderFormationEmpty() {
  const host = $('squad-formation');
  if (!host) return;
  host.innerHTML = `
    <div class="card state state-empty">
      <div style="font-size:48px">⚽</div>
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
      <div class="tip-row"><span>${esc(t('dash.points') || 'Points')}</span><span class="tip-val">${esc(String(p.total_points ?? 0))}</span></div>
      <div class="tip-row"><span>${esc(t('dash.form') || 'Form')}</span><span class="tip-val">${esc(String(p.form ?? '0.0'))}</span></div>
      <div class="tip-row"><span>xG</span><span class="tip-val">${esc(String(p.expected_goals ?? '—'))}</span></div>
      ${news ? `<div class="tip-news">⚠️ ${esc(news)}</div>` : ''}`;
    tip.hidden = false;
  });
}

/* ============================================================
   Squad loading
   ============================================================ */
async function loadSquad() {
  try {
    const data = await fetchMySquad();
    if (!data.connected || !data.squad) { renderSquadEmpty(); renderFormationEmpty(); return; }
    renderSquadStats(data.squad);
    renderSquadFormation(data.squad);
  } catch { renderSquadEmpty(); renderFormationEmpty(); }
}

/* ============================================================
   Delegated actions
   ============================================================ */
function wireActions() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="captain-share"]');
    if (btn) shareCaptain(btn.getAttribute('data-name') || '');
  });
}

/* ============================================================
   Init
   ============================================================ */
function init() {
  applyTranslations();
  renderQuickActions();
  renderStatScaffold();
  wireActions();
  loadGameweek();
  loadSquad();
  loadCaptain();
}

window.addEventListener('beforeunload', () => { if (countdownTimer) clearInterval(countdownTimer); });
document.addEventListener('DOMContentLoaded', init);
