-- 087_tighten_public_rls.sql
-- Fjerner anon-RLS-tilgang som lot hvem som helst med anon-nøkkelen lese/skrive
-- prosjektdata direkte via Supabase-klienten, uten å gå via appens egne
-- token-verifiserte API-ruter/server-komponenter.
--
-- All offentlig lesing/skriving (pitch-side, tilbud, kontraktsignering, analytics)
-- går nå via server-kode som verifiserer prosjekt_shares.token eksplisitt og
-- deretter bruker service-role-klienten (se app/p/[token]/page.tsx,
-- app/api/quotes/current, app/api/accept-quote, app/api/contracts/sign,
-- app/api/analytics/track, app/api/analytics/quote/track). Anon trenger derfor
-- ikke lenger direkte RLS-tilgang til disse tabellene.
--
-- Authenticated-policyene (interne Leafilms-ansatte, admin-appen) er UENDRET.

-- ── project_shares ──────────────────────────────────────────────────────────
-- Lot hvem som helst liste/lese ALLE delelenker (token → prosjekt-mapping).
DROP POLICY IF EXISTS "public_read_project_shares" ON project_shares;

-- ── contracts ────────────────────────────────────────────────────────────────
-- Lot hvem som helst lese alle publiserte kontrakter (inkl. signaturdata: navn,
-- e-post, IP, signaturbilde) uten prosjekt-scoping, og opprette nye rader fritt.
DROP POLICY IF EXISTS "Public can read published contracts" ON contracts;
DROP POLICY IF EXISTS "Public can sign contracts" ON contracts;

-- ── quotes ───────────────────────────────────────────────────────────────────
-- Lot hvem som helst lese tilbudspriser for et vilkårlig publisert prosjekt-id.
-- QuoteSection henter nå via /api/quotes/current (token-verifisert).
DROP POLICY IF EXISTS "public_read_quotes_for_published_projects" ON quotes;

-- ── project_analytics / quote_analytics ─────────────────────────────────────
-- USING (true) ga full lese-/skrivetilgang på tvers av prosjekter direkte via
-- klienten, forbi appens egen token-sjekk i API-laget.
DROP POLICY IF EXISTS "public_read_project_analytics" ON project_analytics;
DROP POLICY IF EXISTS "public_write_project_analytics" ON project_analytics;
DROP POLICY IF EXISTS "public_update_project_analytics" ON project_analytics;

DROP POLICY IF EXISTS "public_read_quote_analytics" ON quote_analytics;
DROP POLICY IF EXISTS "public_write_quote_analytics" ON quote_analytics;
DROP POLICY IF EXISTS "public_update_quote_analytics" ON quote_analytics;

-- ── storage.objects (assets-bucket) ─────────────────────────────────────────
-- "Allow upload/delete to assets" hadde ingen TO-klausul (gjaldt alle roller,
-- inkl. anon) — kunne overskrive/slette hva som helst i bucketen, f.eks. et
-- annet prosjekts lagrede tilbuds-PDF. Offentlig LESING (nedlasting av bilder,
-- PDF-er kunden faktisk skal se) er fortsatt tillatt via "Public Access".
DROP POLICY IF EXISTS "Allow upload to assets" ON storage.objects;
CREATE POLICY "Allow upload to assets" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'assets');

DROP POLICY IF EXISTS "Allow delete from assets" ON storage.objects;
CREATE POLICY "Allow delete from assets" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'assets');
