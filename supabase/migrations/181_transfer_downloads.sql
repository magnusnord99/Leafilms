-- 181_transfer_downloads.sql
-- Logger hvert enkelt nedlastingsforsøk på en leveranse (tidspunkt, enhet/nettleser,
-- IP), i stedet for kun den aggregerte transfers.download_count/last_downloaded_at
-- som fantes fra før. Gjør det mulig å se detaljer om hver nedlasting — f.eks. om
-- mottakeren faktisk fikk generert en nedlastingslenke, og fra hvilken type enhet
-- (relevant for "fikk ikke åpnet filen"-saker på mobil).

CREATE TABLE IF NOT EXISTS transfer_downloads (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id   UUID        NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  link_id       UUID        REFERENCES transfer_links(id) ON DELETE SET NULL,
  user_agent    TEXT,
  ip_address    TEXT,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_downloads_transfer ON transfer_downloads(transfer_id, downloaded_at DESC);

ALTER TABLE transfer_downloads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transfer_downloads' AND policyname = 'Admin kan lese nedlastingslogg'
  ) THEN
    EXECUTE 'CREATE POLICY "Admin kan lese nedlastingslogg" ON transfer_downloads FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transfer_downloads' AND policyname = 'Anon kan logge nedlasting via gyldig lenke'
  ) THEN
    EXECUTE $policy$CREATE POLICY "Anon kan logge nedlasting via gyldig lenke" ON transfer_downloads FOR INSERT TO anon, authenticated WITH CHECK (
      EXISTS (SELECT 1 FROM transfer_links tl WHERE tl.transfer_id = transfer_downloads.transfer_id)
    )$policy$;
  END IF;
END$$;
