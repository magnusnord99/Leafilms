-- 111_equipment_reservations.sql
-- equipment_units.checked_out_project_id var én enkelt kolonne — en enhet kunne
-- derfor kun være reservert til ÉTT prosjekt om gangen, selv om to prosjekter
-- har shoot på helt ulike datoer og fysisk ikke kolliderer. Dobbeltbooking-
-- varselet (108/109) flagget derfor alle re-reserveringer som konflikt, uansett
-- dato. Erstatter med en egen tabell slik at en enhet kan ha flere fremtidige
-- reservasjoner samtidig, og konflikt kun flagges når shoot-datoene faktisk
-- overlapper.

CREATE TABLE IF NOT EXISTS equipment_reservations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id     UUID NOT NULL REFERENCES equipment_units(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assignee_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (unit_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_equipment_reservations_unit ON equipment_reservations(unit_id);
CREATE INDEX IF NOT EXISTS idx_equipment_reservations_project ON equipment_reservations(project_id);

ALTER TABLE equipment_reservations ENABLE ROW LEVEL SECURITY;

-- Staff only — open authenticated FOR ALL previously allowed any customer JWT
-- to wipe or reassign every equipment reservation via PostgREST.
DROP POLICY IF EXISTS "authenticated full access equipment_reservations" ON equipment_reservations;
DROP POLICY IF EXISTS "staff_all_equipment_reservations" ON equipment_reservations;

CREATE POLICY "staff_all_equipment_reservations"
  ON equipment_reservations FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Migrer eksisterende reservasjoner (single-column-modellen) over til tabellen.
INSERT INTO equipment_reservations (unit_id, project_id, assignee_id)
SELECT id, checked_out_project_id, checked_out_assignee_id
FROM equipment_units
WHERE checked_out_project_id IS NOT NULL
ON CONFLICT (unit_id, project_id) DO NOTHING;

ALTER TABLE equipment_units DROP COLUMN IF EXISTS checked_out_project_id;
ALTER TABLE equipment_units DROP COLUMN IF EXISTS checked_out_assignee_id;
