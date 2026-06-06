-- ============================================================
-- IQPREC — Migration 007: subscriptions
-- One row per billing event. stripe_event_id is UNIQUE for webhook
-- idempotency (Pentagon L5: never double-process a Stripe event).
-- ============================================================

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT,
  stripe_event_id TEXT UNIQUE,
  plan TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  status TEXT NOT NULL,
  amount_paid NUMERIC(10,2),
  currency TEXT DEFAULT 'usd',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  payment_provider TEXT DEFAULT 'stripe',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions (user_id);
CREATE INDEX idx_subscriptions_stripe_sub ON subscriptions (stripe_subscription_id);
