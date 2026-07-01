-- 080_quote_messages.sql
-- Tilbudschat: meldinger knyttet til et tilbud med @mention-varsler

CREATE TABLE IF NOT EXISTS quote_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    UUID        NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id),
  message     TEXT        NOT NULL CHECK (char_length(message) > 0),
  mentions    UUID[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_messages_quote ON quote_messages(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_messages_project ON quote_messages(project_id);

ALTER TABLE quote_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'quote_messages' AND policyname = 'authed_read_quote_messages'
  ) THEN
    EXECUTE 'CREATE POLICY "authed_read_quote_messages" ON quote_messages FOR SELECT TO authenticated USING (true)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'quote_messages' AND policyname = 'authed_insert_quote_messages'
  ) THEN
    EXECUTE 'CREATE POLICY "authed_insert_quote_messages" ON quote_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
END$$;

-- Utvid notifications type-constraint med quote_mention
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention'
  ));
