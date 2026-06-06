/* ============================================================
   IQPREC — ask-me.js
   Page controller for ask-me.html. Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations } from './i18n.js';

function init() {
  applyTranslations();
  // TODO(ask-me): fetch data via /js/api.js and render
  //   loading (skeleton) → success | error (retry) | empty states.
}

document.addEventListener('DOMContentLoaded', init);
