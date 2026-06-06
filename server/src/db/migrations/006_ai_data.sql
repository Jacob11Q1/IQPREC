-- ============================================================
-- IQPREC — Migration 006: ai_recommendations + ai_cache
-- ai_recommendations: per-user audit log of every AI output (tokens,
--   latency, cache hit) — feeds the feedback loop / What-If Analyzer.
-- ai_cache: shared response cache keyed by cache_key (no user access).
-- ============================================================

CREATE TABLE ai_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  gameweek INTEGER,
  language TEXT DEFAULT 'ar',
  output_text TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  cached BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_recs_user_id ON ai_recommendations (user_id);
CREATE INDEX idx_ai_recs_type ON ai_recommendations (type);
CREATE INDEX idx_ai_recs_created_at ON ai_recommendations (created_at);

CREATE TABLE ai_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  response_text TEXT NOT NULL,
  type TEXT,
  gameweek INTEGER,
  language TEXT DEFAULT 'ar',
  expires_at TIMESTAMPTZ NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_cache_cache_key ON ai_cache (cache_key);
CREATE INDEX idx_ai_cache_expires_at ON ai_cache (expires_at);
