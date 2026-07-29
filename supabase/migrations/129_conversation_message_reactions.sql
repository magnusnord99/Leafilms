-- 128_conversation_message_reactions.sql
-- Emoji-reaksjoner på DM-er og produksjonschat-meldinger (conversation_messages) —
-- samme mønster som prosjekt/oppgave/tilbud/pre-prod (091_message_reactions.sql,
-- 127_preprod_messages.sql), men RLS må stramme inn: message_reactions sine
-- eksisterende SELECT/INSERT-policyer er "alle autentiserte" siden project/task/
-- quote/preprod-chatter er delt synlige for hele teamet. DM-er er private
-- (conversation_messages RLS begrenser lesing til deltakere), så en reaksjon på en
-- DM må arve samme begrensning — ellers lekker vi hvem som har reagert på private
-- meldinger til alle ansatte. Bruker samme is_conversation_participant()-helper som
-- conversation_messages selv (094_direct_messages.sql) for å unngå RLS-rekursjon.

ALTER TABLE message_reactions DROP CONSTRAINT IF EXISTS message_reactions_message_type_check;
ALTER TABLE message_reactions ADD CONSTRAINT message_reactions_message_type_check
  CHECK (message_type IN ('project', 'task', 'quote', 'preprod', 'conversation'));

DROP POLICY IF EXISTS "Authenticated users can read reactions" ON message_reactions;
CREATE POLICY "Authenticated users can read reactions"
  ON message_reactions FOR SELECT TO authenticated
  USING (
    message_type != 'conversation'
    OR is_conversation_participant(
         (SELECT conversation_id FROM conversation_messages WHERE id = message_reactions.message_id),
         auth.uid()
       )
  );

DROP POLICY IF EXISTS "Users can insert own reactions" ON message_reactions;
CREATE POLICY "Users can insert own reactions"
  ON message_reactions FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (
      message_type != 'conversation'
      OR is_conversation_participant(
           (SELECT conversation_id FROM conversation_messages WHERE id = message_reactions.message_id),
           auth.uid()
         )
    )
  );

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply', 'contract_signed',
    'project_message_reaction', 'task_message_reaction', 'quote_message_reaction',
    'direct_message', 'preprod_mention', 'preprod_message', 'preprod_message_reaction',
    'conversation_message_reaction'
  ));

-- Utvid message-reaction-varsling (093/127) med conversation-grenen
CREATE OR REPLACE FUNCTION notify_message_reaction()
RETURNS TRIGGER AS $$
DECLARE
  owner_id   UUID;
  proj_id    UUID;
  tsk_id     UUID;
  conv_id    UUID;
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
  ELSIF NEW.message_type = 'conversation' THEN
    SELECT sender_id, conversation_id INTO owner_id, conv_id FROM conversation_messages WHERE id = NEW.message_id;
    notif_type := 'conversation_message_reaction';
  END IF;

  -- Ingen melding funnet, eller bruker reagerer på sin egen melding — ikke varsle
  IF owner_id IS NULL OR owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, project_id, task_id, conversation_id, message_preview, sender_name)
  VALUES (owner_id, notif_type, proj_id, tsk_id, conv_id, NEW.emoji, sndr_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
