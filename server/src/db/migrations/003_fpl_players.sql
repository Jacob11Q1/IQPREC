-- ============================================================
-- IQPREC — Migration 003: fpl_players
-- Mirror of FPL bootstrap-static. ACTIVE PLAYERS ONLY: any player
-- not returned by a sync gets status='removed'. validatePlayers()
-- checks season=current AND status<>'removed' before every AI prompt.
-- ============================================================

CREATE TABLE fpl_players (
  id INTEGER PRIMARY KEY,
  web_name TEXT NOT NULL,
  first_name TEXT,
  second_name TEXT,
  team_id INTEGER,
  team_name TEXT,
  element_type INTEGER,
  now_cost INTEGER,
  form NUMERIC(4,1) DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  minutes INTEGER DEFAULT 0,
  goals_scored INTEGER DEFAULT 0,
  assists INTEGER DEFAULT 0,
  clean_sheets INTEGER DEFAULT 0,
  expected_goals NUMERIC(6,2) DEFAULT 0,
  expected_assists NUMERIC(6,2) DEFAULT 0,
  selected_by_percent NUMERIC(5,2) DEFAULT 0,
  status TEXT DEFAULT 'available',
  news TEXT,
  chance_of_playing INTEGER DEFAULT 100,
  photo TEXT,
  is_arab_player BOOLEAN NOT NULL DEFAULT false,
  season TEXT NOT NULL DEFAULT '2026-27',
  last_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fpl_players_season_status ON fpl_players (season, status);
CREATE INDEX idx_fpl_players_team_id ON fpl_players (team_id);
CREATE INDEX idx_fpl_players_is_arab ON fpl_players (is_arab_player) WHERE is_arab_player = true;
