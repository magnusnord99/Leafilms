-- Tillat anon-brukere å lese publiserte kontrakter (for pitch-siden)
-- Uten denne policyene får createPublicClient() null tilbake og signeringsseksjonen vises ikke.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contracts' AND policyname = 'Public can read published contracts'
  ) THEN
    EXECUTE 'CREATE POLICY "Public can read published contracts" ON contracts FOR SELECT TO anon USING (published_at IS NOT NULL)';
  END IF;
END$$;
