-- Opprett storage bucket for bilder og assets
-- Dette må kjøres i Supabase SQL Editor

-- Opprett 'assets' bucket hvis den ikke eksisterer
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO NOTHING;

-- Sett opp RLS policies for å tillate lesing og skriving
-- Dette oppretter policies kun hvis de ikke allerede eksisterer

-- Tillat alle å lese fra bucket (siden den er public)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Public Access'
  ) THEN
    CREATE POLICY "Public Access" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'assets');
  END IF;
END $$;

-- Tillat alle å laste opp (for development)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow upload to assets'
  ) THEN
    CREATE POLICY "Allow upload to assets" ON storage.objects
    FOR INSERT
    WITH CHECK (bucket_id = 'assets');
  END IF;
END $$;

-- Tillat alle å slette (for development)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Allow delete from assets'
  ) THEN
    CREATE POLICY "Allow delete from assets" ON storage.objects
    FOR DELETE
    USING (bucket_id = 'assets');
  END IF;
END $$;

