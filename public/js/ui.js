/* ============================================================
   IQPREC — ui.js
   Framework-free UI utilities: toasts, skeleton swap, error /
   empty states, and number / date formatting. Every state has
   an Arabic + English string via i18n.
   ============================================================ */

import { t, getLanguage } from './i18n.js';

/* ------------------------------------------------------------
   Show / hide
   ------------------------------------------------------------ */

export function show(el) {
  const node = typeof el === 'string' ? document.getElementById(el) : el;
  if (node) node.hidden = false;
}

export function hide(el) {
  const node = typeof el === 'string' ? document.getElementById(el) : el;
  if (node) node.hidden = true;
}

/* ------------------------------------------------------------
   Toasts
   ------------------------------------------------------------ */

const TOAST_ICONS = {
  success: '<path d="M20 6 9 17l-5-5"/>',
  error: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  warning: '<path d="m21.7 18-9-15.5a1 1 0 0 0-1.7 0L1.3 18a1 1 0 0 0 .8 1.5h18a1 1 0 0 0 .8-1.5z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
};

function toastStack() {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    stack.setAttribute('aria-live', 'polite');
    stack.setAttribute('aria-atomic', 'true');
    document.body.appendChild(stack);
  }
  return stack;
}

/**
 * showToast(message, type) — type: success | error | warning | info.
 * Auto-dismisses after 4 seconds.
 */
export function showToast(message, type = 'info') {
  const stack = toastStack();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.innerHTML = `
    <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TOAST_ICONS[type] || TOAST_ICONS.info}</svg>
    <span class="toast-msg"></span>
  `;
  toast.querySelector('.toast-msg').textContent = message;
  stack.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));

  const remove = () => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 220);
  };
  setTimeout(remove, 4000);
  return toast;
}

/* ------------------------------------------------------------
   Skeleton loading
   ------------------------------------------------------------ */

const _skeletonCache = new Map();

function skeletonMarkup() {
  return `
    <div class="skeleton skeleton-title"></div>
    <div class="skeleton skeleton-text w-75"></div>
    <div class="skeleton skeleton-text w-50"></div>
    <div class="skeleton skeleton-card" style="margin-top:16px"></div>
  `;
}

/** showSkeleton(elementId) — stashes content, shows shimmer. */
export function showSkeleton(elementId, markup) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (!_skeletonCache.has(elementId)) {
    _skeletonCache.set(elementId, el.innerHTML);
  }
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = markup || skeletonMarkup();
}

/** hideSkeleton(elementId) — restores stashed content (or new HTML). */
export function hideSkeleton(elementId, newHTML) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.removeAttribute('aria-busy');
  if (typeof newHTML === 'string') {
    el.innerHTML = newHTML;
    _skeletonCache.delete(elementId);
    return;
  }
  if (_skeletonCache.has(elementId)) {
    el.innerHTML = _skeletonCache.get(elementId);
    _skeletonCache.delete(elementId);
  }
}

/* ------------------------------------------------------------
   Error / empty states
   ------------------------------------------------------------ */

const ICON_ERROR =
  '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>';
const ICON_EMPTY =
  '<path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-3H5a2 2 0 0 0-2 2z"/>';

function stateIcon(paths) {
  return `<svg class="state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

/**
 * showError(elementId, message, onRetry?) — error state with a retry
 * button. If onRetry is given it is invoked on click; otherwise the
 * button reloads the page.
 */
export function showError(elementId, message, onRetry) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.removeAttribute('aria-busy');
  el.innerHTML = `
    <div class="state state-error" role="alert">
      ${stateIcon(ICON_ERROR)}
      <p class="state-title" data-i18n="state.error.title">${t('state.error.title')}</p>
      <p class="state-message"></p>
      <button class="btn btn-secondary" type="button" data-role="retry" data-i18n="action.retry">${t('action.retry')}</button>
    </div>
  `;
  el.querySelector('.state-message').textContent = message || t('state.error.message');
  el.querySelector('[data-role="retry"]').addEventListener('click', () => {
    if (typeof onRetry === 'function') onRetry();
    else window.location.reload();
  });
}

/**
 * showEmpty(elementId, message, ctaText, ctaAction) — empty state with
 * an optional CTA button.
 */
export function showEmpty(elementId, message, ctaText, ctaAction) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.removeAttribute('aria-busy');
  const cta = ctaText
    ? `<button class="btn btn-primary" type="button" data-role="cta">${ctaText}</button>`
    : '';
  el.innerHTML = `
    <div class="state state-empty">
      ${stateIcon(ICON_EMPTY)}
      <p class="state-title" data-i18n="state.empty.title">${t('state.empty.title')}</p>
      <p class="state-message"></p>
      ${cta}
    </div>
  `;
  el.querySelector('.state-message').textContent = message || t('state.empty.message');
  const btn = el.querySelector('[data-role="cta"]');
  if (btn && typeof ctaAction === 'function') {
    btn.addEventListener('click', ctaAction);
  }
}

/* ------------------------------------------------------------
   Formatters
   ------------------------------------------------------------ */

/** formatNumber(n) — group separators using the active locale. */
export function formatNumber(n, lang = getLanguage()) {
  const value = Number(n);
  if (!Number.isFinite(value)) return String(n ?? '');
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  return new Intl.NumberFormat(locale).format(value);
}

/** formatDate(d, lang) — localized medium date. */
export function formatDate(d, lang = getLanguage()) {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const locale = lang === 'ar' ? 'ar-EG' : 'en-US';
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

/** formatRelativeDays(n, lang) — "in X days" helper for trial copy. */
export function formatRelativeDays(days, lang = getLanguage()) {
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar' : 'en', {
    numeric: 'auto',
  });
  return rtf.format(days, 'day');
}
