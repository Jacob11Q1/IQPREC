/* One-shot scaffolder: writes the base HTML template into every page,
   plus a per-page CSS file and a per-page JS module. Run with:
     node scripts/generate-pages.mjs
   Safe to re-run; it overwrites the scaffold files it owns. */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUB = resolve(__dirname, '..', 'public');

// slug, titleEN, public?, requiresShell?
const PAGES = [
  ['index', 'IQPREC — Intelligence. Precision. Every Gameweek.', true, false],
  ['login', 'Log in — IQPREC', true, false],
  ['register', 'Create account — IQPREC', true, false],
  ['verify-email', 'Verify your email — IQPREC', true, false],
  ['about', 'About — IQPREC', true, false],
  ['privacy', 'Privacy Policy — IQPREC', true, false],
  ['terms', 'Terms of Service — IQPREC', true, false],
  ['cookies', 'Cookie Policy — IQPREC', true, false],
  ['competitions', 'Competitions — IQPREC', true, false],
  ['dashboard', 'Dashboard — IQPREC', false, true],
  ['captain', 'Captain — IQPREC', false, true],
  ['lineup', 'Lineup — IQPREC', false, true],
  ['transfers', 'Transfers — IQPREC', false, true],
  ['differentials', 'Differentials — IQPREC', false, true],
  ['player-intel', 'Player Intel — IQPREC', false, true],
  ['chips', 'Chips — IQPREC', false, true],
  ['mini-league', 'Mini-League — IQPREC', false, true],
  ['chat', 'AI Assistant — IQPREC', false, true],
  ['community', 'Community — IQPREC', false, true],
  ['arab-stars', 'Arab Stars Watch — IQPREC', false, true],
  ['billing', 'Billing — IQPREC', false, true],
  ['referrals', 'Referrals — IQPREC', false, true],
  ['onboarding', 'Welcome — IQPREC', false, true],
  ['ask-me', 'Ask Me — IQPREC', false, true],
];

const FONTS = `  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500&family=Noto+Sans+Arabic:wght@400;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">`;

function head(slug, title) {
  return `  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="theme-color" content="#0B1929">
  <meta name="description" content="IQPREC — AI-powered Fantasy Premier League intelligence. Intelligence. Precision. Every Gameweek.">
  <title>${title}</title>
${FONTS}
  <link rel="stylesheet" href="/css/design-system.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/layout.css">
  <link rel="stylesheet" href="/css/${slug}.css">`;
}

const footer = `      <footer class="app-footer">
        <p data-i18n="footer.rights">All Rights Reserved © IQPREC</p>
        <p><span data-i18n="footer.credit">Designed and Developed by Jacob Qumsiyeh</span>
          — <a href="https://jacobqum.dev" target="_blank" rel="noopener">jacobqum.dev</a></p>
      </footer>`;

// Per-page extras: widget mount markup + extra entry scripts.
const EXTRAS = {
  dashboard: {
    scripts: ['/js/competitions-widget.js', '/js/referral.js'],
    mounts:
      '\n        <section class="card" data-widget="milestone" aria-label="Community milestone"></section>\n        <section data-widget="referral" aria-label="Referrals"></section>',
  },
  competitions: {
    scripts: ['/js/competitions-widget.js'],
    mounts:
      '\n        <section class="card" data-widget="milestone" aria-label="Community milestone"></section>',
  },
  referrals: {
    scripts: ['/js/referral.js'],
    mounts: '\n        <section data-widget="referral" aria-label="Referrals"></section>',
  },
  index: {
    scripts: ['/js/competitions-widget.js'],
    mounts:
      '\n        <section class="card" data-widget="milestone" aria-label="Community milestone"></section>',
  },
};

function scriptTags(srcs) {
  return srcs.map((s) => `  <script type="module" src="${s}"></script>`).join('\n');
}

function shellBody(slug, title) {
  const extra = EXTRAS[slug] || {};
  const mounts = extra.mounts || '';
  const scripts = scriptTags([
    '/js/auth.js',
    '/js/i18n.js',
    '/js/layout.js',
    '/js/trial.js',
    ...(extra.scripts || []),
    `/js/${slug}.js`,
  ]);

  return `<body data-page="${slug}">
  <div class="app-shell">
    <nav class="sidebar" id="sidebar" aria-label="Sidebar"></nav>

    <div class="content">
      <header class="topbar">
        <div class="topbar-brand-mobile">
          <span class="logo-iq">IQ</span><span class="logo-prec">PREC</span>
        </div>
        <button class="lang-toggle" data-action="lang-toggle" type="button" aria-label="Toggle language">العربية</button>
      </header>

      <main class="content-body">
        <h1 data-i18n="nav.${slugToNavKey(slug)}">${title}</h1>${mounts}
        <!-- ${slug} page content rendered by /js/${slug}.js -->
      </main>

${footer}
    </div>

    <nav class="mobile-nav" id="bottom-nav" aria-label="Mobile navigation"></nav>
  </div>

${scripts}
</body>`;
}

function publicBody(slug, title) {
  const extra = EXTRAS[slug] || {};
  const mounts = extra.mounts || '';
  const scripts = scriptTags([
    '/js/auth.js',
    '/js/i18n.js',
    '/js/layout.js',
    ...(extra.scripts || []),
    `/js/${slug}.js`,
  ]);

  return `<body data-page="${slug}" data-public="true">
  <div class="app-shell">
    <div class="content">
      <header class="topbar">
        <a class="topbar-brand-mobile" href="/index.html" style="text-decoration:none">
          <span class="logo-iq">IQ</span><span class="logo-prec">PREC</span>
        </a>
        <button class="lang-toggle" data-action="lang-toggle" type="button" aria-label="Toggle language">العربية</button>
      </header>

      <main class="content-body">
        <h1>${title}</h1>${mounts}
        <!-- ${slug} page content rendered by /js/${slug}.js -->
      </main>

${footer}
    </div>
  </div>

${scripts}
</body>`;
}

function slugToNavKey(slug) {
  const map = {
    'player-intel': 'playerIntel',
    'mini-league': 'miniLeague',
    'arab-stars': 'arabStars',
  };
  return map[slug] || slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function html(slug, title, isPublic, hasShell) {
  const body = hasShell ? shellBody(slug, title) : publicBody(slug, title);
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
${head(slug, title)}
</head>
${body}
</html>
`;
}

function pageCss(slug) {
  return `/* ============================================================
   IQPREC — ${slug}.css
   Page-specific styles for ${slug}.html. Tokens come from
   design-system.css; keep this file scoped to this page only.
   ============================================================ */

[data-page="${slug}"] .content-body {
  /* page-specific layout goes here */
}
`;
}

function pageJs(slug) {
  return `/* ============================================================
   IQPREC — ${slug}.js
   Page controller for ${slug}.html. Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations } from './i18n.js';

function init() {
  applyTranslations();
  // TODO(${slug}): fetch data via /js/api.js and render
  //   loading (skeleton) → success | error (retry) | empty states.
}

document.addEventListener('DOMContentLoaded', init);
`;
}

mkdirSync(resolve(PUB, 'css'), { recursive: true });
mkdirSync(resolve(PUB, 'js'), { recursive: true });

let count = 0;
for (const [slug, title, isPublic, hasShell] of PAGES) {
  writeFileSync(resolve(PUB, `${slug}.html`), html(slug, title, isPublic, hasShell));
  writeFileSync(resolve(PUB, 'css', `${slug}.css`), pageCss(slug));
  writeFileSync(resolve(PUB, 'js', `${slug}.js`), pageJs(slug));
  count++;
}

console.log(`Generated ${count} pages (HTML + CSS + JS).`);
