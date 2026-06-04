-- Migration 039: Harden RLS for internal chat and market analysis tables

ALTER TABLE project_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read messages" ON project_messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON project_messages;
DROP POLICY IF EXISTS "Admins can read project messages" ON project_messages;
DROP POLICY IF EXISTS "Admins can insert project messages" ON project_messages;

CREATE POLICY "Admins can read project messages"
  ON project_messages FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert project messages"
  ON project_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can read market analyses" ON market_analyses;
DROP POLICY IF EXISTS "Service role can insert/update" ON market_analyses;

CREATE POLICY "Admins can read market analyses"
  ON market_analyses FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Service role can insert/update"
  ON market_analyses FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
