-- ============================================================
-- IQPREC — Migration 004: fpl_fixtures
-- Mirror of FPL fixtures. home/away difficulty feeds FDR-based
-- captain & transfer rules. Public read for fixture UI.
-- ============================================================

CREATE TABLE fpl_fixtures (
  id INTEGER PRIMARY KEY,
  gameweek INTEGER,
  home_team_id INTEGER,
  away_team_id INTEGER,
  home_team_name TEXT,
  away_team_name TEXT,
  home_difficulty INTEGER,
  away_difficulty INTEGER,
  kickoff_time TIMESTAMPTZ,
  started BOOLEAN DEFAULT false,
  finished BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fpl_fixtures_gameweek ON fpl_fixtures (gameweek);
CREATE INDEX idx_fpl_fixtures_kickoff ON fpl_fixtures (kickoff_time);
