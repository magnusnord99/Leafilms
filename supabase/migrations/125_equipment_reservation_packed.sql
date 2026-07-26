-- 124_equipment_reservation_packed.sql
-- Lar produksjonscrew hake av utstyr fra lager som pakket i pakkelisten,
-- samme mønster som "checked" på frittekst-utstyr i preprod.packing_list.

ALTER TABLE equipment_reservations ADD COLUMN IF NOT EXISTS packed BOOLEAN NOT NULL DEFAULT false;
