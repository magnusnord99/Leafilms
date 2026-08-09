-- 135_harden_quotes_contracts_projects_rls.sql
-- Forward-fix for databases that already applied 019 with open
-- authenticated CRUD on `quotes`, `contracts`, and `projects`
-- (USING/WITH CHECK (true)).
--
-- Any customer (or other non-staff) JWT could previously enumerate, mutate,
-- or delete every quote/contract/project row via PostgREST — including
-- quote_data pricing, contract signature PII, and the full pipeline.
-- Public pitch / accept-quote / contract-sign routes already authorize via
-- share token + createServiceClient() (see 087_tighten_public_rls.sql).
--
-- Numbered 135_ to avoid clash with open PR #37 (130_), #41 (131_),
-- #42 (132_), #43 (133_), #44 (134_).

-- ── quotes ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read_quotes" ON quotes;
DROP POLICY IF EXISTS "authenticated_insert_quotes" ON quotes;
DROP POLICY IF EXISTS "authenticated_update_quotes" ON quotes;
DROP POLICY IF EXISTS "authenticated_delete_quotes" ON quotes;
DROP POLICY IF EXISTS "staff_read_quotes" ON quotes;
DROP POLICY IF EXISTS "staff_insert_quotes" ON quotes;
DROP POLICY IF EXISTS "staff_update_quotes" ON quotes;
DROP POLICY IF EXISTS "staff_delete_quotes" ON quotes;

CREATE POLICY "staff_read_quotes"
  ON quotes FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff_insert_quotes"
  ON quotes FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff_update_quotes"
  ON quotes FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff_delete_quotes"
  ON quotes FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- ── contracts ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read_contracts" ON contracts;
DROP POLICY IF EXISTS "authenticated_insert_contracts" ON contracts;
DROP POLICY IF EXISTS "authenticated_update_contracts" ON contracts;
DROP POLICY IF EXISTS "authenticated_delete_contracts" ON contracts;
DROP POLICY IF EXISTS "staff_read_contracts" ON contracts;
DROP POLICY IF EXISTS "staff_insert_contracts" ON contracts;
DROP POLICY IF EXISTS "staff_update_contracts" ON contracts;
DROP POLICY IF EXISTS "staff_delete_contracts" ON contracts;

CREATE POLICY "staff_read_contracts"
  ON contracts FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff_insert_contracts"
  ON contracts FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff_update_contracts"
  ON contracts FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff_delete_contracts"
  ON contracts FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- ── projects ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "authenticated_read_projects" ON projects;
DROP POLICY IF EXISTS "authenticated_insert_projects" ON projects;
DROP POLICY IF EXISTS "authenticated_update_projects" ON projects;
DROP POLICY IF EXISTS "authenticated_delete_projects" ON projects;
DROP POLICY IF EXISTS "staff_read_projects" ON projects;
DROP POLICY IF EXISTS "staff_insert_projects" ON projects;
DROP POLICY IF EXISTS "staff_update_projects" ON projects;
DROP POLICY IF EXISTS "staff_delete_projects" ON projects;

CREATE POLICY "staff_read_projects"
  ON projects FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff_insert_projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff_update_projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff_delete_projects"
  ON projects FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));
