-- 200_repoint_package_links.sql
--
-- sales_flyer_packages og quote_package_showcase_items pekte på quotes(id)
-- fordi en pakke tidligere VAR et tilbud (migrasjon 189/193). Nå som pakke-
-- dataen er flyttet til en egen packages-tabell (migrasjon 199, med samme
-- id-er bevart), peker begge lenketabellene om til packages(id) i stedet —
-- kolonnen omdøpes samtidig (quote_id -> package_id) for å reflektere det.
-- Må kjøres FØR 201_package_offers_cleanup.sql sletter de gamle quotes-radene
-- (som ellers ville cascade-slettet disse lenkene mens de fortsatt pekte på
-- quotes(id)).

ALTER TABLE sales_flyer_packages RENAME COLUMN quote_id TO package_id;
ALTER TABLE sales_flyer_packages DROP CONSTRAINT sales_flyer_packages_quote_id_fkey;
ALTER TABLE sales_flyer_packages ADD CONSTRAINT sales_flyer_packages_package_id_fkey
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE;

ALTER TABLE quote_package_showcase_items RENAME COLUMN quote_id TO package_id;
ALTER TABLE quote_package_showcase_items DROP CONSTRAINT quote_package_showcase_items_quote_id_fkey;
ALTER TABLE quote_package_showcase_items ADD CONSTRAINT quote_package_showcase_items_package_id_fkey
  FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE;

-- Begge replace-RPC-ene må skrives om fra bunnen (DROP+CREATE, ikke bare
-- CREATE OR REPLACE) siden parameternavnene endres — samme mønster som 194
-- brukte for replace_quote_package_showcase_items da flyer_id ble lagt til.

DROP FUNCTION IF EXISTS public.replace_sales_flyer_packages(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.replace_sales_flyer_packages(
  p_flyer_id uuid,
  p_package_ids uuid[]
) RETURNS void AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM 1 FROM sales_flyers WHERE id = p_flyer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown flyer_id';
  END IF;

  DELETE FROM sales_flyer_packages WHERE flyer_id = p_flyer_id;

  INSERT INTO sales_flyer_packages (flyer_id, package_id, order_index)
  SELECT p_flyer_id, id, ord - 1
  FROM unnest(p_package_ids) WITH ORDINALITY AS t(id, ord);

  UPDATE sales_flyers SET updated_at = now(), updated_by = auth.uid() WHERE id = p_flyer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP FUNCTION IF EXISTS public.replace_quote_package_showcase_items(uuid, uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.replace_quote_package_showcase_items(
  p_package_id uuid,
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

  PERFORM 1 FROM packages WHERE id = p_package_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown package_id';
  END IF;

  PERFORM 1 FROM sales_flyers WHERE id = p_flyer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown flyer_id';
  END IF;

  DELETE FROM quote_package_showcase_items WHERE package_id = p_package_id AND flyer_id = p_flyer_id AND kind = p_kind;

  INSERT INTO quote_package_showcase_items (package_id, flyer_id, kind, media_type, path, caption, order_index)
  SELECT p_package_id, p_flyer_id, p_kind, item->>'media_type', item->>'path', item->>'caption', ord - 1
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ord);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
