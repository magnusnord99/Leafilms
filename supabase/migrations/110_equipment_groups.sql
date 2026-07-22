-- Reusable equipment groups ("pakker") — e.g. "Liten kamerapakke", "Stor lyspakke" —
-- that bundle several price_catalog items so they can be inserted into a quote in one go.
CREATE TABLE IF NOT EXISTS equipment_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment_group_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES equipment_groups(id) ON DELETE CASCADE,
  catalog_item_id UUID NOT NULL REFERENCES price_catalog(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipment_group_items_group_id ON equipment_group_items(group_id);

ALTER TABLE equipment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_group_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_equipment_groups" ON equipment_groups;
DROP POLICY IF EXISTS "authenticated_insert_equipment_groups" ON equipment_groups;
DROP POLICY IF EXISTS "authenticated_update_equipment_groups" ON equipment_groups;
DROP POLICY IF EXISTS "authenticated_delete_equipment_groups" ON equipment_groups;

CREATE POLICY "authenticated_read_equipment_groups"
  ON equipment_groups FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_equipment_groups"
  ON equipment_groups FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_equipment_groups"
  ON equipment_groups FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_equipment_groups"
  ON equipment_groups FOR DELETE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_read_equipment_group_items" ON equipment_group_items;
DROP POLICY IF EXISTS "authenticated_insert_equipment_group_items" ON equipment_group_items;
DROP POLICY IF EXISTS "authenticated_update_equipment_group_items" ON equipment_group_items;
DROP POLICY IF EXISTS "authenticated_delete_equipment_group_items" ON equipment_group_items;

CREATE POLICY "authenticated_read_equipment_group_items"
  ON equipment_group_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_equipment_group_items"
  ON equipment_group_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_equipment_group_items"
  ON equipment_group_items FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_equipment_group_items"
  ON equipment_group_items FOR DELETE
  TO authenticated
  USING (true);
