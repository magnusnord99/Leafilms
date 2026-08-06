-- 132_harden_customer_contacts_admin_tasks_rls.sql
-- Forward repair for databases that already applied:
--   108_admin_tasks.sql        — open authenticated CRUD (USING/WITH CHECK true)
--   117_customer_contacts.sql  — "authenticated full access" FOR ALL true
--
-- Same class as 102/103/123/124/131 harden migrations. Trigger: any customer
-- JWT can PostgREST SELECT/INSERT/UPDATE/DELETE every customer_contact
-- (email/phone PII) and every internal admin_task row.
--
-- Numbered 132_ to avoid clash with open PR #37 (130_) and #41 (131_).
-- Idempotent — safe if 108/117 were already rewritten in source.

-- customer_contacts
DROP POLICY IF EXISTS "authenticated full access customer_contacts" ON customer_contacts;
DROP POLICY IF EXISTS "staff_all_customer_contacts" ON customer_contacts;

CREATE POLICY "staff_all_customer_contacts"
  ON customer_contacts FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- admin_tasks
DROP POLICY IF EXISTS "authenticated_read_admin_tasks"   ON admin_tasks;
DROP POLICY IF EXISTS "authenticated_insert_admin_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "authenticated_update_admin_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "authenticated_delete_admin_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "staff_read_admin_tasks"   ON admin_tasks;
DROP POLICY IF EXISTS "staff_insert_admin_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "staff_update_admin_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "staff_delete_admin_tasks" ON admin_tasks;

CREATE POLICY "staff_read_admin_tasks"
  ON admin_tasks FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_insert_admin_tasks"
  ON admin_tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_admin_tasks"
  ON admin_tasks FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_delete_admin_tasks"
  ON admin_tasks FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));
