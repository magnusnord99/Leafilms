-- Legg til pdf_url-kolonne på contracts-tabellen
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Opprett public storage-bucket for signerte kontrakt-PDFer
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', true)
ON CONFLICT (id) DO NOTHING;

-- Kun service role kan laste opp filer
CREATE POLICY "Service role can insert contract PDFs"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'contracts');

-- Alle kan lese (public bucket med UUID-baserte filnavn)
CREATE POLICY "Public can read contract PDFs"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'contracts');
