-- 108_admin_tasks.sql
-- Interne admin-oppgaver uten prosjekttilknytning (f.eks. "forny lisens",
-- "bestille visittkort"). Helt separat fra prosjekt-tasks-tabellen for å
-- unngå å røre project_id NOT NULL-antagelser som brukes mange steder i appen.

CREATE TABLE IF NOT EXISTS admin_tasks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT        NOT NULL,
  description    TEXT,
  status         TEXT        NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'done')),
  assignee_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  due_date       DATE,
  sort_order     INT         NOT NULL DEFAULT 0,
  created_by     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_tasks_status      ON admin_tasks(status);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_assignee_id ON admin_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_admin_tasks_sort_order  ON admin_tasks(status, sort_order);

COMMENT ON TABLE admin_tasks IS 'Interne admin-oppgaver uten prosjekttilknytning — egen liste/board, status er hele pipelinen';

ALTER TABLE admin_tasks ENABLE ROW LEVEL SECURITY;

-- Staff-only: interne admin-oppgaver. Customer JWT må ikke kunne lese/skrive
-- via PostgREST (tidligere authenticated_* USING true).
DROP POLICY IF EXISTS "authenticated_read_admin_tasks"   ON admin_tasks;
DROP POLICY IF EXISTS "authenticated_insert_admin_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "authenticated_update_admin_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "authenticated_delete_admin_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "staff_read_admin_tasks"   ON admin_tasks;
DROP POLICY IF EXISTS "staff_insert_admin_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "staff_update_admin_tasks" ON admin_tasks;
DROP POLICY IF EXISTS "staff_delete_admin_tasks" ON admin_tasks;

CREATE POLICY "staff_read_admin_tasks"
  ON admin_tasks FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff_insert_admin_tasks"
  ON admin_tasks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff_update_admin_tasks"
  ON admin_tasks FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff_delete_admin_tasks"
  ON admin_tasks FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));
