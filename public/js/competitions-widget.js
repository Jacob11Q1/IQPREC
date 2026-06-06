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

document.addEventListener('DOMContentLoaded', initMilestoneWidget);
