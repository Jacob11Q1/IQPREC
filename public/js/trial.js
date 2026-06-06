/* ============================================================
   IQPREC — trial.js
   Trial countdown system. On load: GET /api/v1/auth/me, compute
   days remaining from trial_ends_at, render the banner (green /
   yellow / red). At 0 days, replace the page content with the
   full upgrade page. Subscribe opens the subscription modal.
   ============================================================ */

import { api } from './api.js';
import { t, applyTranslations } from './i18n.js';

/** Days left until trial_ends_at (ceil; can be <= 0 when expired). */
export function daysUntil(trialEndsAt) {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / 86_400_000);
}

function variantFor(days) {
  if (days >= 5) return 'green';
  if (days >= 3) return 'yellow';
  return 'red'; // 1-2 days
}

function bannerText(days) {
  if (days <= 1) return t('trial.lastDay');
  return t(`trial.${variantFor(days)}`, { days });
}

/* ------------------------------------------------------------
   Banner
   ------------------------------------------------------------ */

/**
 * renderTrialBanner(daysRemaining) — injects/updates the banner at the
 * top of the main content area. Returns the banner element (or null
 * when the page has expired into the upgrade view).
 */
export function renderTrialBanner(daysRemaining) {
  const main = document.querySelector('.content-body');
  if (!main) return null;

  if (daysRemaining <= 0) {
    renderUpgradePage(main);
    return null;
  }

  const variant = variantFor(daysRemaining);

  let banner = document.getElementById('trial-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'trial-banner';
    main.prepend(banner);
  }
  banner.className = `trial-banner is-${variant}`;
  banner.setAttribute('role', 'status');
  banner.innerHTML = `
    <span class="trial-text"></span>
    <button class="trial-cta" type="button" data-action="subscribe" data-i18n="trial.subscribe">${t('trial.subscribe')}</button>
  `;
  banner.querySelector('.trial-text').textContent = bannerText(daysRemaining);

  updateSidebarBadge(daysRemaining, variant);
  return banner;
}

function updateSidebarBadge(days, variant) {
  const badge = document.getElementById('sidebar-trial-badge');
  if (!badge) return;
  badge.hidden = false;
  badge.classList.remove('is-yellow', 'is-red');
  if (variant === 'yellow') badge.classList.add('is-yellow');
  if (variant === 'red') badge.classList.add('is-red');
  badge.textContent =
    days <= 1 ? t('trial.lastDay') : t('trial.green', { days });
}

/* ------------------------------------------------------------
   Upgrade page (trial expired)
   ------------------------------------------------------------ */

function planCard(kind, featured) {
  return `
    <div class="pricing-plan${featured ? ' is-featured' : ''}">
      <div class="plan-name" data-i18n="pricing.${kind}.title">${t(`pricing.${kind}.title`)}</div>
      <div class="plan-price" data-i18n="pricing.${kind}.price">${t(`pricing.${kind}.price`)}</div>
      <p class="plan-desc" data-i18n="pricing.${kind}.desc">${t(`pricing.${kind}.desc`)}</p>
      <button class="btn btn-primary btn-block" type="button" data-action="subscribe" data-plan="${kind}" data-i18n="pricing.choose">${t('pricing.choose')}</button>
    </div>
  `;
}

export function renderUpgradePage(mainEl) {
  const main = mainEl || document.querySelector('.content-body');
  if (!main) return;
  main.innerHTML = `
    <div class="upgrade-page">
      <h1 class="state-title" data-i18n="trial.expired.title">${t('trial.expired.title')}</h1>
      <p class="state-message" data-i18n="trial.expired.message">${t('trial.expired.message')}</p>
      <p class="badge badge-green" data-i18n="pricing.everything">${t('pricing.everything')}</p>
      <div class="pricing-grid">
        ${planCard('monthly', false)}
        ${planCard('season', true)}
      </div>
    </div>
  `;
  applyTranslations(main);
}

/* ------------------------------------------------------------
   Subscription modal
   ------------------------------------------------------------ */

export function openSubscriptionModal(preselect) {
  let overlay = document.getElementById('subscription-modal');
  if (overlay) {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('open'));
    return overlay;
  }

  overlay = document.createElement('div');
  overlay.id = 'subscription-modal';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Subscribe">
      <button class="modal-close" type="button" data-action="modal-close" aria-label="Close">✕</button>
      <h2 class="modal-title" data-i18n="trial.subscribe">${t('trial.subscribe')}</h2>
      <p class="modal-sub" data-i18n="pricing.everything">${t('pricing.everything')}</p>
      <div class="pricing-grid">
        ${planCard('monthly', preselect === 'monthly')}
        ${planCard('season', preselect !== 'monthly')}
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  applyTranslations(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-action="modal-close"]')) {
      closeSubscriptionModal();
    }
    const planBtn = e.target.closest('[data-action="subscribe"][data-plan]');
    if (planBtn) {
      const plan = planBtn.getAttribute('data-plan');
      // Billing/checkout is wired in a later day; route to billing with intent.
      window.location.href = `/billing.html?plan=${encodeURIComponent(plan)}`;
    }
  });

  requestAnimationFrame(() => overlay.classList.add('open'));
  document.body.style.overflow = 'hidden';
  return overlay;
}

export function closeSubscriptionModal() {
  const overlay = document.getElementById('subscription-modal');
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => { overlay.hidden = true; }, 220);
}

/* ------------------------------------------------------------
   Init
   ------------------------------------------------------------ */

export async function initTrial() {
  // Subscribe buttons anywhere on the page open the modal.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="subscribe"]');
    if (!btn) return;
    // data-plan buttons inside the modal/upgrade page handle their own routing.
    if (btn.closest('#subscription-modal')) return;
    e.preventDefault();
    openSubscriptionModal(btn.getAttribute('data-plan') || undefined);
  });

  const res = await api.get('/auth/me');
  if (!res.success || !res.data) return; // not logged in / backend not ready

  const user = res.data.user ?? res.data;
  // Active subscribers see no trial banner.
  const status = user.subscription_status || user.status;
  if (status === 'active' || status === 'paid' || status === 'subscribed') return;

  const days = daysUntil(user.trial_ends_at);
  if (days === null) return;

  renderTrialBanner(days);
  applyTranslations();
}

document.addEventListener('DOMContentLoaded', () => {
  if (document.body?.dataset?.public === 'true') return;
  initTrial();
});
