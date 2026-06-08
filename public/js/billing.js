/* ============================================================
   IQPREC — billing.js
   Billing page: fetches GET /api/v1/billing/status and renders the
   current-plan card (trial days / monthly next-billing / season expiry),
   pricing cards for upgrading (→ POST /billing/checkout → Stripe), the
   receipt history table, and Manage/Cancel actions for active subs.
   Handles ?success / ?cancelled / ?plan return params from Checkout.
   ============================================================ */

import { api } from './api.js';
import { t, applyTranslations, getLanguage } from './i18n.js';
import { showToast, formatDate } from './ui.js';

function main() {
  return document.querySelector('.content-body');
}

function daysLeft(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/* ------------------------------------------------------------
   Pricing cards (upgrade) — buttons trigger checkout directly.
   ------------------------------------------------------------ */
function pricingCardsHtml() {
  const card = (kind, featured) => `
    <div class="pricing-plan${featured ? ' is-featured' : ''}">
      ${featured ? `<span class="plan-badge">${t('pricing.bestValue')}</span>` : ''}
      <div class="plan-name">${t(`pricing.${kind}.title`)}</div>
      <div class="plan-price">${t(`pricing.${kind}.price`)}</div>
      <p class="plan-desc">${t(`pricing.${kind}.desc`)}</p>
      <button class="btn btn-primary btn-block" type="button" data-action="bill-checkout" data-plan="${kind}">${t('pricing.choose')}</button>
    </div>`;
  return `
    <h2 class="card-title" style="margin-block:var(--space-2)">${t('billing.choosePlan')}</h2>
    <p class="badge badge-green" style="margin-block-end:var(--space-3)">${t('pricing.everything')}</p>
    <div class="pricing-grid">
      ${card('monthly', false)}
      ${card('season', true)}
    </div>`;
}

/* ------------------------------------------------------------
   Current-plan card
   ------------------------------------------------------------ */
function planCardHtml(s) {
  let title = '';
  let sub = '';
  let actions = '';
  let accent = '';

  if (s.status === 'active' && s.plan === 'monthly') {
    title = t('billing.statusActiveMonthly');
    sub = s.nextBillingDate
      ? t('billing.nextBilling', { date: formatDate(s.nextBillingDate) })
      : t('billing.renews');
    actions = `
      <button class="btn btn-secondary" type="button" data-action="bill-portal">${t('billing.manage')}</button>
      <button class="btn btn-ghost" type="button" data-action="bill-cancel">${t('billing.cancel')}</button>`;
  } else if (s.status === 'active' && s.plan === 'season') {
    title = t('billing.statusActiveSeason');
    sub = s.planExpiresAt ? t('billing.expiresOn', { date: formatDate(s.planExpiresAt) }) : '';
  } else if (s.status === 'expired') {
    title = t('billing.statusExpired');
    sub = t('billing.upgrade');
    accent = 'accent-red';
  } else {
    // trial (or unknown) → trial messaging
    title = t('billing.statusTrial', { days: daysLeft(s.trialEndsAt) });
    sub = t('billing.upgrade');
    accent = 'accent-gold';
  }

  return `
    <div class="stats-card ${accent}" id="plan-card">
      <div class="stats-label">${t('billing.currentPlan')}</div>
      <div class="stats-number" style="font-size:22px">${title}</div>
      <div class="stats-sub">${sub}</div>
      ${actions ? `<div class="row" style="margin-block-start:var(--space-4);flex-wrap:wrap">${actions}</div>` : ''}
    </div>`;
}

/* ------------------------------------------------------------
   Receipt history table
   ------------------------------------------------------------ */
function renderReceipts(container, receipts) {
  const wrap = document.createElement('section');
  wrap.className = 'card';
  wrap.innerHTML = `<div class="card-header"><h2 class="card-title">${t('billing.receipts.title')}</h2></div>`;

  if (!receipts || !receipts.length) {
    const p = document.createElement('p');
    p.className = 'state-message';
    p.textContent = t('billing.receipts.empty');
    wrap.appendChild(p);
    container.appendChild(wrap);
    return;
  }

  const table = document.createElement('table');
  table.className = 'receipts-table';
  const head = document.createElement('thead');
  head.innerHTML = `<tr>
    <th>${t('billing.receipts.number')}</th>
    <th>${t('billing.receipts.date')}</th>
    <th>${t('billing.receipts.plan')}</th>
    <th>${t('billing.receipts.amount')}</th>
  </tr>`;
  table.appendChild(head);

  const body = document.createElement('tbody');
  receipts.forEach((r) => {
    const tr = document.createElement('tr');
    const planLabel = r.plan === 'season' ? t('billing.planSeason') : t('billing.planMonthly');
    // textContent for DB-sourced values (no raw innerHTML injection).
    const cells = [
      r.receipt_number || '',
      formatDate(r.paid_at),
      planLabel,
      `$${Number(r.amount).toFixed(2)}`,
    ];
    cells.forEach((val, i) => {
      const td = document.createElement('td');
      td.textContent = val;
      if (i === 0 || i === 3) td.className = 'mono';
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  container.appendChild(wrap);
}

/* ------------------------------------------------------------
   Actions
   ------------------------------------------------------------ */
async function doCheckout(plan) {
  try {
    const res = await api.post('/billing/checkout', { plan });
    if (res.success && res.data?.url) {
      window.location.href = res.data.url;
      return;
    }
    showToast(res.message || t('billing.checkoutError'), 'error');
  } catch {
    showToast(t('billing.checkoutError'), 'error');
  }
}

async function openPortal() {
  try {
    const res = await api.post('/billing/portal');
    if (res.success && res.data?.url) {
      window.location.href = res.data.url;
      return;
    }
    showToast(res.message || t('billing.checkoutError'), 'error');
  } catch {
    showToast(t('billing.checkoutError'), 'error');
  }
}

async function cancelSub() {
  if (!window.confirm(t('billing.cancelConfirm'))) return;
  const res = await api.post('/billing/cancel');
  if (res.success) {
    showToast(t('billing.cancelScheduled'), 'success');
    load();
  } else {
    showToast(res.message || t('billing.checkoutError'), 'error');
  }
}

function wireActions() {
  const root = main();
  if (!root || root.dataset.wired === 'true') return;
  root.dataset.wired = 'true';
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'bill-checkout') doCheckout(btn.getAttribute('data-plan'));
    else if (action === 'bill-portal') openPortal();
    else if (action === 'bill-cancel') cancelSub();
  });
}

/* ------------------------------------------------------------
   Load + render
   ------------------------------------------------------------ */
async function load() {
  const root = main();
  if (!root) return;

  // Reset content under the heading.
  let container = document.getElementById('billing-content');
  if (!container) {
    container = document.createElement('div');
    container.id = 'billing-content';
    container.className = 'stack';
    root.appendChild(container);
  }
  container.innerHTML = `<div class="card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-text w-75"></div></div>`;

  const res = await api.get('/billing/status');
  if (!res.success) {
    container.innerHTML = '';
    const p = document.createElement('p');
    p.className = 'state-message state-error';
    p.textContent = t('billing.loadError');
    container.appendChild(p);
    return;
  }

  const s = res.data;
  container.innerHTML = planCardHtml(s);

  // Show pricing cards unless the user is already active.
  if (s.status !== 'active') {
    const upsell = document.createElement('section');
    upsell.className = 'card';
    upsell.innerHTML = pricingCardsHtml();
    container.appendChild(upsell);
  }

  renderReceipts(container, s.receipts);
  applyTranslations(container);
}

/* ------------------------------------------------------------
   Return-from-Checkout query params
   ------------------------------------------------------------ */
function handleReturnParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('success') === 'true') {
    showToast(t('billing.paySuccess'), 'success');
  } else if (params.get('cancelled') === 'true') {
    showToast(t('billing.payCancelled'), 'info');
  }
  // A plan intent forwarded from the upgrade modal → start checkout.
  const plan = params.get('plan');
  if (plan === 'monthly' || plan === 'season') {
    doCheckout(plan);
  }
  // Clean the URL so a refresh doesn't re-trigger.
  if ([...params.keys()].length) {
    window.history.replaceState({}, '', '/billing.html');
  }
}

function init() {
  applyTranslations();
  // Localize the page heading.
  const h1 = main()?.querySelector('h1');
  if (h1) h1.textContent = t('billing.title');

  wireActions();
  load();
  handleReturnParams();

  window.addEventListener('iqprec:languagechange', () => {
    const heading = main()?.querySelector('h1');
    if (heading) heading.textContent = t('billing.title');
    load();
  });
}

document.addEventListener('DOMContentLoaded', init);
