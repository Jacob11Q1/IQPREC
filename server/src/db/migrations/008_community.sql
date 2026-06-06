-- ============================================================
-- IQPREC — Migration 008: community_leagues + community_standings
-- Public-read tables that power the landing leaderboard and the
-- Falcon League / Palestine community sections.
-- ============================================================

CREATE TABLE community_leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  region TEXT,
  fpl_league_id INTEGER,
  season TEXT DEFAULT '2026-27',
  join_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE community_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES community_leagues(id),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fpl_team_name TEXT,
  rank INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  gameweek_points INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_standings_league_id ON community_standings (league_id);
CREATE INDEX idx_standings_user_id ON community_standings (user_id);
CREATE INDEX idx_standings_league_rank ON community_standings (league_id, rank);
