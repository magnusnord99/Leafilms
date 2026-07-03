-- 083_notify_quote_message.sql
-- Legger til DB-trigger for tilbudschat-meldinger, sammenlignbar med
-- notify_project_message/notify_task_message (081). Varsler:
-- 1) alle @nevnte brukere (type quote_mention, som før)
-- 2) prosjektets quote_assignee_id (ny type quote_message) hvis
--    vedkommende ikke allerede ble varslet via mention og ikke er
--    avsender selv
--
-- Erstatter det tidligere app-nivå-varselet i sendQuoteMessage
-- (lib/actions/quotes.ts), som kun varslet mentions og hadde en
-- uawaitet Promise.all — nå går alt gjennom samme trigger-mønster
-- som de to andre chattene.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message'
  ));

CREATE OR REPLACE FUNCTION notify_quote_message()
RETURNS TRIGGER AS $$
DECLARE
  rec       RECORD;
  preview   TEXT;
  notified  BOOLEAN := false;
  assignee  UUID;
  sndr_name TEXT;
BEGIN
  preview := left(NEW.message, 80);
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.user_id;

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    notified := true;
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'quote_mention', NEW.project_id, preview, sndr_name);
  END LOOP;

  SELECT quote_assignee_id INTO assignee FROM projects WHERE id = NEW.project_id;
  IF assignee IS NOT NULL AND assignee != NEW.user_id AND assignee != ALL(NEW.mentions) THEN
    notified := true;
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
    VALUES (assignee, 'quote_message', NEW.project_id, preview, sndr_name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_quote_message ON quote_messages;
CREATE TRIGGER trg_notify_quote_message
AFTER INSERT ON quote_messages
FOR EACH ROW EXECUTE FUNCTION notify_quote_message();
