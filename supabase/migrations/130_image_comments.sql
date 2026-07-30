-- 130_image_comments.sql
-- Flere kommentarer per bilde (med valgfritt navn), i stedet for ett
-- overskrivbart felt. Erstatter selection_images.comment og
-- selection_album_picks.comment som skriveflater (kolonnene bli stående
-- urort, men skrives ikke lenger til).

CREATE TABLE IF NOT EXISTS image_comments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id      UUID        NOT NULL REFERENCES selection_images(id) ON DELETE CASCADE,
  text          TEXT        NOT NULL,
  author_name   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_comments_image ON image_comments(image_id, created_at);

ALTER TABLE image_comments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'image_comments' AND policyname = 'authenticated full access image_comments'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated full access image_comments" ON image_comments FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;
