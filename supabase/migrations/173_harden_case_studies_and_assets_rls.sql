-- 173_harden_case_studies_and_assets_rls.sql
--
-- case_studies (019_enable_rls_all_tables.sql) og storage.objects for
-- "assets"-bucketen (087_tighten_public_rls.sql) har i dag
-- `TO authenticated USING (true)`-policyer for INSERT/UPDATE/DELETE —
-- enhver innlogget bruker, ikke bare staff. profiles.role = 'customer' er en
-- reell, ekskludert-fra-is_staff()-rolle som logger inn via ordentlig
-- Supabase Auth (app/login/page.tsx) for sin prosjektportal, og kan derfor i
-- dag redigere/slette en hvilken som helst case study, eller slette/
-- overskrive en hvilken som helst fil i assets-bucketen, direkte via
-- Supabase-klienten — forbi appens UI. Dette var ikke dekket av
-- 152-156-hardeningen.
--
-- Fikses nå fordi de nye admin-redigerbare bransje-landingssidene (174)
-- leser fra begge disse — uten denne fiksen kunne en kundekonto redigere
-- case-teksten eller slette hero-bildet på en publisert, offentlig side.
--
-- Verifisert før kjøring: ingen kundevendt rute (app/p/, app/s/, app/v/,
-- app/b/, app/d/) skriver til case_studies eller laster opp/sletter i
-- assets-bucketen — alle eksisterende skrivere går via innloggede
-- staff-sider i adminpanelet (/admin/cases/*, /admin/images/*).

DROP POLICY IF EXISTS "authenticated_insert_case_studies" ON case_studies;
DROP POLICY IF EXISTS "authenticated_update_case_studies" ON case_studies;
DROP POLICY IF EXISTS "authenticated_delete_case_studies" ON case_studies;

CREATE POLICY "staff_insert_case_studies" ON case_studies
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_case_studies" ON case_studies
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_delete_case_studies" ON case_studies
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Allow upload to assets" ON storage.objects;
CREATE POLICY "Allow upload to assets" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'assets' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Allow delete from assets" ON storage.objects;
CREATE POLICY "Allow delete from assets" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'assets' AND public.is_staff(auth.uid()));
