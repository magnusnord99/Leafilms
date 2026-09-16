-- Flerdagsrabatt-tabell
-- crew_factor og equipment_factor er desimalverdier (0.15 = 15% rabatt)
CREATE TABLE IF NOT EXISTS discount_factors (
  shoot_day INTEGER PRIMARY KEY,
  crew_factor NUMERIC(5,4) NOT NULL DEFAULT 0,
  equipment_factor NUMERIC(5,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed-data fra rabatttabellen (only insert if crew_factor column exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'discount_factors' AND column_name = 'crew_factor'
  ) THEN
    INSERT INTO discount_factors (shoot_day, crew_factor, equipment_factor) VALUES
    (1,  0.0000, 0.0000),
    (2,  0.0500, 0.1000),
    (3,  0.1000, 0.1500),
    (4,  0.1500, 0.2000),
    (5,  0.2000, 0.2500),
    (6,  0.2000, 0.3000),
    (7,  0.2000, 0.3000),
    (8,  0.2000, 0.3000),
    (9,  0.3000, 0.3000),
    (10, 0.3000, 0.3000),
    (11, 0.3000, 0.3000)
    ON CONFLICT (shoot_day) DO NOTHING;
  END IF;
END$$;

ALTER TABLE discount_factors ENABLE ROW LEVEL SECURITY;

-- Staff-only: customer JWTs must not rewrite volume discounts used in
-- quote totals. 057 runs before is_staff() (097), so the role check is inline.
DROP POLICY IF EXISTS "Authenticated can read discount_factors" ON discount_factors;
DROP POLICY IF EXISTS "Authenticated can modify discount_factors" ON discount_factors;

CREATE POLICY "Authenticated can read discount_factors"
  ON discount_factors FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

CREATE POLICY "Authenticated can modify discount_factors"
  ON discount_factors FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );
