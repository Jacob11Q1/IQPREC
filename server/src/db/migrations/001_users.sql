-- ============================================================
-- IQPREC — Migration 001: users
-- Core account table. subscription_status drives access gating;
-- trial_ends_at is set 7 days out by default (CLAUDE.md: 7-day trial).
-- ============================================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  fpl_team_id INTEGER,
  fpl_team_name TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'trial'
    CHECK (subscription_status IN ('trial','active','expired')),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  plan TEXT DEFAULT 'monthly' CHECK (plan IN ('monthly','season')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan_expires_at TIMESTAMPTZ,
  referral_code TEXT UNIQUE,
  referred_by UUID REFERENCES users(id),
  language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar','en')),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  email_verify_token TEXT,
  email_verify_expires TIMESTAMPTZ,
  reset_token TEXT,
  reset_token_expires TIMESTAMPTZ,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_referral_code ON users (referral_code);
CREATE INDEX idx_users_referred_by ON users (referred_by);
CREATE INDEX idx_users_subscription_status ON users (subscription_status);
