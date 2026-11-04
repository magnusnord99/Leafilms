-- 185_project_links.sql
-- Navngitte lenker knyttet til et prosjekt — samme mønster som
-- project_documents (143_project_documents.sql). Lenkene lagres i databasen
-- og rendres som klikk-kort i ProjectLinks-komponenten.

CREATE TABLE IF NOT EXISTS project_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  label       TEXT        NOT NULL,
  url         TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_links_project ON project_links(project_id, created_at);

ALTER TABLE project_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'project_links' AND policyname = 'authenticated full access project_links'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated full access project_links" ON project_links FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;
