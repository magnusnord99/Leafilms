-- 194_sales_flyer_reference_links.sql
--
-- Referanselenker på en salgsflyer: eksterne nettsider Leafilms har levert
-- innhold til (f.eks. Asker Tennis), vist som egen seksjon slik mottakeren
-- kan se "hvordan det blir med bra innhold" i praksis — fritekst (navn + URL),
-- IKKE en kobling til et internt bibliotek (motsatt av sales_flyer_cases/
-- sales_flyer_packages, se 189_sales_flyers.sql). Samme RLS-mønster som
-- disse: staff full tilgang, offentlig lesing kun for publiserte flyers.
--
-- replace_sales_flyer_reference_links (atomisk hele-liste-erstatning, samme
-- begrunnelse som replace_sales_flyer_cases i 191_sales_flyer_replace_rpcs.sql)
-- tar et jsonb-array i stedet for en uuid[] siden lenkene er fritekst, ikke
-- referanse-id-er inn mot en annen tabell — hele raden (inkl. id)
-- regenereres ved hver lagring, noe som er trygt siden ingenting annet
-- refererer til disse radenes id-er.

CREATE TABLE sales_flyer_reference_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flyer_id    uuid NOT NULL REFERENCES sales_flyers(id) ON DELETE CASCADE,
  label       text NOT NULL,
  url         text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sales_flyer_reference_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all_sales_flyer_reference_links" ON sales_flyer_reference_links
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "public_read_sales_flyer_reference_links_for_published" ON sales_flyer_reference_links
  FOR SELECT TO anon, authenticated
  USING (flyer_id IN (SELECT id FROM sales_flyers WHERE published = true));

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

  INSERT INTO sales_flyer_reference_links (flyer_id, label, url, order_index)
  SELECT p_flyer_id, item->>'label', item->>'url', ord - 1
  FROM jsonb_array_elements(p_links) WITH ORDINALITY AS t(item, ord);

  UPDATE sales_flyers SET updated_at = now(), updated_by = auth.uid() WHERE id = p_flyer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
