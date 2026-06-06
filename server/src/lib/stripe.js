/* ============================================================
   IQPREC — lib/stripe.js
   Single Stripe client. Initialised only when STRIPE_SECRET_KEY is set
   so the server still boots in dev without billing configured. Callers
   guard with hasStripe() and fail gracefully (503) when it's null.
   ============================================================ */

import Stripe from 'stripe';
import { env } from '../config/env.js';

let stripe = null;

if (env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
    appInfo: { name: 'IQPREC', url: 'https://iqprec.com' },
  });
} else {
  console.warn('[stripe] STRIPE_SECRET_KEY not set — billing disabled.');
}

export function hasStripe() {
  return stripe !== null;
}

export { stripe };
export default stripe;
