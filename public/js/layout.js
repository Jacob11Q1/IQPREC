/* ============================================================
   IQPREC — layout.js
   Shared chrome for every dashboard page:
     • createReticleSVG / createLogoHTML  (brand)
     • renderSidebar()    desktop navigation
     • renderBottomNav()  mobile navigation + "More" slide-up panel
   Injected on DOMContentLoaded into .sidebar / #sidebar and
   .mobile-nav / #bottom-nav. Pure Vanilla JS — no framework.
   ============================================================ */

import { t, toggleLanguage, getLanguage, applyTranslations } from './i18n.js';
import { logout } from './auth.js';

/* ------------------------------------------------------------
   Brand: reticle SVG + wordmark
   ------------------------------------------------------------ */

/**
 * createReticleSVG(size, color) → SVG string.
 * Three concentric rings (30% / 60% / 100% opacity), four
 * crosshairs, a center dot in navy. pathLength="100" lets the
 * CSS stroke-dashoffset animation draw every ring uniformly.
 */
export function createReticleSVG(size = 40, color = 'var(--green)') {
  return `<svg class="reticle" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="IQPREC">
    <circle class="reticle-ring reticle-ring-1" cx="50" cy="50" r="46" stroke="${color}" stroke-width="3" pathLength="100" opacity="0.30"/>
    <circle class="reticle-ring reticle-ring-2" cx="50" cy="50" r="32" stroke="${color}" stroke-width="3" pathLength="100" opacity="0.60"/>
    <circle class="reticle-ring reticle-ring-3" cx="50" cy="50" r="18" stroke="${color}" stroke-width="3" pathLength="100" opacity="1"/>
    <line class="reticle-cross" x1="50" y1="1"  x2="50" y2="21" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    <line class="reticle-cross" x1="50" y1="79" x2="50" y2="99" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    <line class="reticle-cross" x1="1"  y1="50" x2="21" y2="50" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    <line class="reticle-cross" x1="79" y1="50" x2="99" y2="50" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
    <circle class="reticle-dot" cx="50" cy="50" r="6.5" fill="${color}"/>
    <circle cx="50" cy="50" r="2.6" fill="var(--navy)"/>
  </svg>`;
}

const wordmark = () =>
  `<span class="logo-word"><span class="logo-iq">IQ</span><span class="logo-prec">PREC</span></span>`;

/**
 * createLogoHTML(variant) → full logo markup.
 *   full    → reticle + IQPREC + tagline
 *   compact → reticle + IQPREC (small)
 *   icon    → reticle only
 */
export function createLogoHTML(variant = 'full', { size } = {}) {
  if (variant === 'icon') {
    return `<span class="logo logo-icon">${createReticleSVG(size || 40)}</span>`;
  }
  if (variant === 'compact') {
    return `<span class="logo logo-compact">${createReticleSVG(size || 30)}${wordmark()}</span>`;
  }
  // full
  return `<span class="logo logo-full">${createReticleSVG(size || 48)}
    <span class="logo-stack">
      ${wordmark()}
      <span class="logo-tagline" data-i18n="brand.tagline">${t('brand.tagline')}</span>
    </span>
  </span>`;
}

/* ------------------------------------------------------------
   Navigation model + Lucide-style inline icons
   ------------------------------------------------------------ */

// Canonical sidebar order (Day 2 spec).
const NAV_ITEMS = [
  { href: '/dashboard.html', key: 'nav.dashboard', icon: 'dashboard' },
  { href: '/lineup.html', key: 'nav.lineup', icon: 'lineup' },
  { href: '/captain.html', key: 'nav.captain', icon: 'captain' },
  { href: '/transfers.html', key: 'nav.transfers', icon: 'transfers' },
  { href: '/differentials.html', key: 'nav.differentials', icon: 'differentials' },
  { href: '/chips.html', key: 'nav.chips', icon: 'chips' },
  { href: '/mini-league.html', key: 'nav.miniLeague', icon: 'miniLeague' },
  { href: '/chat.html', key: 'nav.chat', icon: 'chat' },
  { href: '/arab-stars.html', key: 'nav.arabStars', icon: 'arabStars' },
  { href: '/community.html', key: 'nav.community', icon: 'community' },
  { href: '/competitions.html', key: 'nav.competitions', icon: 'competitions' },
  { href: '/billing.html', key: 'nav.billing', icon: 'billing' },
  { href: '/ask-me.html', key: 'nav.askMe', icon: 'askMe' },
];

// Bottom-nav primary destinations (the 5th is "More").
const BOTTOM_PRIMARY = ['/dashboard.html', '/lineup.html', '/captain.html', '/chat.html'];

// Lucide SVG path bodies (24x24, stroke=currentColor).
const ICONS = {
  dashboard:
    '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  lineup:
    '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  captain:
    '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  transfers:
    '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  differentials:
    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  chips:
    '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 12.4-9.17 4.16a2 2 0 0 1-1.66 0L2 12.4"/><path d="m22 17.4-9.17 4.16a2 2 0 0 1-1.66 0L2 17.4"/>',
  miniLeague:
    '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  chat:
    '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  arabStars:
    '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/>',
  community:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  competitions:
    '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><path d="M11 12 5.12 2.2"/><path d="m13 12 5.88-9.8"/><path d="M8 7h8"/><circle cx="12" cy="17" r="5"/><path d="M12 18v-2h-.5"/>',
  billing:
    '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  askMe:
    '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  more:
    '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  logout:
    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};

function icon(name) {
  return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function isActive(href) {
  const path = window.location.pathname;
  if (href === path) return true;
  // "/" → index; also treat /dashboard as default landing when at root of app
  if (path === '/' && href === '/dashboard.html') return false;
  return false;
}

/* ------------------------------------------------------------
   Sidebar (desktop)
   ------------------------------------------------------------ */

export function renderSidebar() {
  const links = NAV_ITEMS.map((item) => {
    const active = isActive(item.href) ? ' active' : '';
    return `<a class="nav-link${active}" href="${item.href}" aria-current="${active ? 'page' : 'false'}">
      ${icon(item.icon)}<span data-i18n="${item.key}">${t(item.key)}</span>
    </a>`;
  }).join('');

  return `
    <a class="sidebar-brand" href="/dashboard.html" aria-label="IQPREC">
      ${createLogoHTML('compact')}
    </a>

    <nav class="sidebar-nav" aria-label="Primary">
      ${links}
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-trial" id="sidebar-trial-badge" hidden></div>

      <button class="lang-toggle lang-toggle-full" data-action="lang-toggle" type="button">
        <span class="lang-opt${getLanguage() === 'ar' ? ' on' : ''}" data-i18n="lang.ar">عربي</span>
        <span class="lang-sep">/</span>
        <span class="lang-opt${getLanguage() === 'en' ? ' on' : ''}" data-i18n="lang.en">EN</span>
      </button>

      <button class="btn btn-ghost btn-block" data-action="logout" type="button">
        ${icon('logout')}<span data-i18n="nav.logout">${t('nav.logout')}</span>
      </button>
    </div>
  `;
}

/* ------------------------------------------------------------
   Bottom nav (mobile) + "More" slide-up panel
   ------------------------------------------------------------ */

export function renderBottomNav() {
  const primary = BOTTOM_PRIMARY.map((href) =>
    NAV_ITEMS.find((i) => i.href === href)
  ).filter(Boolean);

  const items = primary
    .map((item) => {
      const active = isActive(item.href) ? ' active' : '';
      return `<a class="bottom-link${active}" href="${item.href}" aria-current="${active ? 'page' : 'false'}">
        ${icon(item.icon)}<span data-i18n="${item.key}">${t(item.key)}</span>
      </a>`;
    })
    .join('');

  const moreActive = !primary.some((i) => isActive(i.href)) &&
    NAV_ITEMS.some((i) => isActive(i.href))
      ? ' active'
      : '';

  return `${items}
    <button class="bottom-link bottom-more${moreActive}" type="button" data-action="more-open" aria-haspopup="dialog">
      ${icon('more')}<span data-i18n="nav.more">${t('nav.more')}</span>
    </button>`;
}

function buildMorePanel() {
  // Items not already on the bottom bar.
  const rest = NAV_ITEMS.filter((i) => !BOTTOM_PRIMARY.includes(i.href));
  const links = rest
    .map((item) => {
      const active = isActive(item.href) ? ' active' : '';
      return `<a class="nav-link${active}" href="${item.href}">
        ${icon(item.icon)}<span data-i18n="${item.key}">${t(item.key)}</span>
      </a>`;
    })
    .join('');

  const panel = document.createElement('div');
  panel.className = 'more-sheet';
  panel.id = 'more-sheet';
  panel.setAttribute('hidden', '');
  panel.innerHTML = `
    <div class="more-sheet-backdrop" data-action="more-close"></div>
    <div class="more-sheet-panel" role="dialog" aria-modal="true" aria-label="More">
      <div class="more-sheet-head">
        <span class="more-sheet-grip" aria-hidden="true"></span>
        <button class="more-sheet-close" type="button" data-action="more-close" aria-label="Close">
          ${icon('close')}
        </button>
      </div>
      <nav class="more-sheet-nav" aria-label="More navigation">${links}</nav>
      <div class="more-sheet-foot">
        <button class="btn btn-ghost btn-block" data-action="logout" type="button">
          ${icon('logout')}<span data-i18n="nav.logout">${t('nav.logout')}</span>
        </button>
      </div>
    </div>
  `;
  return panel;
}

function openMore() {
  const sheet = document.getElementById('more-sheet');
  if (!sheet) return;
  sheet.removeAttribute('hidden');
  requestAnimationFrame(() => sheet.classList.add('open'));
  document.body.style.overflow = 'hidden';
}

function closeMore() {
  const sheet = document.getElementById('more-sheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  document.body.style.overflow = '';
  setTimeout(() => sheet.setAttribute('hidden', ''), 280);
}

/* ------------------------------------------------------------
   Wiring
   ------------------------------------------------------------ */

function wireDelegatedActions() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.getAttribute('data-action');

    if (action === 'lang-toggle') {
      e.preventDefault();
      toggleLanguage();
    } else if (action === 'logout') {
      e.preventDefault();
      logout();
    } else if (action === 'more-open') {
      e.preventDefault();
      openMore();
    } else if (action === 'more-close') {
      e.preventDefault();
      closeMore();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMore();
  });
}

function syncLangToggle() {
  document.querySelectorAll('.lang-toggle-full .lang-opt').forEach((opt) => {
    opt.classList.remove('on');
  });
  const lang = getLanguage();
  document
    .querySelectorAll(`.lang-toggle-full .lang-opt[data-i18n="lang.${lang}"]`)
    .forEach((opt) => opt.classList.add('on'));

  // Simple text toggles elsewhere.
  document.querySelectorAll('[data-action="lang-toggle"]:not(.lang-toggle-full)')
    .forEach((btn) => { btn.textContent = t('lang.toggle'); });
}

export function initLayout() {
  const sidebar = document.querySelector('#sidebar, .sidebar');
  const bottom = document.querySelector('#bottom-nav, .mobile-nav');

  if (sidebar) sidebar.innerHTML = renderSidebar();

  if (bottom) {
    bottom.innerHTML = renderBottomNav();
    if (!document.getElementById('more-sheet')) {
      document.body.appendChild(buildMorePanel());
    }
  }

  wireDelegatedActions();
  applyTranslations();
  syncLangToggle();

  window.addEventListener('iqprec:languagechange', () => {
    applyTranslations();
    syncLangToggle();
  });
}

document.addEventListener('DOMContentLoaded', initLayout);
