-- Migration 047: Bytt fra enkelt assignee_id til junction-tabell task_assignees
-- Lar flere brukere bli tildelt samme task

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id    ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_profile_id ON task_assignees(profile_id);

COMMENT ON TABLE task_assignees IS 'Mange-til-mange: hvilke brukere som er tildelt en task';

-- Migrer eksisterende enkelt-assignee over til junction-tabellen
INSERT INTO task_assignees (task_id, profile_id)
SELECT id, assignee_id
FROM tasks
WHERE assignee_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE task_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read task_assignees"
  ON task_assignees FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

CREATE POLICY "Authenticated users can insert task_assignees"
  ON task_assignees FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

CREATE POLICY "Authenticated users can delete task_assignees"
  ON task_assignees FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );
