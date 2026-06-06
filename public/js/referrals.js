/* ============================================================
   IQPREC — referrals.js
   Page controller for referrals.html. Loads after auth, i18n, layout.
   ============================================================ */

import { applyTranslations } from './i18n.js';

function init() {
  applyTranslations();
  // TODO(referrals): fetch data via /js/api.js and render
  //   loading (skeleton) → success | error (retry) | empty states.
}

document.addEventListener('DOMContentLoaded', init);
