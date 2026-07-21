-- Støtte for flere kontraktversjoner per prosjekt — speiler is_current-mønsteret
-- som quotes fikk i 084_quote_versions.sql. Uten dette overskriver publishContract()
-- alltid samme rad, også når kontrakten allerede er signert (f.eks. ved videresalg:
-- kunden har signert V1, men skal nå ha et nytt tilbud/kontrakt for tilleggskjøp —
-- den signerte avtalen skal aldri overskrives).
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS label TEXT;

CREATE INDEX IF NOT EXISTS idx_contracts_project_is_current ON contracts(project_id, is_current);
