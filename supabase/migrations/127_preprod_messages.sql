-- 127_preprod_messages.sql
-- Pre-prod-chat: meldinger knyttet til et prosjekts pre-produksjon, med
-- @mention-varsler og reaksjoner — samme mønster som tilbudschatten
-- (080_quote_messages.sql, 083_notify_quote_message.sql, 093_notify_message_reaction.sql).
-- Scopes direkte på project_id (ett pre-prod-brett per prosjekt, i motsetning til
-- quotes der prosjektet kan ha flere tilbud).

CREATE TABLE IF NOT EXISTS preprod_messages (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id),
  message     TEXT        NOT NULL CHECK (char_length(message) > 0),
  mentions    UUID[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_preprod_messages_project ON preprod_messages(project_id);

ALTER TABLE preprod_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'preprod_messages' AND policyname = 'authed_read_preprod_messages'
  ) THEN
    EXECUTE 'CREATE POLICY "authed_read_preprod_messages" ON preprod_messages FOR SELECT TO authenticated USING (true)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'preprod_messages' AND policyname = 'authed_insert_preprod_messages'
  ) THEN
    EXECUTE 'CREATE POLICY "authed_insert_preprod_messages" ON preprod_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id)';
  END IF;
END$$;

-- Reaksjoner (message_reactions.message_type) kan nå også være 'preprod'
ALTER TABLE message_reactions DROP CONSTRAINT IF EXISTS message_reactions_message_type_check;
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_type_check
  CHECK (message_type IN ('project', 'task', 'quote', 'preprod'));

-- Utvid notifications med pre-prod-typene (speiler quote_mention/quote_message/quote_message_reaction)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply', 'contract_signed',
    'project_message_reaction', 'task_message_reaction', 'quote_message_reaction',
    'resale_assigned', 'direct_message',
    'meeting_invite', 'meeting_response',
    'board_comment_mention', 'board_comment_reply',
    'preprod_mention', 'preprod_message', 'preprod_message_reaction'
  ));

CREATE OR REPLACE FUNCTION notify_preprod_message()
RETURNS TRIGGER AS $$
DECLARE
  rec       RECORD;
  preview   TEXT;
  lead      UUID;
  sndr_name TEXT;
BEGIN
  preview := left(NEW.message, 80);
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.user_id;

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'preprod_mention', NEW.project_id, preview, sndr_name);
  END LOOP;

  SELECT project_lead_id INTO lead FROM projects WHERE id = NEW.project_id;
  IF lead IS NOT NULL AND lead != NEW.user_id AND lead != ALL(NEW.mentions) THEN
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
    VALUES (lead, 'preprod_message', NEW.project_id, preview, sndr_name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_preprod_message ON preprod_messages;
CREATE TRIGGER trg_notify_preprod_message
AFTER INSERT ON preprod_messages
FOR EACH ROW EXECUTE FUNCTION notify_preprod_message();

-- Utvid message-reaction-varsling (093_notify_message_reaction.sql) med preprod-grenen
CREATE OR REPLACE FUNCTION notify_message_reaction()
RETURNS TRIGGER AS $$
DECLARE
  owner_id   UUID;
  proj_id    UUID;
  tsk_id     UUID;
  sndr_name  TEXT;
  notif_type TEXT;
BEGIN
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.user_id;

  IF NEW.message_type = 'project' THEN
    SELECT user_id, project_id INTO owner_id, proj_id FROM project_messages WHERE id = NEW.message_id;
    notif_type := 'project_message_reaction';
  ELSIF NEW.message_type = 'task' THEN
    SELECT tm.user_id, t.project_id, tm.task_id INTO owner_id, proj_id, tsk_id
    FROM task_messages tm JOIN tasks t ON t.id = tm.task_id
    WHERE tm.id = NEW.message_id;
    notif_type := 'task_message_reaction';
  ELSIF NEW.message_type = 'quote' THEN
    SELECT user_id, project_id INTO owner_id, proj_id FROM quote_messages WHERE id = NEW.message_id;
    notif_type := 'quote_message_reaction';
  ELSIF NEW.message_type = 'preprod' THEN
    SELECT user_id, project_id INTO owner_id, proj_id FROM preprod_messages WHERE id = NEW.message_id;
    notif_type := 'preprod_message_reaction';
  END IF;

  IF owner_id IS NULL OR owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name)
  VALUES (owner_id, notif_type, proj_id, tsk_id, NEW.emoji, sndr_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
