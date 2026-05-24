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

CREATE POLICY "Authenticated users can read messages"
  ON project_messages FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert own messages"
  ON project_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);
