-- Skjemabasert kontraktgenerering: org.nummer per kunde (gjenbrukes i alle
-- kontrakter for kunden) og lagrede skjemaverdier per kontrakt (slik at
-- skjemaet kan åpnes igjen senere og kontrakten regenereres).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS org_nummer TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS form_fields JSONB;
