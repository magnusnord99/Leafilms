-- 180_gallery_review_pins.sql
-- Punkt-kommentarer på leverings-galleri-bilder: reviewer klikker et sted på
-- bildet og legger en kommentar der ("gjør dette lysere" rett ved flekken),
-- i stedet for ett fritekstfelt pr. bilde (gallery_review_marks.note).
-- x_pct/y_pct er prosent av bildets bredde/høyde (0-100) slik at punktet
-- følger bildet uansett skjermstørrelse. Nullstilles pr. review-runde,
-- samme mønster som gallery_review_marks.

CREATE TABLE IF NOT EXISTS gallery_review_pins (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id   UUID        NOT NULL REFERENCES gallery_reviews(id) ON DELETE CASCADE,
  image_id    UUID        NOT NULL REFERENCES selection_images(id) ON DELETE CASCADE,
  x_pct       NUMERIC     NOT NULL CHECK (x_pct >= 0 AND x_pct <= 100),
  y_pct       NUMERIC     NOT NULL CHECK (y_pct >= 0 AND y_pct <= 100),
  text        TEXT        NOT NULL,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_review_pins_review_image ON gallery_review_pins(review_id, image_id);

ALTER TABLE gallery_review_pins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'gallery_review_pins' AND policyname = 'authenticated full access gallery_review_pins'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated full access gallery_review_pins" ON gallery_review_pins FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;
