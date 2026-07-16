-- 088_feedback_reply.sql
-- Lar admin svare på en innmeldt tilbakemelding. Ett svar per sak (ikke tråd) —
-- svaret varsler den som meldte inn saken, via samme notifications-mønster
-- som resten av appen (jf. 083_notify_quote_message.sql).

alter table feedback
  add column if not exists admin_reply text,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_by uuid references profiles(id) on delete set null;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply'
  ));

CREATE OR REPLACE FUNCTION notify_feedback_reply()
RETURNS TRIGGER AS $$
DECLARE
  preview   TEXT;
  sndr_name TEXT;
BEGIN
  IF NEW.admin_reply IS NULL OR NEW.admin_reply IS NOT DISTINCT FROM OLD.admin_reply THEN
    RETURN NEW;
  END IF;
  IF NEW.created_by IS NULL OR NEW.created_by = NEW.replied_by THEN
    RETURN NEW;
  END IF;

  preview := left(NEW.admin_reply, 80);
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.replied_by;

  INSERT INTO notifications (user_id, type, message_preview, sender_name)
  VALUES (NEW.created_by, 'feedback_reply', preview, sndr_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_feedback_reply ON feedback;
CREATE TRIGGER trg_notify_feedback_reply
AFTER UPDATE ON feedback
FOR EACH ROW EXECUTE FUNCTION notify_feedback_reply();
