-- ============================================================
-- IQPREC — Migration 005: user_squads
-- One row per user per gameweek. picks is JSONB (the 15 element ids
-- plus captain/vice/bench order). One squad per (user, gameweek).
-- ============================================================

CREATE TABLE user_squads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gameweek INTEGER NOT NULL,
  picks JSONB NOT NULL DEFAULT '[]',
  bank NUMERIC(6,1) DEFAULT 0,
  team_value NUMERIC(6,1) DEFAULT 0,
  transfers_available INTEGER DEFAULT 1,
  points INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, gameweek)
);

CREATE INDEX idx_user_squads_user_id ON user_squads (user_id);
