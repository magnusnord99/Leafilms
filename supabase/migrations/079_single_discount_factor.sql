-- Slår sammen crew_factor/equipment_factor til én rabattsats per opptaksdag.
-- Rabatten gjelder kun opptak (mannskap) og post-produksjon, ikke utstyr.
DO $$
BEGIN
  -- Rename crew_factor to discount_factor if crew_factor exists and discount_factor doesn't
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discount_factors' AND column_name = 'crew_factor'
  ) THEN
    ALTER TABLE discount_factors RENAME COLUMN crew_factor TO discount_factor;
  END IF;
END$$;

-- Drop equipment_factor if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discount_factors' AND column_name = 'equipment_factor'
  ) THEN
    ALTER TABLE discount_factors DROP COLUMN equipment_factor;
  END IF;
END$$;
