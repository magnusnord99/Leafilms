-- 109_equipment_room_owner_and_planning.sql
-- To endringer i utstyr-rom-modellen (102_equipment_rooms.sql):
--
-- 1. Utstyr skal kun regnes som "ute til shoot" fra faktisk shoot-dato, ikke
--    fra når det planlegges/tildeles et prosjekt i preprod. En equipment_unit
--    kan derfor nå ha BÅDE room_id (hjemme-rom) og checked_out_project_id
--    (reservert til prosjekt) satt samtidig — room_id nulles ikke lenger ved
--    tildeling, kun ved eksplisitt "lever inn". Fjerner derfor XOR-constrainten.
--
-- 2. Rom kan ha en valgfri eier (owner_id). Utstyr som hentes ut fra et rom
--    med eier, tildeles automatisk eieren som pakke-ansvarlig.

ALTER TABLE equipment_units DROP CONSTRAINT IF EXISTS equipment_units_location_xor;

ALTER TABLE equipment_rooms
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_rooms_owner ON equipment_rooms(owner_id);
