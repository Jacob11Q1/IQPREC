-- ============================================================
-- IQPREC — Migration 010: competitions + competition_entries
-- Competitions open automatically on milestone triggers. Entry needs
-- 5 verified referrals. Prizes: 1st $500 / 2nd $300 / 3rd $200.
-- ============================================================

CREATE TABLE competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  milestone_target INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming'
    CHECK (status IN ('upcoming','active','closed')),
  prize_1st NUMERIC(10,2) DEFAULT 500,
  prize_2nd NUMERIC(10,2) DEFAULT 300,
  prize_3rd NUMERIC(10,2) DEFAULT 200,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_competitions_status ON competitions (status);

CREATE TABLE competition_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_count INTEGER DEFAULT 0,
  fpl_points INTEGER DEFAULT 0,
  rank INTEGER,
  prize_won NUMERIC(10,2),
  paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(competition_id, user_id)
);

CREATE INDEX idx_comp_entries_competition_id ON competition_entries (competition_id);
CREATE INDEX idx_comp_entries_user_id ON competition_entries (user_id);
