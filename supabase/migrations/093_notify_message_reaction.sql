-- 093_notify_message_reaction.sql
-- Varsler meldingens avsender når noen reagerer med en emoji på meldingen deres.
-- Tre egne typer (speiler mention-mønsteret i 081/083_message_mentions/notify_quote_message)
-- i stedet for én felles 'message_reaction' — project_message og quote_message har begge
-- kun project_id satt på notifications-raden, så varsel-siden trenger typen for å vite
-- hvilken chat den skal navigere til.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply', 'contract_signed',
    'project_message_reaction', 'task_message_reaction', 'quote_message_reaction'
  ));

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
  END IF;

  -- Ingen melding funnet, eller bruker reagerer på sin egen melding — ikke varsle
  IF owner_id IS NULL OR owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name)
  VALUES (owner_id, notif_type, proj_id, tsk_id, NEW.emoji, sndr_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_message_reaction ON message_reactions;
CREATE TRIGGER trg_notify_message_reaction
AFTER INSERT ON message_reactions
FOR EACH ROW EXECUTE FUNCTION notify_message_reaction();
