-- 067_selection_albums.sql

CREATE TABLE IF NOT EXISTS selection_albums (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id         UUID        NOT NULL REFERENCES selection_galleries(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  slug               TEXT        NOT NULL,
  sort_order         INTEGER     NOT NULL DEFAULT 0,
  album_token        TEXT        UNIQUE,
  album_pin_code     TEXT,
  album_target_count INTEGER,
  album_status       TEXT        NOT NULL DEFAULT 'open'
                     CHECK (album_status IN ('open', 'submitted')),
  album_submitted_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(gallery_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_selection_albums_gallery
  ON selection_albums(gallery_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_selection_albums_token
  ON selection_albums(album_token) WHERE album_token IS NOT NULL;

ALTER TABLE selection_images
  ADD COLUMN IF NOT EXISTS album_id UUID
  REFERENCES selection_albums(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_selection_images_album
  ON selection_images(album_id, sort_order);

CREATE TABLE IF NOT EXISTS selection_album_picks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id    UUID        NOT NULL REFERENCES selection_albums(id) ON DELETE CASCADE,
  image_id    UUID        NOT NULL REFERENCES selection_images(id) ON DELETE CASCADE,
  selected    BOOLEAN     NOT NULL DEFAULT false,
  selected_at TIMESTAMPTZ,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(album_id, image_id)
);

CREATE INDEX IF NOT EXISTS idx_selection_album_picks_album
  ON selection_album_picks(album_id);

ALTER TABLE selection_album_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_albums      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated full access albums"
  ON selection_albums FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated full access album picks"
  ON selection_album_picks FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
