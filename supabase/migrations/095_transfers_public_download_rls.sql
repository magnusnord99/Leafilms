-- 095_transfers_public_download_rls.sql
-- Bug: kundens nedlastingsside (/d/[token]) viser "Lenken er ikke tilgjengelig" for
-- ALLE lenker, uansett status. Årsak: transfers-tabellens SELECT-policy krever
-- auth.uid() is not null, så en ikke-innlogget kunde får aldri lest transfer-raden
-- via joinen fra transfer_links — selv om transfer_links selv har en åpen
-- anon-policy (USING (true), satt i 074_transfers.sql).
--
-- Fix følger samme sikkerhetsmodell som transfer_links allerede bruker: tilgang
-- er gatet av at man kjenner den ugjettelige 32-byte token'en (auth-laget i
-- appkoden i getTransferByToken sjekker expires_at/status/max_downloads), ikke av
-- innlogging. Denne policyen gir kun lesetilgang til transfers som har minst én
-- tilhørende lenke — like permissivt som transfer_links sin eksisterende policy,
-- introduserer ikke en ny eksponeringsklasse.

CREATE POLICY "Anon kan lese leveranse via gyldig lenke"
  ON transfers FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM transfer_links tl WHERE tl.transfer_id = transfers.id)
  );

-- Samme hull gjelder nedlastingstelleren (download_count), som recordDownload()
-- oppdaterer på vegne av kunden når filnedlastingen faktisk trigges.
CREATE POLICY "Anon kan oppdatere nedlastingsteller via gyldig lenke"
  ON transfers FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM transfer_links tl WHERE tl.transfer_id = transfers.id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM transfer_links tl WHERE tl.transfer_id = transfers.id)
  );
