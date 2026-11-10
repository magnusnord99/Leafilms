-- 197_reference_link_preview_image.sql
--
-- Previewbilde for hver referanselenke ("Live hos kundene") — hentet fra
-- target-nettsidens og:image/twitter:image meta-tag og kopiert inn i
-- Leafilms egen lagring (samme kopier-ikke-referer-mønster som alt annet
-- bildemateriale i appen), ikke en levende hotlink til ekstern side.

ALTER TABLE sales_flyer_reference_links ADD COLUMN preview_image_path text;

CREATE OR REPLACE FUNCTION public.replace_sales_flyer_reference_links(
  p_flyer_id uuid,
  p_links jsonb
) RETURNS void AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM 1 FROM sales_flyers WHERE id = p_flyer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown flyer_id';
  END IF;

  DELETE FROM sales_flyer_reference_links WHERE flyer_id = p_flyer_id;

  INSERT INTO sales_flyer_reference_links (flyer_id, label, url, preview_image_path, order_index)
  SELECT p_flyer_id, item->>'label', item->>'url', item->>'preview_image_path', ord - 1
  FROM jsonb_array_elements(p_links) WITH ORDINALITY AS t(item, ord);

  UPDATE sales_flyers SET updated_at = now(), updated_by = auth.uid() WHERE id = p_flyer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
