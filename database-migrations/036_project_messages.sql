-- Migration 036: Project Messages (chat)

CREATE TABLE IF NOT EXISTS project_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_messages_project_id ON project_messages(project_id, created_at);

ALTER TABLE project_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read messages" ON project_messages;
DROP POLICY IF EXISTS "Users can insert own messages" ON project_messages;

CREATE POLICY "Authenticated users can read messages"
  ON project_messages FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin(auth.uid())));

CREATE POLICY "Users can insert own messages"
  ON project_messages FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND (SELECT public.is_admin(auth.uid())));
