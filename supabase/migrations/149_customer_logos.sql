-- 149_customer_logos.sql
-- Kundelogoer: én hovedlogo (brukes på leveransesider, pitcher, osv.) pluss en
-- logo-pakke (flere filvarianter — brukes ofte ved redigering/compositing).
-- Samme mønster som project_documents (143_project_documents.sql): filer i det
-- eksisterende "assets"-bucketet, metadata i egen tabell.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS logo_path TEXT;

CREATE TABLE IF NOT EXISTS customer_logo_files (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  uploaded_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  file_name     TEXT        NOT NULL,
  file_path     TEXT        NOT NULL,
  file_type     TEXT,
  file_size     BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_logo_files_customer ON customer_logo_files(customer_id, created_at);

ALTER TABLE customer_logo_files ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'customer_logo_files' AND policyname = 'authenticated full access customer_logo_files'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated full access customer_logo_files" ON customer_logo_files FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;
