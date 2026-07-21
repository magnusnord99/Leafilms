-- Internal conversations must never be exposed to authenticated customer accounts.
-- The original participant-only policies let any authenticated user add themselves
-- to a known conversation UUID, after which they could read and send messages.

DROP POLICY IF EXISTS "Participants can read their conversations" ON conversations;
CREATE POLICY "Staff participants can read their conversations"
  ON conversations FOR SELECT TO authenticated
  USING (
    (SELECT public.is_staff(auth.uid()))
    AND is_conversation_participant(conversations.id, auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated users can create conversations" ON conversations;
CREATE POLICY "Staff can create conversations"
  ON conversations FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff(auth.uid())));

DROP POLICY IF EXISTS "Participants can read participant rows in their conversations"
  ON conversation_participants;
CREATE POLICY "Staff participants can read participant rows"
  ON conversation_participants FOR SELECT TO authenticated
  USING (
    (SELECT public.is_staff(auth.uid()))
    AND is_conversation_participant(conversation_participants.conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "Users can add themselves as a participant" ON conversation_participants;
CREATE POLICY "Staff can add themselves as a participant"
  ON conversation_participants FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_staff(auth.uid()))
    AND profile_id = auth.uid()
  );

DROP POLICY IF EXISTS "Participants can read messages in their conversations"
  ON conversation_messages;
CREATE POLICY "Staff participants can read messages"
  ON conversation_messages FOR SELECT TO authenticated
  USING (
    (SELECT public.is_staff(auth.uid()))
    AND is_conversation_participant(conversation_messages.conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS "Participants can send messages in their conversations"
  ON conversation_messages;
CREATE POLICY "Staff participants can send messages"
  ON conversation_messages FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_staff(auth.uid()))
    AND sender_id = auth.uid()
    AND is_conversation_participant(conversation_messages.conversation_id, auth.uid())
  );
