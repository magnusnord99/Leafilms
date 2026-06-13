-- Prosjektversjoner: mulighet for V1, V2, V3 osv.
-- parent_project_id kobler V2, V3 til den første versjonen (V1)
-- version_number: 1, 2, 3...

ALTER TABLE projects
ADD COLUMN IF NOT EXISTS parent_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1;

-- Eksisterende prosjekter får version_number = 1
UPDATE projects SET version_number = 1 WHERE version_number IS NULL;

-- Index for å finne alle versjoner av et prosjekt
CREATE INDEX IF NOT EXISTS idx_projects_parent_project_id ON projects(parent_project_id);
CREATE INDEX IF NOT EXISTS idx_projects_version_number ON projects(version_number);

COMMENT ON COLUMN projects.parent_project_id IS 'Referanse til første versjon (V1). Null for V1.';
COMMENT ON COLUMN projects.version_number IS 'Versjonsnummer: 1, 2, 3...';
