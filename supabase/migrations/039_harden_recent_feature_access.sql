-- Harden access for recent chat and market-analysis features.
-- These objects hold internal project discussions and lead data and must stay admin-only.

ALTER TABLE project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read messages" ON project_messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON project_messages;
DROP POLICY IF EXISTS "Admins can read messages" ON project_messages;
DROP POLICY IF EXISTS "Admins can insert own messages" ON project_messages;

CREATE POLICY "Admins can read messages"
  ON project_messages FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin(auth.uid())));

CREATE POLICY "Admins can insert own messages"
  ON project_messages FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "Admins can read market analyses" ON market_analyses;
DROP POLICY IF EXISTS "Service role can insert/update" ON market_analyses;

CREATE POLICY "Admins can read market analyses"
  ON market_analyses FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin(auth.uid())));

CREATE POLICY "Service role can insert/update"
  ON market_analyses FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
