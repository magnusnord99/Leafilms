-- Migration 144: Staff-only RLS on tasks, task_templates, and task_assignees
--
-- 040/047 granted full authenticated CRUD with USING/WITH CHECK (true).
-- A customer JWT (or any non-staff session) can therefore DELETE the entire
-- production pipeline, wipe assignees, or destroy the templates used to seed
-- future stages — via the public PostgREST API and the anon key that already
-- ships in the browser. Middleware only protects /admin pages, not supabase.co.
--
-- Customer-facing writes already use createServiceClient() after their own
-- token checks (contract sign seeds pre_prod tasks; selection submit marks
-- Selektering done). Staff UI uses the cookie client, so is_staff() still
-- allows admin/sales/production.
--
-- 143 is reserved by the open profile-role harden PR. Apply 144 against
-- Supabase after merge.

DROP POLICY IF EXISTS "authenticated_read_tasks"   ON tasks;
DROP POLICY IF EXISTS "authenticated_insert_tasks" ON tasks;
DROP POLICY IF EXISTS "authenticated_update_tasks" ON tasks;
DROP POLICY IF EXISTS "authenticated_delete_tasks" ON tasks;

CREATE POLICY "authenticated_read_tasks"
  ON tasks FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_insert_tasks"
  ON tasks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_update_tasks"
  ON tasks FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_delete_tasks"
  ON tasks FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "authenticated_read_task_templates"   ON task_templates;
DROP POLICY IF EXISTS "authenticated_insert_task_templates" ON task_templates;
DROP POLICY IF EXISTS "authenticated_update_task_templates" ON task_templates;
DROP POLICY IF EXISTS "authenticated_delete_task_templates" ON task_templates;

CREATE POLICY "authenticated_read_task_templates"
  ON task_templates FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_insert_task_templates"
  ON task_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_update_task_templates"
  ON task_templates FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_delete_task_templates"
  ON task_templates FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read task_assignees"   ON task_assignees;
DROP POLICY IF EXISTS "Authenticated users can insert task_assignees" ON task_assignees;
DROP POLICY IF EXISTS "Authenticated users can delete task_assignees" ON task_assignees;

CREATE POLICY "Authenticated users can read task_assignees"
  ON task_assignees FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Authenticated users can insert task_assignees"
  ON task_assignees FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "Authenticated users can delete task_assignees"
  ON task_assignees FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));
