-- 116_storyline_grid.sql
-- Sporer at et board er en storyline-blueprint (kind) + hvor bred panel-rutenettet
-- er (storyline_columns), slik at "legg til kort/rad/kolonne" vet hvor nye tomme
-- bildepaneler skal plasseres. Kun satt på storyline-underboards, NULL ellers.

ALTER TABLE boards ADD COLUMN IF NOT EXISTS kind TEXT;
ALTER TABLE boards DROP CONSTRAINT IF EXISTS boards_kind_check;
ALTER TABLE boards ADD CONSTRAINT boards_kind_check CHECK (kind IS NULL OR kind IN ('storyline'));

ALTER TABLE boards ADD COLUMN IF NOT EXISTS storyline_columns INTEGER;
