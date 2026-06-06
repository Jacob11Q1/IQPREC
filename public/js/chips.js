/* ============================================================
   IQPREC — chips.js
   Page controller for chips.html. Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations } from './i18n.js';

function init() {
  applyTranslations();
  // TODO(chips): fetch data via /js/api.js and render
  //   loading (skeleton) → success | error (retry) | empty states.
}

document.addEventListener('DOMContentLoaded', init);
