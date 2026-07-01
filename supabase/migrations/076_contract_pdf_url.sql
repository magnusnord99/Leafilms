-- Legg til pdf_url-kolonne på contracts-tabellen
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Opprett public storage-bucket for signerte kontrakt-PDFer
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', true)
ON CONFLICT (id) DO NOTHING;

-- Kun service role kan laste opp filer
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Service role can insert contract PDFs'
  ) THEN
    EXECUTE 'CREATE POLICY "Service role can insert contract PDFs" ON storage.objects FOR INSERT TO service_role WITH CHECK (bucket_id = ''contracts'')';
  END IF;
END$$;

-- Alle kan lese (public bucket med UUID-baserte filnavn)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Public can read contract PDFs'
  ) THEN
    EXECUTE 'CREATE POLICY "Public can read contract PDFs" ON storage.objects FOR SELECT TO public USING (bucket_id = ''contracts'')';
  END IF;
END$$;
