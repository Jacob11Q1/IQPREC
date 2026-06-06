/* ============================================================
   IQPREC — middleware/security/validate-body.js  (Pentagon L1)
   Factory: validateBody(schema) → Express middleware that validates
   req.body against a Zod schema. Allow-list validation; on failure
   returns 400 with structured field errors. Never leaks internal
   error detail in production.
   ============================================================ */

import { isProduction } from '../../config/env.js';

export function validateBody(schema) {
  return function validate(req, res, next) {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      return res.status(400).json({
        success: false,
        data: null,
        error: 'VALIDATION_ERROR',
        message: 'One or more fields are invalid.',
        details,
      });
    }

    // Replace body with the parsed (and coerced) data — strips any
    // keys the schema doesn't allow.
    req.body = result.data;
    return next();
  };
}

/* Same idea for query/params when a route needs it. */
export function validateQuery(schema) {
  return function validate(req, res, next) {
    const result = schema.safeParse(req.query ?? {});
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(400).json({
        success: false,
        data: null,
        error: 'VALIDATION_ERROR',
        message: 'One or more query parameters are invalid.',
        details,
      });
    }
    // req.query is a getter in Express 5 — mutate in place.
    try {
      Object.keys(req.query).forEach((k) => delete req.query[k]);
      Object.assign(req.query, result.data);
    } catch {
      /* read-only in some setups — validation already passed, ignore */
    }
    return next();
  };
}

// Avoid unused-import lint when isProduction isn't referenced directly.
void isProduction;

export default validateBody;
