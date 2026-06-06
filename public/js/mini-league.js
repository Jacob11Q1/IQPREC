/* ============================================================
   IQPREC — mini-league.js
   Page controller for mini-league.html. Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations } from './i18n.js';

function init() {
  applyTranslations();
  // TODO(mini-league): fetch data via /js/api.js and render
  //   loading (skeleton) → success | error (retry) | empty states.
}

document.addEventListener('DOMContentLoaded', init);
