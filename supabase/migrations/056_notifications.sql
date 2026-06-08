-- 056_notifications.sql

-- Tabell
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type            TEXT        NOT NULL CHECK (type IN ('project_message', 'task_message')),
  project_id      UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  task_id         UUID        REFERENCES tasks(id) ON DELETE CASCADE,
  message_preview TEXT        NOT NULL,
  sender_name     TEXT        NOT NULL,
  read            BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_project
  ON notifications(project_id);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- Trigger 1: prosjekt-melding
-- Varsler alle med minst én task i prosjektet (unntatt avsender)
CREATE OR REPLACE FUNCTION notify_project_message()
RETURNS TRIGGER AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT DISTINCT ta.profile_id
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id
    WHERE t.project_id = NEW.project_id
      AND ta.profile_id != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
    VALUES (
      rec.profile_id,
      'project_message',
      NEW.project_id,
      left(NEW.content, 80),
      COALESCE(NEW.user_name, 'Ukjent')
    );
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_project_message ON project_messages;
CREATE TRIGGER trg_notify_project_message
AFTER INSERT ON project_messages
FOR EACH ROW EXECUTE FUNCTION notify_project_message();

-- Trigger 2: oppgave-melding
-- Varsler alle assignees på oppgaven (unntatt avsender)
CREATE OR REPLACE FUNCTION notify_task_message()
RETURNS TRIGGER AS $$
DECLARE
  rec       RECORD;
  proj_id   UUID;
  sndr_name TEXT;
BEGIN
  SELECT project_id INTO proj_id FROM tasks WHERE id = NEW.task_id;
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.user_id;

  FOR rec IN
    SELECT DISTINCT ta.profile_id
    FROM task_assignees ta
    WHERE ta.task_id = NEW.task_id
      AND ta.profile_id != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name)
    VALUES (
      rec.profile_id,
      'task_message',
      proj_id,
      NEW.task_id,
      left(NEW.message, 80),
      sndr_name
    );
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_task_message ON task_messages;
CREATE TRIGGER trg_notify_task_message
AFTER INSERT ON task_messages
FOR EACH ROW EXECUTE FUNCTION notify_task_message();
