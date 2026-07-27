-- 118_board_comments.sql
-- Kommentartråder festet til board_cards, med @mentions og varsler.
-- Spec: docs/superpowers/specs/2026-07-22-board-comments-design.md

CREATE TABLE IF NOT EXISTS board_comment_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  card_id     UUID NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved    BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Én tråd per kort — legges lazy ved første kommentar (se postBoardComment)
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_comment_threads_card ON board_comment_threads(card_id);
CREATE INDEX IF NOT EXISTS idx_board_comment_threads_board ON board_comment_threads(board_id);

CREATE TABLE IF NOT EXISTS board_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES board_comment_threads(id) ON DELETE CASCADE,
  board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  mentions   UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_comments_thread ON board_comments(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_board_comments_board ON board_comments(board_id);

-- RLS: staff-only (matcher harden-mønsteret for boards; se også 124_harden_board_comments_rls.sql)
ALTER TABLE board_comment_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_comments        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access board_comment_threads" ON board_comment_threads;
DROP POLICY IF EXISTS "staff full access board_comment_threads" ON board_comment_threads;
CREATE POLICY "staff full access board_comment_threads"
  ON board_comment_threads
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "authenticated full access board_comments" ON board_comments;
DROP POLICY IF EXISTS "staff full access board_comments" ON board_comments;
CREATE POLICY "staff full access board_comments"
  ON board_comments
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Realtime (mønster: 098_boards.sql)
ALTER TABLE board_comment_threads REPLICA IDENTITY FULL;
ALTER TABLE board_comments        REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'board_comment_threads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE board_comment_threads;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'board_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE board_comments;
  END IF;
END$$;

-- Varsler: nye kolonner + typer
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES boards(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS board_card_id UUID REFERENCES board_cards(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply', 'contract_signed',
    'project_message_reaction', 'task_message_reaction', 'quote_message_reaction',
    'resale_assigned', 'direct_message',
    'board_comment_mention', 'board_comment_reply'
  ));

-- Trigger: mentions + varsel til tråd-starter ved svar (speiler notify_task_message, 056_notifications.sql)
CREATE OR REPLACE FUNCTION notify_board_comment()
RETURNS TRIGGER AS $$
DECLARE
  rec       RECORD;
  preview   TEXT;
  thr       RECORD;
  proj_id   UUID;
  sndr_name TEXT;
BEGIN
  preview := left(NEW.content, 80);
  SELECT t.id, t.created_by, t.card_id, b.project_id
    INTO thr
    FROM board_comment_threads t
    JOIN boards b ON b.id = t.board_id
    WHERE t.id = NEW.thread_id;
  proj_id := thr.project_id;
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.author_id;

  -- Mentions (uansett om personen også er tråd-starter)
  FOR rec IN
    SELECT DISTINCT m AS profile_id FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.author_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, board_id, board_card_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'board_comment_mention', proj_id, NEW.board_id, thr.card_id, preview, sndr_name);
  END LOOP;

  -- Tråd-starter, hvis ikke allerede varslet via mention over
  IF thr.created_by IS NOT NULL AND thr.created_by != NEW.author_id
     AND thr.created_by != ALL(NEW.mentions) THEN
    INSERT INTO notifications (user_id, type, project_id, board_id, board_card_id, message_preview, sender_name)
    VALUES (thr.created_by, 'board_comment_reply', proj_id, NEW.board_id, thr.card_id, preview, sndr_name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_board_comment ON board_comments;
CREATE TRIGGER trg_notify_board_comment
AFTER INSERT ON board_comments
FOR EACH ROW EXECUTE FUNCTION notify_board_comment();
