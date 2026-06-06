-- ============================================================
-- IQPREC — Row Level Security policies (Pentagon L5)
-- Run AFTER all migrations 001–012.
--
-- The backend connects with the Supabase SERVICE ROLE key, which
-- BYPASSES RLS — so the API still works. These policies are
-- defence-in-depth: if the anon/authenticated key is ever exposed
-- to a browser, a user can only ever touch their OWN rows, and
-- public-read tables expose nothing private.
--
-- auth.uid() returns the Supabase Auth user id. IQPREC issues its
-- own RS256 JWTs, so where auth.uid() is used the row id is matched
-- against the authenticated principal; service-role traffic is
-- unaffected. Public SELECT policies use `USING (true)`.
-- ============================================================

-- ---- Enable RLS on EVERY table ----
ALTER TABLE users                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE fpl_players                ENABLE ROW LEVEL SECURITY;
ALTER TABLE fpl_fixtures               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_squads                ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_recommendations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_cache                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_leagues          ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_standings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE gameweek_results           ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE competition_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tutorials             ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_me_messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_submissions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ultimate_milestone_tracker ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- users — SELECT and UPDATE own row only
-- ============================================================
CREATE POLICY users_select_own ON users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY users_update_own ON users
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ============================================================
-- refresh_tokens — own tokens only
-- ============================================================
CREATE POLICY refresh_tokens_own ON refresh_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- user_squads — own squads only
-- ============================================================
CREATE POLICY user_squads_own ON user_squads
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- ai_recommendations — own records only
-- ============================================================
CREATE POLICY ai_recs_own ON ai_recommendations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- ai_cache — NO direct user access (service role only).
-- RLS is enabled with NO policies => every anon/authenticated
-- request is denied. Service role bypasses RLS.
-- ============================================================
-- (intentionally no policy)

-- ============================================================
-- subscriptions — own subscription only
-- ============================================================
CREATE POLICY subscriptions_own ON subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================================
-- user_tutorials — own progress only
-- ============================================================
CREATE POLICY user_tutorials_own ON user_tutorials
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- ask_me_messages — own messages only
-- ============================================================
CREATE POLICY ask_me_own ON ask_me_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- gameweek_results — own records only
-- ============================================================
CREATE POLICY gameweek_results_own ON gameweek_results
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- competition_entries — own entries (write) + public SELECT (rank board)
-- ============================================================
CREATE POLICY comp_entries_public_read ON competition_entries
  FOR SELECT USING (true);
CREATE POLICY comp_entries_own_write ON competition_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY comp_entries_own_update ON competition_entries
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- referrals — referrer sees own referrals
-- ============================================================
CREATE POLICY referrals_own ON referrals
  FOR SELECT USING (auth.uid() = referrer_id);

-- ============================================================
-- feedback_submissions — own submissions + public SELECT (winners)
-- ============================================================
CREATE POLICY feedback_public_read ON feedback_submissions
  FOR SELECT USING (true);
CREATE POLICY feedback_own_write ON feedback_submissions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Public SELECT for all — FPL data + community + competitions
-- ============================================================
CREATE POLICY fpl_players_public_read ON fpl_players
  FOR SELECT USING (true);
CREATE POLICY fpl_fixtures_public_read ON fpl_fixtures
  FOR SELECT USING (true);
CREATE POLICY community_leagues_public_read ON community_leagues
  FOR SELECT USING (true);
CREATE POLICY community_standings_public_read ON community_standings
  FOR SELECT USING (true);
CREATE POLICY competitions_public_read ON competitions
  FOR SELECT USING (true);
CREATE POLICY milestone_public_read ON ultimate_milestone_tracker
  FOR SELECT USING (true);
