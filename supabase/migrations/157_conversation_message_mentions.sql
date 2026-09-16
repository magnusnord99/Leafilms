-- 157_conversation_message_mentions.sql
-- @mentions i produksjonschat/lead-chat/e-postdiskusjon (conversation_messages)
-- — samme mønster som prosjekt/oppgave/tilbud/pre-prod-meldinger
-- (099_notification_actions.sql). Alle deltakere i en samtale får allerede
-- varsel om enhver ny melding (notify_direct_message); mention gir i tillegg
-- en egen conversation_message_mention-type så UI-et kan fremheve at man ble
-- tagget spesifikt, i stedet for bare "ny melding".

ALTER TABLE conversation_messages ADD COLUMN IF NOT EXISTS mentions UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'project_message', 'task_message', 'selection_submitted', 'task_assigned',
    'task_turn_ready', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply', 'contract_signed',
    'project_message_reaction', 'task_message_reaction', 'quote_message_reaction',
    'resale_assigned', 'direct_message', 'meeting_invite', 'meeting_response',
    'board_comment_mention', 'board_comment_reply', 'pitch_review_requested',
    'pitch_review_responded', 'quote_review_requested', 'quote_review_responded',
    'preprod_mention', 'preprod_message', 'preprod_message_reaction',
    'conversation_message_reaction', 'gallery_review_requested', 'gallery_review_responded',
    'conversation_message_mention'
  ]::text[]));

CREATE OR REPLACE FUNCTION public.notify_direct_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  rec       RECORD;
  sndr_name TEXT;
  preview   TEXT;
BEGIN
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.sender_id;
  preview := left(NEW.content, 80);

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.sender_id
  LOOP
    INSERT INTO notifications (user_id, type, conversation_id, message_preview, sender_name, message_id, urgent)
    VALUES (rec.profile_id, 'conversation_message_mention', NEW.conversation_id, preview, sndr_name, NEW.id, NEW.urgent);
  END LOOP;

  FOR rec IN
    SELECT cp.profile_id
    FROM conversation_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.profile_id != NEW.sender_id
      AND cp.profile_id != ALL(NEW.mentions)
  LOOP
    INSERT INTO notifications (user_id, type, conversation_id, message_preview, sender_name, message_id, urgent)
    VALUES (rec.profile_id, 'direct_message', NEW.conversation_id, preview, sndr_name, NEW.id, NEW.urgent);
  END LOOP;

  RETURN NEW;
END;
$function$;
