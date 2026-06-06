-- Harden internal AI-analysis and project-chat tables to admin users only.
-- These tables may contain sales leads, generated outreach, and internal project discussion.

ALTER TABLE public.market_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read market analyses" ON public.market_analyses;
DROP POLICY IF EXISTS "Service role can insert/update" ON public.market_analyses;
DROP POLICY IF EXISTS "Service role can manage market analyses" ON public.market_analyses;

CREATE POLICY "Admins can read market analyses"
  ON public.market_analyses FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Service role can manage market analyses"
  ON public.market_analyses FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read messages" ON public.project_messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON public.project_messages;
DROP POLICY IF EXISTS "Admins can read project messages" ON public.project_messages;
DROP POLICY IF EXISTS "Admins can insert own project messages" ON public.project_messages;

CREATE POLICY "Admins can read project messages"
  ON public.project_messages FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert own project messages"
  ON public.project_messages FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND auth.uid() = user_id);
