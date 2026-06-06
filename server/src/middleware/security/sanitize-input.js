/* ============================================================
   IQPREC — middleware/security/sanitize-input.js  (Pentagon L1/L6)
   Global input hardening applied to req.body, req.query, req.params:
     • strip all HTML tags          (XSS surface reduction)
     • remove null bytes            (\0 — protocol/parser injection)
     • normalize Unicode to NFC     (homoglyph / canonicalisation)
     • trim surrounding whitespace
   Mutates structures in place (Express 5 query/params are getters).
   ============================================================ */

const HTML_TAG = /<[^>]*>/g;
const NULL_BYTE = /\0/g;

function cleanString(value) {
  return value
    .replace(NULL_BYTE, '')
    .replace(HTML_TAG, '')
    .normalize('NFC')
    .trim();
}

/* Recursively sanitise an object/array in place. Returns the same
   reference so callers can reassign primitives if needed. */
function sanitizeInPlace(node) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const v = node[i];
      if (typeof v === 'string') node[i] = cleanString(v);
      else if (v && typeof v === 'object') sanitizeInPlace(v);
    }
    return node;
  }

  if (node && typeof node === 'object') {
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (typeof v === 'string') node[key] = cleanString(v);
      else if (v && typeof v === 'object') sanitizeInPlace(v);
    }
  }
  return node;
}

export function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') sanitizeInPlace(req.body);

  // req.query / req.params may be read-only getters in Express 5 —
  // mutate the held object's keys instead of reassigning.
  try {
    if (req.query && typeof req.query === 'object') sanitizeInPlace(req.query);
  } catch {
    /* ignore — query already parsed */
  }
  try {
    if (req.params && typeof req.params === 'object') {
      sanitizeInPlace(req.params);
    }
  } catch {
    /* ignore */
  }

  next();
}

export { cleanString };
export default sanitizeInput;
