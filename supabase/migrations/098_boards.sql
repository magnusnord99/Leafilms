-- 098_boards.sql
-- Boards: intern Milanote-erstatning for preproduksjon.
-- Spec: docs/superpowers/specs/2026-07-13-boards-milanote-design.md
-- Tre tabeller (boards, board_cards, board_edges), staff-RLS, realtime og
-- storage-bucket for opplastede bilder/video.

CREATE TABLE IF NOT EXISTS boards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT 'Board',
  share_token     TEXT UNIQUE,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ett rotboard per prosjekt
CREATE UNIQUE INDEX IF NOT EXISTS idx_boards_root_per_project
  ON boards(project_id) WHERE parent_board_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_boards_parent ON boards(parent_board_id);
CREATE INDEX IF NOT EXISTS idx_boards_share_token ON boards(share_token) WHERE share_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS board_cards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('note','image','video','link','color','todo','column','board')),
  x          DOUBLE PRECISION NOT NULL DEFAULT 0,
  y          DOUBLE PRECISION NOT NULL DEFAULT 0,
  width      DOUBLE PRECISION,
  z_index    INTEGER NOT NULL DEFAULT 0,
  column_id  UUID REFERENCES board_cards(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  content    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_cards_board  ON board_cards(board_id);
CREATE INDEX IF NOT EXISTS idx_board_cards_column ON board_cards(column_id) WHERE column_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS board_edges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  from_card_id UUID NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  to_card_id   UUID NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  label        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_edges_board ON board_edges(board_id);

-- ---------------------------------------------------------------------------
-- RLS: interne staff-roller har full tilgang. Offentlig deling leses
-- server-side med service-klient, så ingen anon-policies.
-- ---------------------------------------------------------------------------
ALTER TABLE boards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_edges ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'boards' AND policyname = 'staff full access boards') THEN
    EXECUTE 'CREATE POLICY "staff full access boards" ON boards FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'board_cards' AND policyname = 'staff full access board_cards') THEN
    EXECUTE 'CREATE POLICY "staff full access board_cards" ON board_cards FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'board_edges' AND policyname = 'staff full access board_edges') THEN
    EXECUTE 'CREATE POLICY "staff full access board_edges" ON board_edges FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()))';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Realtime (mønster: 064_notifications_realtime.sql / 094_direct_messages.sql)
-- REPLICA IDENTITY FULL kreves for at DELETE-events skal bære board_id-filteret.
-- ---------------------------------------------------------------------------
ALTER TABLE board_cards REPLICA IDENTITY FULL;
ALTER TABLE board_edges REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'board_cards') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE board_cards;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'board_edges') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE board_edges;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Storage: offentlig bucket for bilder/video på boards (50 MB per fil)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'board-images', 'board-images', true, 52428800,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'board images staff insert') THEN
    EXECUTE 'CREATE POLICY "board images staff insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''board-images'' AND public.is_staff(auth.uid()))';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'board images staff delete') THEN
    EXECUTE 'CREATE POLICY "board images staff delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''board-images'' AND public.is_staff(auth.uid()))';
  END IF;
END$$;
