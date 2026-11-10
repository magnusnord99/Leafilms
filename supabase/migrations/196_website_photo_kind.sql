-- 196_website_photo_kind.sql
--
-- Ny kind 'website_photo' på quote_package_showcase_items — egne bilder som
-- vises inni "Se mer"-modalens nettside-mock (sammen med hovedvideoen), helt
-- separat fra de andre pakke-eksempelbildene ('photo', vist som en stack).
-- Alltid bilde (aldri video), samme CHECK-mønster som 'photo' i migrasjon 193.

ALTER TABLE quote_package_showcase_items DROP CONSTRAINT quote_package_showcase_kind_media_type_check;
ALTER TABLE quote_package_showcase_items DROP CONSTRAINT quote_package_showcase_items_kind_check;

ALTER TABLE quote_package_showcase_items ADD CONSTRAINT quote_package_showcase_items_kind_check
  CHECK (kind IN ('main_video', 'social_clip', 'photo', 'website_photo'));

ALTER TABLE quote_package_showcase_items ADD CONSTRAINT quote_package_showcase_kind_media_type_check CHECK (
  (kind = 'main_video' AND media_type = 'video') OR
  (kind = 'photo' AND media_type = 'image') OR
  (kind = 'website_photo' AND media_type = 'image') OR
  (kind = 'social_clip')
);

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

  IF p_kind NOT IN ('main_video', 'social_clip', 'photo', 'website_photo') THEN
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
