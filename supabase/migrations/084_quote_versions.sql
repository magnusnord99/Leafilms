-- Støtte for flere tilbudsversjoner per prosjekt.
-- label: valgfritt notat ved siden av auto-nummerert versjon (f.eks. "2 filmer")
-- is_current: hvilken versjon som regnes som "gjeldende" for prosjektet
-- (brukes av kontrakt/PDF/pipeline-hub i stedet for "nyeste rad")
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_quotes_project_is_current ON quotes(project_id, is_current);
