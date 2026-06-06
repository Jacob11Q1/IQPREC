-- ============================================================
-- IQPREC — Migration 012: support & misc
-- user_tutorials, ask_me_messages, feedback_submissions, receipts,
-- ultimate_milestone_tracker (single source of truth for milestones).
-- ============================================================

CREATE TABLE user_tutorials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_steps JSONB DEFAULT '[]',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ask_me_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  response TEXT,
  responded_by TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX idx_ask_me_user_id ON ask_me_messages (user_id);

CREATE TABLE feedback_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  status TEXT DEFAULT 'pending',
  prize_won NUMERIC(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_user_id ON feedback_submissions (user_id);

CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receipt_number TEXT UNIQUE NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT DEFAULT 'usd',
  plan TEXT NOT NULL,
  billing_cycle TEXT,
  payment_provider TEXT DEFAULT 'stripe',
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_receipts_user_id ON receipts (user_id);

CREATE TABLE ultimate_milestone_tracker (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season TEXT UNIQUE NOT NULL DEFAULT '2026-27',
  current_users INTEGER NOT NULL DEFAULT 0,
  next_milestone INTEGER NOT NULL DEFAULT 20,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single tracker row for the current season.
INSERT INTO ultimate_milestone_tracker (season, current_users, next_milestone)
VALUES ('2026-27', 0, 20)
ON CONFLICT (season) DO NOTHING;
