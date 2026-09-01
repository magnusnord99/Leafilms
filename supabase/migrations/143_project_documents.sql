-- 143_project_documents.sql
-- Frittstående dokumenter/vedlegg knyttet til et prosjekt — screenshots, bilder,
-- kontrakter kunden sender osv. (feedback 230366b1). Filene lagres i det
-- eksisterende "assets"-bucketet under project-documents/{project_id}/...

CREATE TABLE IF NOT EXISTS project_documents (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  file_name     TEXT        NOT NULL,
  file_path     TEXT        NOT NULL,
  file_type     TEXT,
  file_size     BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id, created_at);

ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'project_documents' AND policyname = 'authenticated full access project_documents'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated full access project_documents" ON project_documents FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;
