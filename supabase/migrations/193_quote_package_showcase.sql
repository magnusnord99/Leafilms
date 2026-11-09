-- 193_quote_package_showcase.sql
--
-- Eksempelmedia for en pakke-mals "Se mer"-visning på flyeren, se
-- docs/superpowers/specs/2026-11-09-flyer-package-showcase-design.md.
-- Samme atomiske replace-RPC-mønster som replace_sales_flyer_packages
-- (migrasjon 191): en funksjonskropp er implisitt én transaksjon, SELECT ...
-- FOR UPDATE på foreldre-raden (quotes) serialiserer samtidige replace-kall
-- for samme pakke, og et ukjent quote_id blir eksplisitt avvist i stedet for
-- et stille no-op. Ingen public/anon-policy — flyer-siden leser dette
-- server-side via service-klient (se Task 5).

CREATE TABLE quote_package_showcase_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('main_video', 'social_clip', 'photo')),
  media_type  text NOT NULL CHECK (media_type IN ('image', 'video')),
  path        text NOT NULL,
  caption     text,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_package_showcase_kind_media_type_check CHECK (
    (kind = 'main_video' AND media_type = 'video') OR
    (kind = 'photo' AND media_type = 'image') OR
    (kind = 'social_clip')
  )
);
CREATE INDEX quote_package_showcase_items_quote_id_idx ON quote_package_showcase_items (quote_id, kind, order_index);

ALTER TABLE quote_package_showcase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all_quote_package_showcase_items" ON quote_package_showcase_items
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
-- Ingen public/anon-policy — flyer-siden leser via service-klient, se Task 5.

CREATE OR REPLACE FUNCTION public.replace_quote_package_showcase_items(
  p_quote_id uuid,
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

  DELETE FROM quote_package_showcase_items WHERE quote_id = p_quote_id AND kind = p_kind;

  INSERT INTO quote_package_showcase_items (quote_id, kind, media_type, path, caption, order_index)
  SELECT p_quote_id, p_kind, item->>'media_type', item->>'path', item->>'caption', ord - 1
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ord);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
