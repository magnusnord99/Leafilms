-- 136_harden_equipment_rls.sql
-- Forward repair for databases that already applied:
--   102_equipment_rooms.sql         — "authenticated full access" FOR ALL true
--   110_equipment_groups.sql        — open authenticated CRUD (USING/WITH CHECK true)
--   111_equipment_reservations.sql  — "authenticated full access" FOR ALL true
--
-- Same class as harden PRs #29/#41/#42/#43/#44/#45. Trigger: any customer
-- (or other non-staff) JWT can PostgREST SELECT/INSERT/UPDATE/DELETE every
-- equipment room/unit/reservation/group row — wiping inventory tracking and
-- shoot packing lists, or mutating quote equipment packages.
--
-- Numbered 136_ to avoid clash with open PR #37 (130_), #41 (131_), #42 (132_),
-- #43 (133_), #44 (134_), #45 (135_).
-- Idempotent — safe if 102/110/111 were already rewritten in source.

-- equipment_rooms
DROP POLICY IF EXISTS "authenticated full access equipment_rooms" ON equipment_rooms;
DROP POLICY IF EXISTS "staff_all_equipment_rooms" ON equipment_rooms;

CREATE POLICY "staff_all_equipment_rooms"
  ON equipment_rooms FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- equipment_units
DROP POLICY IF EXISTS "authenticated full access equipment_units" ON equipment_units;
DROP POLICY IF EXISTS "staff_all_equipment_units" ON equipment_units;

CREATE POLICY "staff_all_equipment_units"
  ON equipment_units FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- equipment_reservations
DROP POLICY IF EXISTS "authenticated full access equipment_reservations" ON equipment_reservations;
DROP POLICY IF EXISTS "staff_all_equipment_reservations" ON equipment_reservations;

CREATE POLICY "staff_all_equipment_reservations"
  ON equipment_reservations FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- equipment_groups
DROP POLICY IF EXISTS "authenticated_read_equipment_groups" ON equipment_groups;
DROP POLICY IF EXISTS "authenticated_insert_equipment_groups" ON equipment_groups;
DROP POLICY IF EXISTS "authenticated_update_equipment_groups" ON equipment_groups;
DROP POLICY IF EXISTS "authenticated_delete_equipment_groups" ON equipment_groups;
DROP POLICY IF EXISTS "staff_read_equipment_groups" ON equipment_groups;
DROP POLICY IF EXISTS "staff_insert_equipment_groups" ON equipment_groups;
DROP POLICY IF EXISTS "staff_update_equipment_groups" ON equipment_groups;
DROP POLICY IF EXISTS "staff_delete_equipment_groups" ON equipment_groups;

CREATE POLICY "staff_read_equipment_groups"
  ON equipment_groups FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_insert_equipment_groups"
  ON equipment_groups FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_equipment_groups"
  ON equipment_groups FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_delete_equipment_groups"
  ON equipment_groups FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- equipment_group_items
DROP POLICY IF EXISTS "authenticated_read_equipment_group_items" ON equipment_group_items;
DROP POLICY IF EXISTS "authenticated_insert_equipment_group_items" ON equipment_group_items;
DROP POLICY IF EXISTS "authenticated_update_equipment_group_items" ON equipment_group_items;
DROP POLICY IF EXISTS "authenticated_delete_equipment_group_items" ON equipment_group_items;
DROP POLICY IF EXISTS "staff_read_equipment_group_items" ON equipment_group_items;
DROP POLICY IF EXISTS "staff_insert_equipment_group_items" ON equipment_group_items;
DROP POLICY IF EXISTS "staff_update_equipment_group_items" ON equipment_group_items;
DROP POLICY IF EXISTS "staff_delete_equipment_group_items" ON equipment_group_items;

CREATE POLICY "staff_read_equipment_group_items"
  ON equipment_group_items FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_insert_equipment_group_items"
  ON equipment_group_items FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_equipment_group_items"
  ON equipment_group_items FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_delete_equipment_group_items"
  ON equipment_group_items FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));
