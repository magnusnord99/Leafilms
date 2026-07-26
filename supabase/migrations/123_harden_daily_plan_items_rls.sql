-- 123_harden_daily_plan_items_rls.sql
-- Forward repair for databases that already applied 120_daily_plan_items.sql
-- with open authenticated CRUD (USING/WITH CHECK true).
--
-- daily_plan_items is a personal work list keyed by profile_id. Any customer
-- (or other authenticated non-owner) JWT could previously SELECT/UPDATE/DELETE
-- every row via PostgREST, and server actions removePlanItem/toggleCustomPlanItem
-- did not scope by owner either.

DROP POLICY IF EXISTS "authenticated_read_daily_plan_items"   ON daily_plan_items;
DROP POLICY IF EXISTS "authenticated_insert_daily_plan_items" ON daily_plan_items;
DROP POLICY IF EXISTS "authenticated_update_daily_plan_items" ON daily_plan_items;
DROP POLICY IF EXISTS "authenticated_delete_daily_plan_items" ON daily_plan_items;

CREATE POLICY "authenticated_read_daily_plan_items"
  ON daily_plan_items FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "authenticated_insert_daily_plan_items"
  ON daily_plan_items FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "authenticated_update_daily_plan_items"
  ON daily_plan_items FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "authenticated_delete_daily_plan_items"
  ON daily_plan_items FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());
