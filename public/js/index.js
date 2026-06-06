/* ============================================================
   IQPREC — index.js  (Landing page controller)
   • Injects the animated reticle logo into the hero.
   • Counts up social-proof numbers when scrolled into view.
   • Fetches real stats from GET /api/v1/stats.
   • Reveals feature cards on scroll (IntersectionObserver).
   • Click-to-copy FPL join code.
   • Loads the community leaderboard (graceful when absent).
   ============================================================ */

import { createLogoHTML } from './layout.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { showToast, formatNumber } from './ui.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------
   Hero logo
   ------------------------------------------------------------ */
function injectHeroLogo() {
  const host = document.getElementById('hero-logo');
  if (host) host.innerHTML = createLogoHTML('icon', { size: 96 });
}

/* ------------------------------------------------------------
   Count-up
   ------------------------------------------------------------ */
export function countUp(element, target, duration = 1500) {
  const to = Number(target) || 0;
  if (reduceMotion || to === 0) {
    element.textContent = formatNumber(to);
    return;
  }
  const start = performance.now();
  function frame(now) {
    const p = Math.min(1, (now - start) / duration);
    // easeOutCubic
    const eased = 1 - Math.pow(1 - p, 3);
    element.textContent = formatNumber(Math.round(to * eased));
    if (p < 1) requestAnimationFrame(frame);
    else element.textContent = formatNumber(to);
  }
  requestAnimationFrame(frame);
}

function animateCounters(section) {
  section.querySelectorAll('.counter').forEach((el) => {
    const target = Number(el.getAttribute('data-target')) || 0;
    countUp(el, target, 1500);
  });
}

function observeSocialProof() {
  const section = document.querySelector('.social-proof');
  if (!section) return;

  let done = false;
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !done) {
          done = true;
          animateCounters(section);
          io.disconnect();
        }
      });
    },
    { threshold: 0.4 }
  );
  io.observe(section);

  // Allow a re-run when real numbers arrive after first paint.
  section.__rerun = () => { if (done) animateCounters(section); };
}

/* ------------------------------------------------------------
   Real stats
   ------------------------------------------------------------ */
async function loadStats() {
  const res = await api.get('/stats');
  if (!res.success || !res.data) return;

  const d = res.data;
  const map = [
    ['social.totalManagers', d.total_users],
    ['social.arabManagers', d.arab_users],
    ['social.aiRecs', d.ai_recommendations],
  ];

  document.querySelectorAll('.counter-block').forEach((block) => {
    const labelEl = block.querySelector('.counter-label');
    const counter = block.querySelector('.counter');
    if (!labelEl || !counter) return;
    const key = labelEl.getAttribute('data-i18n');
    const found = map.find(([k]) => k === key);
    if (found) counter.setAttribute('data-target', String(found[1] ?? 0));
  });

  const section = document.querySelector('.social-proof');
  if (section && section.__rerun) section.__rerun();
}

/* ------------------------------------------------------------
   Feature reveal
   ------------------------------------------------------------ */
function observeFeatures() {
  const cards = document.querySelectorAll('.feature-card');
  if (!cards.length) return;
  // Fallbacks: reduced motion or no IntersectionObserver → show immediately,
  // so cards are never permanently invisible.
  if (reduceMotion || !('IntersectionObserver' in window)) {
    cards.forEach((c) => c.classList.add('visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  cards.forEach((c) => io.observe(c));
}

/* ------------------------------------------------------------
   Join-code copy
   ------------------------------------------------------------ */
function wireJoinCode() {
  const btn = document.getElementById('join-code');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const code = btn.querySelector('code')?.textContent?.trim() || '';
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    showToast(t('community.copied'), 'success');
  });
}

/* ------------------------------------------------------------
   Leaderboard (graceful — endpoint may not exist yet)
   ------------------------------------------------------------ */
async function loadLeaderboard() {
  const list = document.getElementById('leaderboard');
  if (!list) return;

  const res = await api.get('/community/leaderboard');
  if (!res.success || !Array.isArray(res.data?.managers)) return;

  const rows = res.data.managers.slice(0, 3);
  if (!rows.length) return;

  list.innerHTML = rows
    .map(
      (m, i) => `
      <li class="leaderboard-row">
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-name"></span>
        <span class="lb-pts">${formatNumber(m.points ?? 0)}</span>
      </li>`
    )
    .join('');
  // Set names safely (avoid HTML injection).
  list.querySelectorAll('.lb-name').forEach((el, i) => {
    el.textContent = rows[i].name ?? '—';
  });
}

/* ------------------------------------------------------------
   Init
   ------------------------------------------------------------ */
function init() {
  injectHeroLogo();
  observeSocialProof();
  observeFeatures();
  wireJoinCode();
  loadStats();
  loadLeaderboard();
}

document.addEventListener('DOMContentLoaded', init);
