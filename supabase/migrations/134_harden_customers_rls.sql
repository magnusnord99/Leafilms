-- 134_harden_customers_rls.sql
-- Forward-fix for databases that already applied 019 with open
-- authenticated CRUD on `customers` (USING/WITH CHECK (true)).
--
-- Any customer (or other non-staff) JWT could previously enumerate or delete
-- every CRM row via PostgREST, including email/phone/address/org_nummer and
-- invoice fields. Public quote/contract routes already authorize via share
-- token + createServiceClient(); admin UI is staff-only.
--
-- Numbered 134_ to avoid clash with open PR #37 (130_), #41 (131_),
-- #42 (132_), #43 (133_).

DROP POLICY IF EXISTS "authenticated_read_customers" ON customers;
DROP POLICY IF EXISTS "authenticated_insert_customers" ON customers;
DROP POLICY IF EXISTS "authenticated_update_customers" ON customers;
DROP POLICY IF EXISTS "authenticated_delete_customers" ON customers;
DROP POLICY IF EXISTS "staff_read_customers" ON customers;
DROP POLICY IF EXISTS "staff_insert_customers" ON customers;
DROP POLICY IF EXISTS "staff_update_customers" ON customers;
DROP POLICY IF EXISTS "staff_delete_customers" ON customers;

CREATE POLICY "staff_read_customers"
  ON customers FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff_insert_customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff_update_customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff_delete_customers"
  ON customers FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));
