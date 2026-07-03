-- 082_notify_project_message_fallback.sql
-- Fikser to hull i chat-varsling:
-- 1) notify_project_message() varsler ingen hvis prosjektet ikke har
--    task_assignees ennå (typisk lead/møte-steg) — fall tilbake til
--    project_lead_id hvis satt.
-- 2) quote_messages manglet i supabase_realtime-publikasjonen, så
--    QuoteChat kunne ikke være realtime (se migrasjon 081 for samme
--    mønster brukt på task_messages/project_messages).

-- IMPORTANT: this replaces the mention-aware version of the function
-- introduced in 081_message_mentions.sql (lines 19-47), NOT the older
-- plain version from 056_notifications.sql. The mention-split behavior
-- (mentioned users get 'project_message_mention', everyone else on a
-- project task gets 'project_message') is preserved verbatim below —
-- only the new `notified`/fallback block at the end is added.
CREATE OR REPLACE FUNCTION notify_project_message()
RETURNS TRIGGER AS $$
DECLARE
  rec      RECORD;
  preview  TEXT;
  notified BOOLEAN := false;
  lead_id  UUID;
BEGIN
  preview := left(NEW.content, 80);

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    notified := true;
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
    notified := true;
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'));
  END LOOP;

  IF NOT notified THEN
    SELECT project_lead_id INTO lead_id FROM projects WHERE id = NEW.project_id;
    IF lead_id IS NOT NULL AND lead_id != NEW.user_id THEN
      INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
      VALUES (lead_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger already exists (trg_notify_project_message on project_messages,
-- created in 056_notifications.sql, re-pointed at this function each time
-- it's replaced) — CREATE OR REPLACE FUNCTION above is enough, no need to
-- re-create the trigger.

-- quote_messages realtime (mirrors 081_message_mentions.sql:89-107)
ALTER TABLE quote_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'quote_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE quote_messages;
  END IF;
END $$;
