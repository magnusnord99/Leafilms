-- 094_direct_messages.sql
-- Direktemeldinger mellom teammedlemmer. conversations/conversation_participants er
-- delt fra direct_messages slik at gruppesamtaler kan legges til senere (flere
-- deltaker-rader) uten skjemaendring — v1 bruker den kun til 1:1.
--
-- I motsetning til project_messages/quote_messages (som er lesbare for alle
-- autentiserte, siden prosjektarbeid er delt) er DM-er private: RLS begrenser
-- lesing til deltakere i samtalen.

CREATE TABLE IF NOT EXISTS conversations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_profile ON conversation_participants(profile_id);

CREATE TABLE IF NOT EXISTS direct_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       UUID        NOT NULL REFERENCES profiles(id),
  content         TEXT        NOT NULL CHECK (char_length(content) > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON direct_messages(conversation_id, created_at);

-- RLS
--
-- conversation_participants can't reference itself inside its own policy's USING
-- clause (SELECT ... FROM conversation_participants) — Postgres applies the same
-- policy recursively to that inner scan and errors with "infinite recursion
-- detected in policy". The standard fix (per Supabase's RLS docs) is a
-- SECURITY DEFINER helper: it runs as the function owner, which bypasses RLS
-- for its internal query, breaking the recursion.
CREATE OR REPLACE FUNCTION is_conversation_participant(p_conversation_id UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id AND profile_id = p_profile_id
  );
$$;

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read their conversations"
  ON conversations FOR SELECT TO authenticated
  USING (is_conversation_participant(conversations.id, auth.uid()));

CREATE POLICY "Authenticated users can create conversations"
  ON conversations FOR INSERT TO authenticated
  WITH CHECK (true);

ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read participant rows in their conversations"
  ON conversation_participants FOR SELECT TO authenticated
  USING (is_conversation_participant(conversation_participants.conversation_id, auth.uid()));

CREATE POLICY "Users can add themselves as a participant"
  ON conversation_participants FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read messages in their conversations"
  ON direct_messages FOR SELECT TO authenticated
  USING (is_conversation_participant(direct_messages.conversation_id, auth.uid()));

CREATE POLICY "Participants can send messages in their conversations"
  ON direct_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_conversation_participant(direct_messages.conversation_id, auth.uid())
  );

-- Realtime, samme mønster som project_messages/task_messages (081_message_mentions.sql)
ALTER TABLE direct_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
EXCEPTION WHEN SQLSTATE '42710' THEN
  NULL;
END$$;

-- notifications: gjør prosjekt-kobling valgfri og legg til samtale-kobling + ny type
ALTER TABLE notifications ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_conversation ON notifications(conversation_id);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply', 'contract_signed',
    'project_message_reaction', 'task_message_reaction', 'quote_message_reaction',
    'direct_message'
  ));

CREATE OR REPLACE FUNCTION notify_direct_message()
RETURNS TRIGGER AS $$
DECLARE
  rec       RECORD;
  sndr_name TEXT;
  preview   TEXT;
BEGIN
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.sender_id;
  preview := left(NEW.content, 80);

  FOR rec IN
    SELECT cp.profile_id
    FROM conversation_participants cp
    WHERE cp.conversation_id = NEW.conversation_id
      AND cp.profile_id != NEW.sender_id
  LOOP
    INSERT INTO notifications (user_id, type, conversation_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'direct_message', NEW.conversation_id, preview, sndr_name);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_direct_message ON direct_messages;
CREATE TRIGGER trg_notify_direct_message
AFTER INSERT ON direct_messages
FOR EACH ROW EXECUTE FUNCTION notify_direct_message();
