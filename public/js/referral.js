/* ============================================================
   IQPREC — referral.js
   Referral share card: unique link, copy-to-clipboard, WhatsApp
   share (Web Share API on mobile, wa.me on desktop), progress
   toward the 5-referral competition entry, and a status badge.
   Mount point: any element with [data-widget="referral"].
   ============================================================ */

import { api } from './api.js';
import { t, applyTranslations } from './i18n.js';
import { showToast } from './ui.js';

const REQUIRED = 5; // referrals needed to qualify for the competition.

function referralLink(code) {
  return `iqprec.com/register?ref=${code}`;
}

function statusFor(count, entered) {
  if (entered) return 'entered';
  return count >= REQUIRED ? 'qualified' : 'not-qualified';
}

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/**
 * renderReferralCard(referralCode, referralCount, opts?) — builds the
 * card, injects it into [data-widget="referral"] (or opts.mount), and
 * wires copy + share. Returns the card element.
 */
export function renderReferralCard(referralCode, referralCount = 0, opts = {}) {
  const mount =
    opts.mount || document.querySelector('[data-widget="referral"]');
  if (!mount) return null;

  const entered = Boolean(opts.entered);
  const status = statusFor(referralCount, entered);
  const link = referralLink(referralCode);
  const pct = Math.min(100, (referralCount / REQUIRED) * 100);

  mount.innerHTML = `
    <div class="card referral-card">
      <div class="card-header">
        <span class="card-title" data-i18n="referral.title">${t('referral.title')}</span>
        <span class="referral-status is-${status}"
              data-i18n="referral.status.${status === 'not-qualified' ? 'notQualified' : status === 'qualified' ? 'qualified' : 'entered'}">
          ${t(`referral.status.${status === 'not-qualified' ? 'notQualified' : status}`)}
        </span>
      </div>

      <p class="state-message" data-i18n="referral.subtitle">${t('referral.subtitle')}</p>

      <label class="field-label" data-i18n="referral.linkLabel">${t('referral.linkLabel')}</label>
      <div class="referral-link">
        <code data-role="ref-link">${link}</code>
      </div>

      <div class="referral-actions">
        <button class="btn btn-secondary" type="button" data-role="copy" data-i18n="referral.copy">${t('referral.copy')}</button>
        <button class="btn btn-primary" type="button" data-role="share" data-i18n="referral.share">${t('referral.share')}</button>
      </div>

      <div class="referral-progress-track" role="progressbar"
           aria-valuemin="0" aria-valuemax="${REQUIRED}" aria-valuenow="${referralCount}">
        <div class="referral-progress-fill"></div>
      </div>
      <div class="referral-progress-label">${t('referral.progress', { count: referralCount })}</div>
    </div>
  `;

  applyTranslations(mount);

  const fill = mount.querySelector('.referral-progress-fill');
  requestAnimationFrame(() => { fill.style.width = `${pct}%`; });

  wireCopy(mount, link);
  wireShare(mount, link);

  return mount;
}

function wireCopy(mount, link) {
  const btn = mount.querySelector('[data-role="copy"]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const full = `https://${link}`;
    try {
      await navigator.clipboard.writeText(full);
    } catch {
      // Fallback for older browsers / non-secure contexts.
      const ta = document.createElement('textarea');
      ta.value = full;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    showToast(t('referral.copied'), 'success');
  });
}

function wireShare(mount, link) {
  const btn = mount.querySelector('[data-role="share"]');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const full = `https://${link}`;
    const message = `${t('referral.shareMessage')} ${full}`;

    if (isMobile() && navigator.share) {
      try {
        await navigator.share({ title: 'IQPREC', text: t('referral.shareMessage'), url: full });
        return;
      } catch {
        // user cancelled or share failed → fall through to wa.me
      }
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(wa, '_blank', 'noopener');
  });
}

export async function initReferral() {
  const mount = document.querySelector('[data-widget="referral"]');
  if (!mount) return;

  const res = await api.get('/referrals/me');
  if (!res.success || !res.data) return; // backend not ready yet

  const code = res.data.referralCode ?? res.data.code ?? '';
  const count = res.data.referralCount ?? res.data.count ?? 0;
  const entered = res.data.entered ?? res.data.competitionEntered ?? false;
  if (!code) return;

  renderReferralCard(code, count, { entered });
}

document.addEventListener('DOMContentLoaded', initReferral);
