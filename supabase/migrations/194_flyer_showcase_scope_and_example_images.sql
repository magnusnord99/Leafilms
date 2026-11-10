-- 194_flyer_showcase_scope_and_example_images.sql
--
-- Del 1: eksempelmedia for pakke-showcase blir unikt per flyer (ikke bare
-- per tilbud) — samme pakke kan nå vise forskjellig hovedvideo/klipp/bilder
-- på to forskjellige flyers. Avbryter i stedet for å slette blindt hvis
-- tabellen allerede har rader (se docs/superpowers/specs/
-- 2026-11-09-flyer-showcase-relocation-and-example-images-design.md).
--
-- Del 2: ny "Eksempelbilder"-seksjon på flyeren — 8 faste bilde-kolonner i
-- et fast asymmetrisk rutenett (samme mønster som BTS-bildene i 192, ikke
-- en ordnet liste).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM quote_package_showcase_items LIMIT 1) THEN
    RAISE EXCEPTION 'quote_package_showcase_items har eksisterende rader — avbryter i stedet for å slette blindt. Avklar med Magnus før denne migrasjonen kjøres på nytt.';
  END IF;
END $$;

ALTER TABLE quote_package_showcase_items ADD COLUMN flyer_id uuid NOT NULL REFERENCES sales_flyers(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS quote_package_showcase_items_quote_id_idx;
CREATE INDEX quote_package_showcase_items_flyer_quote_idx ON quote_package_showcase_items (flyer_id, quote_id, kind, order_index);

DROP FUNCTION IF EXISTS public.replace_quote_package_showcase_items(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.replace_quote_package_showcase_items(
  p_quote_id uuid,
  p_flyer_id uuid,
  p_kind text,
  p_items jsonb
) RETURNS void AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_kind NOT IN ('main_video', 'social_clip', 'photo') THEN
    RAISE EXCEPTION 'unknown kind';
  END IF;

  PERFORM 1 FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown quote_id';
  END IF;

  PERFORM 1 FROM sales_flyers WHERE id = p_flyer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown flyer_id';
  END IF;

  DELETE FROM quote_package_showcase_items WHERE quote_id = p_quote_id AND flyer_id = p_flyer_id AND kind = p_kind;

  INSERT INTO quote_package_showcase_items (quote_id, flyer_id, kind, media_type, path, caption, order_index)
  SELECT p_quote_id, p_flyer_id, p_kind, item->>'media_type', item->>'path', item->>'caption', ord - 1
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ord);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE sales_flyers ADD COLUMN example_image_1_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_2_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_3_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_4_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_5_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_6_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_7_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_8_path text;
