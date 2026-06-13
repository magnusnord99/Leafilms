-- Migration 045: task_messages chat-tabell + notes-kolonne på tasks

-- 1. Legg til notes-kolonne på tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Opprett task_messages-tabell
CREATE TABLE IF NOT EXISTS task_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_messages_task_id    ON task_messages(task_id);
CREATE INDEX IF NOT EXISTS idx_task_messages_created_at ON task_messages(task_id, created_at);

COMMENT ON TABLE task_messages IS 'Chat-meldinger knyttet til post-prod-oppgaver';

-- 3. RLS for task_messages
ALTER TABLE task_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_task_messages"   ON task_messages;
DROP POLICY IF EXISTS "authenticated_insert_task_messages" ON task_messages;
DROP POLICY IF EXISTS "authenticated_update_task_messages" ON task_messages;
DROP POLICY IF EXISTS "authenticated_delete_task_messages" ON task_messages;

CREATE POLICY "authenticated_read_task_messages"
  ON task_messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_task_messages"
  ON task_messages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "authenticated_update_task_messages"
  ON task_messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "authenticated_delete_task_messages"
  ON task_messages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
