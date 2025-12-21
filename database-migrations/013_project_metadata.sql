-- Legg til metadata-kolonne for AI-generering
-- Lagrer prosjekttype, medium, målgruppe, bransje, omfang og kontekst

ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Kommentar for dokumentasjon
COMMENT ON COLUMN projects.metadata IS 'JSON med AI-genereringsdata: project_type, medium, target_audience, industry, scope, context';

