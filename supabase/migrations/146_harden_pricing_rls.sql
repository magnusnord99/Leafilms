-- Migration 146: Staff-only RLS on price_catalog, discount_factors, and
-- contract_templates.
--
-- 035 granted full authenticated CRUD on price_catalog with
-- USING/WITH CHECK (true). 057 granted the same on discount_factors
-- (SELECT + FOR ALL). 054 granted FOR ALL on contract_templates.
-- A customer JWT (or any non-staff session) can therefore:
--   - SELECT/UPDATE/DELETE price_catalog → dump or wipe list prices
--     (and CASCADE-delete equipment_group_items that point at them)
--   - UPDATE/DELETE discount_factors → corrupt volume discounts on
--     every new quote
--   - UPDATE contract_templates → replace the legal text used for
--     every subsequently generated contract
-- via the public PostgREST API and the anon key that already ships in
-- the browser. Middleware only protects /admin pages, not supabase.co.
--
-- Public quote/contract pages already persist quote_data / contract_text
-- and do not read these tables. Staff UI (/admin/prices, quote builder,
-- contract actions) uses the cookie client, so is_staff() still allows
-- admin/sales/production.
--
-- 143 is reserved by the open profile-role harden PR.
-- 144 is reserved by the open tasks RLS harden PR.
-- 145 is reserved by the open leads RLS harden PR.
-- Apply 146 against Supabase after merge.

DROP POLICY IF EXISTS "authenticated_read_price_catalog"   ON price_catalog;
DROP POLICY IF EXISTS "authenticated_insert_price_catalog" ON price_catalog;
DROP POLICY IF EXISTS "authenticated_update_price_catalog" ON price_catalog;
DROP POLICY IF EXISTS "authenticated_delete_price_catalog" ON price_catalog;

CREATE POLICY "authenticated_read_price_catalog"
  ON price_catalog FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_insert_price_catalog"
  ON price_catalog FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_update_price_catalog"
  ON price_catalog FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_delete_price_catalog"
  ON price_catalog FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read discount_factors"    ON discount_factors;
DROP POLICY IF EXISTS "Authenticated can modify discount_factors" ON discount_factors;

CREATE POLICY "Authenticated can read discount_factors"
  ON discount_factors FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Authenticated can modify discount_factors"
  ON discount_factors FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Auth users manage templates" ON contract_templates;

CREATE POLICY "Auth users manage templates"
  ON contract_templates FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
