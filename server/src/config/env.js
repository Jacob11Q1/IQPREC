/* ============================================================
   IQPREC — config/env.js
   Validates ALL environment variables on startup with Zod.
   Fails fast (process.exit 1) if anything required is missing or
   malformed — no service should ever boot half-configured.
   (Pentagon L5: all secrets in .env, zero hardcoded values.)
   ============================================================ */

import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const bool = (def = 'false') =>
  z
    .string()
    .default(def)
    .transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  // ---- Core ----
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_URL: z.string().url(),

  // ---- Supabase ----
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // ---- JWT (RS256 — Pentagon L2) ----
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),

  // ---- Redis ----
  REDIS_URL: z.string().min(1),

  // ---- Anthropic ----
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-4-8'),

  // ---- Stripe ----
  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),
  STRIPE_PRICE_MONTHLY: z.string().min(1),
  STRIPE_PRICE_SEASON: z.string().min(1),

  // ---- Resend (email) ----
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM: z.string().min(1),

  // ---- Telegram bot ----
  TELEGRAM_BOT_TOKEN: z.string().min(1),

  // ---- Admin ----
  ADMIN_EMAIL: z.string().email(),
  ADMIN_IP_WHITELIST: z.string().default(''),
});

// In development we allow placeholders so the app can boot for
// frontend work before every secret exists. In production we are strict.
const isProd = process.env.NODE_ENV === 'production';

let parsed;
const result = envSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');

  if (isProd) {
    console.error(
      '\n✖ Invalid environment configuration:\n' + issues + '\n'
    );
    process.exit(1);
  } else {
    console.warn(
      '\n⚠ Environment not fully configured (development mode — continuing):\n' +
        issues +
        '\n  → Copy server/.env.example to server/.env and fill values.\n'
    );
    // Best-effort partial parse so dev can still serve static files.
    parsed = envSchema.partial().parse(process.env);
  }
} else {
  parsed = result.data;
}

export const env = parsed;

export const isProduction = parsed.NODE_ENV === 'production';
export const isDevelopment = parsed.NODE_ENV === 'development';

export default env;
