-- ============================================================
-- IQPREC — Migration 011: referrals
-- One row per referred user (UNIQUE referred_id => no double counting).
-- referrer must refer 5+ converted signups to enter competitions.
-- ============================================================

CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  converted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(referred_id)
);

CREATE INDEX idx_referrals_referrer_id ON referrals (referrer_id);
