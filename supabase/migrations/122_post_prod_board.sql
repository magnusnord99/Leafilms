-- 122_post_prod_board.sql
-- Post-produksjon-brett v2: dra-og-slipp, egendefinerte lanes, parallelle
-- oppgaver og et gjenbrukbart oppgavebibliotek. Se
-- docs/superpowers/specs/2026-07-22-post-prod-board-design.md.

CREATE TABLE IF NOT EXISTS post_prod_lanes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  color       TEXT,
  deadline    DATE,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_prod_lanes_project ON post_prod_lanes(project_id);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS custom_lane_id UUID REFERENCES post_prod_lanes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_parallel    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS color          TEXT,
  ADD COLUMN IF NOT EXISTS icon           TEXT;

-- En oppgave er enten i video/foto-laen (sub_type), i en egendefinert lane
-- (custom_lane_id), eller parallell (is_parallel) — aldri flere samtidig.
ALTER TABLE tasks
  ADD CONSTRAINT tasks_lane_exclusive CHECK (
    NOT is_parallel OR (custom_lane_id IS NULL AND sub_type IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_tasks_custom_lane ON tasks(custom_lane_id) WHERE custom_lane_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS post_prod_task_library (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  title             TEXT        NOT NULL,
  description       TEXT,
  color             TEXT,
  icon              TEXT,
  lane_type         TEXT        NOT NULL CHECK (lane_type IN ('video','photo','custom','parallel')),
  custom_lane_name  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE post_prod_lanes IS 'Egendefinerte post-produksjon-lanes per prosjekt (utover innebygde Video/Foto), for post-produksjon-brettet på pre-prod-siden';
COMMENT ON TABLE post_prod_task_library IS 'Gjenbrukbart bibliotek av post-produksjon-oppgaver, prosjekt-uavhengig — mal for "legg til oppgave"-skjemaet';

ALTER TABLE post_prod_lanes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_prod_task_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_post_prod_lanes"   ON post_prod_lanes;
DROP POLICY IF EXISTS "authenticated_insert_post_prod_lanes" ON post_prod_lanes;
DROP POLICY IF EXISTS "authenticated_update_post_prod_lanes" ON post_prod_lanes;
DROP POLICY IF EXISTS "authenticated_delete_post_prod_lanes" ON post_prod_lanes;

CREATE POLICY "authenticated_read_post_prod_lanes"
  ON post_prod_lanes FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_post_prod_lanes"
  ON post_prod_lanes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_post_prod_lanes"
  ON post_prod_lanes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_post_prod_lanes"
  ON post_prod_lanes FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_post_prod_task_library"   ON post_prod_task_library;
DROP POLICY IF EXISTS "authenticated_insert_post_prod_task_library" ON post_prod_task_library;
DROP POLICY IF EXISTS "authenticated_update_post_prod_task_library" ON post_prod_task_library;
DROP POLICY IF EXISTS "authenticated_delete_post_prod_task_library" ON post_prod_task_library;

CREATE POLICY "authenticated_read_post_prod_task_library"
  ON post_prod_task_library FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_post_prod_task_library"
  ON post_prod_task_library FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_post_prod_task_library"
  ON post_prod_task_library FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_post_prod_task_library"
  ON post_prod_task_library FOR DELETE TO authenticated USING (true);
