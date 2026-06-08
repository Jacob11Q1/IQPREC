/* ============================================================
   IQPREC — competitions-widget.js
   Competition milestone progress bar. Fetches the live user count
   from GET /api/v1/stats/milestone and renders an animated bar.
   Mount points: any element with [data-widget="milestone"] (used
   on the landing page hero and the dashboard competitions widget).
   ============================================================ */

import { api } from './api.js';
import { t } from './i18n.js';
import { formatNumber } from './ui.js';

// Milestone ladder (CLAUDE.md): 20, 50, 100, 250, 500, 750, 1000, then +250.
const LADDER = [20, 50, 100, 250, 500, 750, 1000];

export function nextMilestoneFor(currentUsers) {
  for (const m of LADDER) if (currentUsers < m) return m;
  // Beyond 1000 → next multiple of 250.
  return Math.ceil((currentUsers + 1) / 250) * 250;
}

/**
 * renderMilestoneBar(currentUsers, nextMilestone, mount?) — builds the
 * bar HTML and animates the fill width via a CSS width transition.
 */
export function renderMilestoneBar(currentUsers, nextMilestone, mount) {
  const next = nextMilestone || nextMilestoneFor(currentUsers);
  const pct = Math.max(0, Math.min(100, (currentUsers / next) * 100));

  const targets = mount
    ? [mount]
    : Array.from(document.querySelectorAll('[data-widget="milestone"]'));

  for (const el of targets) {
    el.innerHTML = `
      <div class="competition-milestone-bar">
        <div class="milestone-head">
          <span class="milestone-current">${formatNumber(currentUsers)}</span>
          <span class="milestone-next">${t('milestone.next', { next: formatNumber(next) })}</span>
        </div>
        <div class="milestone-track" role="progressbar"
             aria-valuemin="0" aria-valuemax="${next}" aria-valuenow="${currentUsers}">
          <div class="milestone-fill"></div>
        </div>
      </div>
    `;
    const fill = el.querySelector('.milestone-fill');
    // Next frame so the transition animates from 0 → pct.
    requestAnimationFrame(() => { fill.style.width = `${pct}%`; });
  }
}

export async function initMilestoneWidget() {
  const mounts = document.querySelectorAll('[data-widget="milestone"]');
  if (!mounts.length) return;

  const res = await api.get('/stats/milestone');
  if (!res.success || !res.data) return; // backend not ready yet

  const current = res.data.currentUsers ?? res.data.current ?? res.data.count ?? 0;
  const next = res.data.nextMilestone ?? res.data.next ?? nextMilestoneFor(current);
  renderMilestoneBar(current, next);
}

/* ------------------------------------------------------------
   Dashboard competitions widget — richer than the bare milestone
   bar. Combines the user's referral progress with the live
   milestone count and any open competition. Mounts on the
   dashboard's [data-widget="competitions"] element.
     • < 5 referrals      → progress toward entry + share CTA
     • ≥ 5 + comp open    → "qualified" badge + prize pool
     • no comp open       → milestone progress toward the next tier
   ------------------------------------------------------------ */
const REQUIRED_REFERRALS = 5;

export async function renderDashboardWidget() {
  const mount = document.querySelector('[data-widget="competitions"]');
  if (!mount) return;

  mount.innerHTML = `<div class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text w-75"></div></div>`;

  const [meRes, msRes, compRes] = await Promise.all([
    api.get('/auth/me'),
    api.get('/stats/milestone'),
    api.get('/competitions/current'),
  ]);

  const user = meRes?.data?.user || {};
  const referralCount = user.referralCount ?? 0;
  const qualified = user.competitionQualified ?? referralCount >= REQUIRED_REFERRALS;

  const current = msRes?.data?.currentUsers ?? 0;
  const next = msRes?.data?.nextMilestone ?? nextMilestoneFor(current);
  const competition = compRes?.data?.competition || null;

  let body;
  if (competition && qualified) {
    // Qualified + a competition is open → qualified badge + prize pool.
    body = `
      <span class="badge badge-green comp-badge">${t('comp.qualified')}</span>
      <p class="state-message">${t('comp.referProgressDone')}</p>
      <div class="comp-prize">${t('comp.prizePool')}</div>`;
  } else if (referralCount < REQUIRED_REFERRALS) {
    // Not yet qualified → referral progress + share CTA.
    const remaining = REQUIRED_REFERRALS - referralCount;
    const pct = Math.min(100, (referralCount / REQUIRED_REFERRALS) * 100);
    body = `
      <span class="badge badge-gold comp-badge">${t('comp.notQualified')}</span>
      <p class="state-message">${t('comp.referProgress', { remaining })}</p>
      <div class="milestone-track" role="progressbar"
           aria-valuemin="0" aria-valuemax="${REQUIRED_REFERRALS}" aria-valuenow="${referralCount}">
        <div class="milestone-fill" data-pct="${pct}"></div>
      </div>
      <a class="btn btn-primary btn-block comp-share" href="/competitions.html">${t('comp.shareToEnter')}</a>`;
  } else {
    // Qualified but no open competition → milestone progress.
    const pct = Math.min(100, (current / next) * 100);
    body = `
      <span class="badge badge-green comp-badge">${t('comp.qualified')}</span>
      <p class="state-message">${t('comp.noneOpen')}</p>
      <div class="milestone-head">
        <span class="milestone-current">${formatNumber(current)}</span>
        <span class="milestone-next">${t('milestone.next', { next: formatNumber(next) })}</span>
      </div>
      <div class="milestone-track" role="progressbar"
           aria-valuemin="0" aria-valuemax="${next}" aria-valuenow="${current}">
        <div class="milestone-fill" data-pct="${pct}"></div>
      </div>
      <p class="comp-milestone-note">${t('comp.milestoneToward')}</p>`;
  }

  mount.innerHTML = `
    <div class="card">
      <div class="card-header"><span class="card-title">${t('comp.title')}</span></div>
      ${body}
    </div>`;

  // Animate any progress fills from 0 → target.
  mount.querySelectorAll('.milestone-fill[data-pct]').forEach((fill) => {
    requestAnimationFrame(() => { fill.style.width = `${fill.getAttribute('data-pct')}%`; });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initMilestoneWidget();
  renderDashboardWidget();
});
