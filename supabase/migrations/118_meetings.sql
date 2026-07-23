-- 118_meetings.sql
-- Interne møter mellom kollegaer (ikke å forveksle med pipeline-steget "møte",
-- som er en salgs-fase for leads/kunder). Møtelenke er foreløpig ren manuell
-- tekst — ingen integrasjon mot ekstern kalender/videotjeneste ennå.

CREATE TABLE IF NOT EXISTS meetings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  starts_at     TIMESTAMPTZ NOT NULL,
  ends_at       TIMESTAMPTZ,
  meeting_link  TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_organizer ON meetings(organizer_id);
CREATE INDEX IF NOT EXISTS idx_meetings_starts_at ON meetings(starts_at);

CREATE TABLE IF NOT EXISTS meeting_participants (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id    UUID        NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  profile_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meeting_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_meeting_participants_meeting ON meeting_participants(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_participants_profile ON meeting_participants(profile_id);

-- RLS
--
-- Samme SECURITY DEFINER-mønster som is_conversation_participant (094_direct_messages.sql):
-- meeting_participants kan ikke referere seg selv i sin egen policy uten uendelig rekursjon.
CREATE OR REPLACE FUNCTION is_meeting_participant(p_meeting_id UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM meeting_participants
    WHERE meeting_id = p_meeting_id AND profile_id = p_profile_id
  );
$$;

ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizer and participants can read meetings"
  ON meetings FOR SELECT TO authenticated
  USING (organizer_id = auth.uid() OR is_meeting_participant(meetings.id, auth.uid()));

-- Admin trenger å se alles møter for person-filteret i /admin/calendar (is_admin
-- finnes allerede fra 019_enable_rls_all_tables.sql). Flere permissive SELECT-policyer
-- kombineres med OR i Postgres RLS, så dette legger seg oppå policyen over.
CREATE POLICY "Admins can read all meetings"
  ON meetings FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can create meetings"
  ON meetings FOR INSERT TO authenticated
  WITH CHECK (organizer_id = auth.uid());

CREATE POLICY "Organizer can update own meetings"
  ON meetings FOR UPDATE TO authenticated
  USING (organizer_id = auth.uid());

CREATE POLICY "Organizer can delete own meetings"
  ON meetings FOR DELETE TO authenticated
  USING (organizer_id = auth.uid());

ALTER TABLE meeting_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Organizer and participants can read participant rows"
  ON meeting_participants FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_participants.meeting_id AND m.organizer_id = auth.uid())
  );

CREATE POLICY "Organizer can invite participants"
  ON meeting_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_participants.meeting_id AND m.organizer_id = auth.uid())
  );

CREATE POLICY "Participant can update own status, organizer can update any"
  ON meeting_participants FOR UPDATE TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_participants.meeting_id AND m.organizer_id = auth.uid())
  );

CREATE POLICY "Organizer can remove participants"
  ON meeting_participants FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_participants.meeting_id AND m.organizer_id = auth.uid())
  );

CREATE POLICY "Admins can read all meeting_participants"
  ON meeting_participants FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- notifications: møte-kobling + nye typer
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES meetings(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notifications_meeting ON notifications(meeting_id);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply', 'contract_signed',
    'project_message_reaction', 'task_message_reaction', 'quote_message_reaction',
    'resale_assigned', 'direct_message',
    'meeting_invite', 'meeting_response'
  ));

-- Trigger: møteinvitasjon (ved insert i meeting_participants)
CREATE OR REPLACE FUNCTION notify_meeting_invite()
RETURNS TRIGGER AS $$
DECLARE
  org_name TEXT;
  mtg_title TEXT;
BEGIN
  SELECT COALESCE(p.name, p.email, 'Ukjent'), m.title
    INTO org_name, mtg_title
    FROM meetings m JOIN profiles p ON p.id = m.organizer_id
    WHERE m.id = NEW.meeting_id;

  INSERT INTO notifications (user_id, type, meeting_id, message_preview, sender_name)
  VALUES (NEW.profile_id, 'meeting_invite', NEW.meeting_id, mtg_title, org_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_meeting_invite ON meeting_participants;
CREATE TRIGGER trg_notify_meeting_invite
AFTER INSERT ON meeting_participants
FOR EACH ROW EXECUTE FUNCTION notify_meeting_invite();

-- Trigger: svar på møteinvitasjon (ved statusendring) → varsler organisator
CREATE OR REPLACE FUNCTION notify_meeting_response()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  responder_name TEXT;
  mtg_title TEXT;
BEGIN
  IF NEW.status = OLD.status OR NEW.status = 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT m.organizer_id, m.title INTO org_id, mtg_title FROM meetings m WHERE m.id = NEW.meeting_id;
  SELECT COALESCE(p.name, p.email, 'Ukjent') INTO responder_name FROM profiles p WHERE p.id = NEW.profile_id;

  IF org_id IS NOT NULL AND org_id != NEW.profile_id THEN
    INSERT INTO notifications (user_id, type, meeting_id, message_preview, sender_name)
    VALUES (
      org_id, 'meeting_response', NEW.meeting_id,
      mtg_title || ' — ' || CASE NEW.status WHEN 'accepted' THEN 'godtatt' ELSE 'avslått' END,
      responder_name
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_meeting_response ON meeting_participants;
CREATE TRIGGER trg_notify_meeting_response
AFTER UPDATE ON meeting_participants
FOR EACH ROW EXECUTE FUNCTION notify_meeting_response();
