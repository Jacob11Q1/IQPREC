/* ============================================================
   IQPREC — terms.js
   Page controller for terms.html. Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations } from './i18n.js';

function init() {
  applyTranslations();
  // TODO(terms): fetch data via /js/api.js and render
  //   loading (skeleton) → success | error (retry) | empty states.
}

document.addEventListener('DOMContentLoaded', init);
