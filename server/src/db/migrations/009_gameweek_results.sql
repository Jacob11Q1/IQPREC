-- ============================================================
-- IQPREC — Migration 009: gameweek_results
-- Feedback loop: actual points vs AI-recommended points per GW.
-- Powers the What-If Analyzer (prove IQPREC value over time).
-- ============================================================

CREATE TABLE gameweek_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gameweek INTEGER NOT NULL,
  actual_points INTEGER DEFAULT 0,
  ai_lineup_points INTEGER DEFAULT 0,
  actual_captain_id INTEGER,
  ai_captain_id INTEGER,
  points_difference INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, gameweek)
);

CREATE INDEX idx_gw_results_user_id ON gameweek_results (user_id);
