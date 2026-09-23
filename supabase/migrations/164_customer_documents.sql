-- 164_customer_documents.sql
-- Generelle kundedokumenter (profilhåndbok, avtaler, osv.) som ikke hører til
-- ett enkelt prosjekt — vises på kundesiden (app/admin/customers/[id]/page.tsx),
-- feedback: "må kunne legge til filer på kunder". Samme mønster som
-- customer_logo_files (149_customer_logos.sql): filer i "assets"-bucketet,
-- metadata i egen tabell. Nye tabeller får is_staff()-gate fra start
-- (se 153_harden_tasks_rls.sql for begrunnelsen), i stedet for en åpen
-- "authenticated full access"-policy som må strammes inn senere.

CREATE TABLE IF NOT EXISTS customer_documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  uploaded_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  file_name     TEXT        NOT NULL,
  file_path     TEXT        NOT NULL,
  file_type     TEXT,
  file_size     BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_documents_customer ON customer_documents(customer_id, created_at);

ALTER TABLE customer_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_customer_documents"   ON customer_documents;
DROP POLICY IF EXISTS "authenticated_insert_customer_documents" ON customer_documents;
DROP POLICY IF EXISTS "authenticated_delete_customer_documents" ON customer_documents;

CREATE POLICY "authenticated_read_customer_documents"
  ON customer_documents FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_insert_customer_documents"
  ON customer_documents FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_delete_customer_documents"
  ON customer_documents FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));
