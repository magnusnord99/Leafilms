-- Migration 039: Harden RLS for internal feature tables
-- Customer accounts can authenticate, so internal admin-only data must not rely
-- on broad auth.role() = 'authenticated' policies.

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

CREATE POLICY "Admins can read market analyses"
  ON market_analyses FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));
