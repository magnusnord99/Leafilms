-- Migration 147: Staff-only RLS on project/task/quote chat and pitch/quote reviews
--
-- 036/045/080 granted any authenticated session SELECT on internal chats
-- (quote_messages/task_messages USING true; project_messages via
-- auth.role() = 'authenticated') and INSERT as self. 088 granted SELECT on
-- reviews to every JWT and INSERT as requested_by.
--
-- Concrete trigger: authenticate as a customer profile (or any non-staff JWT),
-- then call Supabase REST with the public anon key:
--   SELECT quote_messages / task_messages / project_messages
--     → dump every internal pricing/post-prod/project chat
--   INSERT into those tables as yourself (any quote_id / task_id / project_id)
--     → message appears in the staff UI; SECURITY DEFINER notify_* triggers
--       fan out notifications (and @mentions) to assignees
--   INSERT reviews {status:'approved', requested_by:self, reviewer_id:self}
--     → getLatestReview() (created_at DESC) treats it as the publish gate in
--       hooks/project/usePublishing.ts, so a pending colleague review is
--       skipped — or a later 'changes_requested' row blocks a real approval
--
-- Middleware only protects /admin pages, not *.supabase.co/rest/v1. Staff UI
-- uses the cookie client; is_staff() still allows admin/sales/production.
-- Write policies keep auth.uid() = user_id / requested_by / reviewer_id so
-- staff cannot spoof another sender.
--
-- 143–146 are reserved by open harden PRs (#49 profile role, #51 tasks,
-- #52 leads, #53 pricing). Apply 147 against Supabase after merge.

DROP POLICY IF EXISTS "Authenticated users can read messages" ON project_messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON project_messages;

CREATE POLICY "Authenticated users can read messages"
  ON project_messages FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Users can insert own messages"
  ON project_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_staff(auth.uid())
  );

DROP POLICY IF EXISTS "authenticated_read_task_messages"   ON task_messages;
DROP POLICY IF EXISTS "authenticated_insert_task_messages" ON task_messages;
DROP POLICY IF EXISTS "authenticated_update_task_messages" ON task_messages;
DROP POLICY IF EXISTS "authenticated_delete_task_messages" ON task_messages;

CREATE POLICY "authenticated_read_task_messages"
  ON task_messages FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_insert_task_messages"
  ON task_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_staff(auth.uid())
  );

CREATE POLICY "authenticated_update_task_messages"
  ON task_messages FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_staff(auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_staff(auth.uid())
  );

CREATE POLICY "authenticated_delete_task_messages"
  ON task_messages FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_staff(auth.uid())
  );

DROP POLICY IF EXISTS "authed_read_quote_messages" ON quote_messages;
DROP POLICY IF EXISTS "authed_insert_quote_messages" ON quote_messages;

CREATE POLICY "authed_read_quote_messages"
  ON quote_messages FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "authed_insert_quote_messages"
  ON quote_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_staff(auth.uid())
  );

DROP POLICY IF EXISTS "authed_read_reviews" ON reviews;
DROP POLICY IF EXISTS "authed_insert_reviews" ON reviews;
DROP POLICY IF EXISTS "authed_update_reviews" ON reviews;

CREATE POLICY "authed_read_reviews"
  ON reviews FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "authed_insert_reviews"
  ON reviews FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = requested_by
    AND public.is_staff(auth.uid())
  );

CREATE POLICY "authed_update_reviews"
  ON reviews FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = reviewer_id
    AND public.is_staff(auth.uid())
  )
  WITH CHECK (
    auth.uid() = reviewer_id
    AND public.is_staff(auth.uid())
  );
