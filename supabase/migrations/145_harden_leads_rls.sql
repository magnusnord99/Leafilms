-- Migration 145: Staff-only RLS on leads and email_log
--
-- 040 granted full authenticated CRUD with USING/WITH CHECK (true).
-- A customer JWT (or any non-staff session) can therefore SELECT every
-- lead (name, email, phone, sales notes) and DELETE the entire CRM, or
-- read/wipe the outbound email archive (to_email, subject, body_html) —
-- via the public PostgREST API and the anon key that already ships in
-- the browser. Middleware only protects /admin pages, not supabase.co.
--
-- Deleting a lead also cascades assignment notifications
-- (061: notifications.lead_id ON DELETE CASCADE).
--
-- Cron market-analysis already writes leads with createServiceClient().
-- /api/send-email already inserts email_log with createServiceClient().
-- Staff UI uses the cookie client, so is_staff() still allows
-- admin/sales/production.
--
-- 143 is reserved by the open profile-role harden PR.
-- 144 is reserved by the open tasks RLS harden PR.
-- Apply 145 against Supabase after merge.

DROP POLICY IF EXISTS "authenticated_read_leads"   ON leads;
DROP POLICY IF EXISTS "authenticated_insert_leads" ON leads;
DROP POLICY IF EXISTS "authenticated_update_leads" ON leads;
DROP POLICY IF EXISTS "authenticated_delete_leads" ON leads;

CREATE POLICY "authenticated_read_leads"
  ON leads FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_insert_leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_update_leads"
  ON leads FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_delete_leads"
  ON leads FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "authenticated_read_email_log"   ON email_log;
DROP POLICY IF EXISTS "authenticated_insert_email_log" ON email_log;
DROP POLICY IF EXISTS "authenticated_update_email_log" ON email_log;
DROP POLICY IF EXISTS "authenticated_delete_email_log" ON email_log;

CREATE POLICY "authenticated_read_email_log"
  ON email_log FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_insert_email_log"
  ON email_log FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_update_email_log"
  ON email_log FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_delete_email_log"
  ON email_log FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));
