-- 131_gallery_reviews.sql
-- Intern review av et galleri før kunde-tilgang. En reviewer velges fritt hver gang
-- (ingen fast reviewer bundet til galleri/prosjekt), går gjennom bildene, velger
-- ut/velger bort, og godkjenner eller ber om endringer. Så lenge siste runde for et
-- galleri er 'pending' eller 'changes_requested', sperres kunde-tilgang (både
-- hoved-gallerilenken og alle album-lenker under galleriet).

CREATE TABLE IF NOT EXISTS gallery_reviews (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id    UUID        NOT NULL REFERENCES selection_galleries(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changes_requested')),
  requested_by  UUID        NOT NULL REFERENCES auth.users(id),
  reviewer_id   UUID        NOT NULL REFERENCES auth.users(id),
  comment       TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_reviews_gallery ON gallery_reviews(gallery_id, created_at DESC);

ALTER TABLE gallery_reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'gallery_reviews' AND policyname = 'authenticated full access gallery_reviews'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated full access gallery_reviews" ON gallery_reviews FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- Reviewers valg per bilde for én bestemt runde. 'note' er strengt internt — vises
-- aldri til kunden (i motsetning til image_comments, som kundens galleri-visning leser).
CREATE TABLE IF NOT EXISTS gallery_review_marks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   UUID        NOT NULL REFERENCES gallery_reviews(id) ON DELETE CASCADE,
  image_id    UUID        NOT NULL REFERENCES selection_images(id) ON DELETE CASCADE,
  keep        BOOLEAN     NOT NULL DEFAULT true,
  note        TEXT,
  UNIQUE(review_id, image_id)
);

CREATE INDEX IF NOT EXISTS idx_gallery_review_marks_review ON gallery_review_marks(review_id);

ALTER TABLE gallery_review_marks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'gallery_review_marks' AND policyname = 'authenticated full access gallery_review_marks'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated full access gallery_review_marks" ON gallery_review_marks FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- Myk skjuling — bildet blir stående i galleriet (admin ser det, tydelig merket),
-- men filtreres bort fra alt kunden kan se. Reversibelt, i motsetning til faktisk
-- sletting (removeImage/purgeGalleryImages), som er en egen, eksisterende handling.
ALTER TABLE selection_images ADD COLUMN IF NOT EXISTS hidden_from_client BOOLEAN NOT NULL DEFAULT false;

-- Kobling fra varsel til galleri/review-runde, slik at varselklikk kan rute rett
-- til reviewer-siden uansett om galleriet er knyttet til et prosjekt eller ikke.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS gallery_id UUID REFERENCES selection_galleries(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS gallery_review_id UUID REFERENCES gallery_reviews(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention', 'quote_message',
    'feedback_reply', 'contract_signed', 'project_message_reaction', 'task_message_reaction',
    'quote_message_reaction', 'resale_assigned', 'direct_message', 'meeting_invite',
    'meeting_response', 'board_comment_mention', 'board_comment_reply',
    'pitch_review_requested', 'pitch_review_responded',
    'quote_review_requested', 'quote_review_responded',
    'preprod_mention', 'preprod_message', 'preprod_message_reaction', 'conversation_message_reaction',
    'gallery_review_requested', 'gallery_review_responded'
  ));
