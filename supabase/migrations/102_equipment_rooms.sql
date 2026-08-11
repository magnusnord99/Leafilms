-- 102_equipment_rooms.sql
-- Utstyrsrom: fysisk lagerstyring for pakkeliste.
-- Spec: docs/superpowers/specs/2026-07-20-utstyr-rom-design.md
-- To tabeller (equipment_rooms, equipment_units), staff-RLS.
-- Hver equipment_units-rad har nøyaktig én plassering: room_id (i et rom)
-- eller checked_out_project_id (ute til en shoot) — aldri begge, aldri ingen.

CREATE TABLE IF NOT EXISTS equipment_rooms (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_units (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id               UUID NOT NULL REFERENCES price_catalog(id) ON DELETE RESTRICT,
  unit_label               TEXT NOT NULL,
  room_id                  UUID REFERENCES equipment_rooms(id) ON DELETE CASCADE,
  checked_out_project_id   UUID REFERENCES projects(id) ON DELETE RESTRICT,
  checked_out_assignee_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT equipment_units_location_xor CHECK ((room_id IS NULL) <> (checked_out_project_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_equipment_units_room ON equipment_units(room_id);
CREATE INDEX IF NOT EXISTS idx_equipment_units_project ON equipment_units(checked_out_project_id);
CREATE INDEX IF NOT EXISTS idx_equipment_units_catalog ON equipment_units(catalog_id);

-- ---------------------------------------------------------------------------
-- RLS: staff only (is_staff). Ingen offentlige policies.
-- Tidligere "authenticated full access … USING (true)" lot customer-JWTs
-- CRUD hele inventaret via PostgREST — se 136_harden_equipment_rls.sql.
-- ---------------------------------------------------------------------------
ALTER TABLE equipment_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access equipment_rooms" ON equipment_rooms;
DROP POLICY IF EXISTS "staff_all_equipment_rooms" ON equipment_rooms;
CREATE POLICY "staff_all_equipment_rooms"
  ON equipment_rooms FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "authenticated full access equipment_units" ON equipment_units;
DROP POLICY IF EXISTS "staff_all_equipment_units" ON equipment_units;
CREATE POLICY "staff_all_equipment_units"
  ON equipment_units FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
