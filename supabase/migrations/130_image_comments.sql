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

-- RLS: staff only (is_staff). Kundekommentarer går via createServiceClient()
-- (lib/actions/selections.ts / selection-picks.ts) — åpen authenticated FOR ALL
-- lot customer-JWTs CRUD alle kommentarer på tvers av gallerier via PostgREST.
-- Se 143_harden_gallery_reviews_rls.sql.
ALTER TABLE image_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated full access image_comments" ON image_comments;
DROP POLICY IF EXISTS "staff_all_image_comments" ON image_comments;
CREATE POLICY "staff_all_image_comments"
  ON image_comments FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
