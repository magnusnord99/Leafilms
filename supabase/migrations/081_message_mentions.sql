-- 081_message_mentions.sql
-- @mentions for project_messages/task_messages + realtime for task_messages

ALTER TABLE project_messages ADD COLUMN IF NOT EXISTS mentions UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE task_messages    ADD COLUMN IF NOT EXISTS mentions UUID[] NOT NULL DEFAULT '{}';

-- Utvid notifications type-constraint med de nye mention-typene
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention'
  ));

-- Trigger 1 (oppdatert): prosjekt-melding
-- Mentions varsles uansett assignee-status; assignees som IKKE er nevnt
-- får vanlig project_message-varsel. En nevnt assignee får kun mention-varselet.
CREATE OR REPLACE FUNCTION notify_project_message()
RETURNS TRIGGER AS $$
DECLARE
  rec     RECORD;
  preview TEXT;
BEGIN
  preview := left(NEW.content, 80);

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'project_message_mention', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'));
  END LOOP;

  FOR rec IN
    SELECT DISTINCT ta.profile_id
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id
    WHERE t.project_id = NEW.project_id
      AND ta.profile_id != NEW.user_id
      AND ta.profile_id != ALL(NEW.mentions)
  LOOP
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'));
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger 2 (oppdatert): oppgave-melding, samme mention/assignee-logikk
CREATE OR REPLACE FUNCTION notify_task_message()
RETURNS TRIGGER AS $$
DECLARE
  rec       RECORD;
  proj_id   UUID;
  sndr_name TEXT;
  preview   TEXT;
BEGIN
  preview := left(NEW.message, 80);
  SELECT project_id INTO proj_id FROM tasks WHERE id = NEW.task_id;
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.user_id;

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'task_message_mention', proj_id, NEW.task_id, preview, sndr_name);
  END LOOP;

  FOR rec IN
    SELECT DISTINCT ta.profile_id
    FROM task_assignees ta
    WHERE ta.task_id = NEW.task_id
      AND ta.profile_id != NEW.user_id
      AND ta.profile_id != ALL(NEW.mentions)
  LOOP
    INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'task_message', proj_id, NEW.task_id, preview, sndr_name);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable realtime for project_messages (if not already enabled)
ALTER TABLE project_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE project_messages;
EXCEPTION WHEN SQLSTATE '42710' THEN
  NULL;
END$$;

-- Realtime for task_messages
ALTER TABLE task_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE task_messages;
EXCEPTION WHEN SQLSTATE '42710' THEN
  NULL;
END$$;
