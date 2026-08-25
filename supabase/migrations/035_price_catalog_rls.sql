-- Enable RLS on price_catalog.
-- Staff-only: customer JWTs must not read, rewrite, or wipe list prices
-- via PostgREST. 035 runs before is_staff() (097), so the role check is inline.
ALTER TABLE price_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_price_catalog" ON price_catalog;
DROP POLICY IF EXISTS "authenticated_insert_price_catalog" ON price_catalog;
DROP POLICY IF EXISTS "authenticated_update_price_catalog" ON price_catalog;
DROP POLICY IF EXISTS "authenticated_delete_price_catalog" ON price_catalog;

CREATE POLICY "authenticated_read_price_catalog"
  ON price_catalog FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

CREATE POLICY "authenticated_insert_price_catalog"
  ON price_catalog FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

CREATE POLICY "authenticated_update_price_catalog"
  ON price_catalog FOR UPDATE
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

CREATE POLICY "authenticated_delete_price_catalog"
  ON price_catalog FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );
