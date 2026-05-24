-- Enable RLS on price_catalog and grant full access to authenticated users
ALTER TABLE price_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_price_catalog" ON price_catalog;
DROP POLICY IF EXISTS "authenticated_insert_price_catalog" ON price_catalog;
DROP POLICY IF EXISTS "authenticated_update_price_catalog" ON price_catalog;
DROP POLICY IF EXISTS "authenticated_delete_price_catalog" ON price_catalog;

CREATE POLICY "authenticated_read_price_catalog"
  ON price_catalog FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_price_catalog"
  ON price_catalog FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_price_catalog"
  ON price_catalog FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_price_catalog"
  ON price_catalog FOR DELETE
  TO authenticated
  USING (true);
