-- 118_daily_plan_items.sql
-- "Dagens plan" på /admin/tasks: en personlig, sorterbar arbeidsliste hvor
-- brukeren kan hente inn egne prosjektoppgaver (task_id) og/eller legge til
-- frittstående egne oppgaver (title). Ingen dato-kolonne med vilje — en rad
-- blir liggende i listen til den er ferdig eller fjernes manuelt, så
-- "overføring til neste dag" skjer helt av seg selv uten noen cron-jobb.
-- done brukes kun for egne oppgaver (title IS NOT NULL); for prosjektoppgaver
-- leses status alltid direkte fra tasks.status, så det finnes bare én
-- sannhetskilde for om en prosjektoppgave er ferdig.

CREATE TABLE IF NOT EXISTS daily_plan_items (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id     UUID        REFERENCES tasks(id) ON DELETE CASCADE,
  title       TEXT,
  done        BOOLEAN     NOT NULL DEFAULT false,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_plan_items_task_xor_title CHECK ((task_id IS NULL) <> (title IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_plan_items_profile_task
  ON daily_plan_items(profile_id, task_id) WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_daily_plan_items_profile_sort
  ON daily_plan_items(profile_id, sort_order);

COMMENT ON TABLE daily_plan_items IS 'Personlig dagsplan på /admin/tasks — utvalg av oppgaver + egne todo-punkter for arbeidsdagen';

ALTER TABLE daily_plan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_daily_plan_items"   ON daily_plan_items;
DROP POLICY IF EXISTS "authenticated_insert_daily_plan_items" ON daily_plan_items;
DROP POLICY IF EXISTS "authenticated_update_daily_plan_items" ON daily_plan_items;
DROP POLICY IF EXISTS "authenticated_delete_daily_plan_items" ON daily_plan_items;

-- Personlig liste: kun eieren (profile_id) kan lese/skrive egne rader.
-- USING (true) ville latt enhver authenticated JWT (inkl. customer) lese og
-- slette alle andres dagsplaner via PostgREST.
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
