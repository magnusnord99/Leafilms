-- 199_package_offers.sql
--
-- Pakketilbud: Kunde (eller intern/Leafilms) -> Pakketilbud -> pakker (f.eks.
-- "Liten pakke"/"Stor pakke"), side ved side som egne rader, ikke som
-- quote-versjoner av hverandre. Erstatter modellen fra migrasjon 190, der en
-- pakke var et vanlig tilbud (quotes-rad) som måtte bo under ett delt, skjult
-- "Leafilms — Pakkemaler"-prosjekt (is_package_template) for å få et
-- project_id — pakker krever ikke lenger noe prosjekt.
--
-- RLS: samme mønster som quotes/quote_package_showcase_items — kun staff
-- (public.is_staff), ingen anon/public-policy. Den offentlige salgsflyeren
-- leser pakker via service-klienten (går forbi RLS), se lib/actions/
-- sales-flyers.ts.

CREATE TABLE package_offers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,  -- NULL = intern (Leafilms)
  title       text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE packages (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_offer_id uuid NOT NULL REFERENCES package_offers(id) ON DELETE CASCADE,
  label            text NOT NULL,
  category         text CHECK (category IN ('foto', 'film', 'foto_film')),  -- NULL = ikke plassert på noen flyer-fane ennå
  display_order    integer NOT NULL DEFAULT 0,
  quote_data       jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX packages_offer_id_idx ON packages (package_offer_id, display_order);

ALTER TABLE package_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all_package_offers" ON package_offers
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_all_packages" ON packages
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
-- Ingen public/anon-policy — flyer-siden leser pakker via service-klienten.

-- Migrer eksisterende pakke-data fra den gamle ghost-prosjekt-modellen, med
-- SAMME id bevart på hver pakke, slik at sales_flyer_packages.quote_id og
-- quote_package_showcase_items.quote_id (begge FK mot quotes(id) i dag)
-- fortsatt treffer riktig rad etter at 200_repoint_package_links.sql peker
-- dem om til packages(id) — ingen ekstra id-oppslag/mapping nødvendig.
WITH new_offer AS (
  INSERT INTO package_offers (customer_id, title)
  VALUES (NULL, 'Interne pakker')
  RETURNING id
)
INSERT INTO packages (id, package_offer_id, label, category, display_order, quote_data, created_at, updated_at, created_by)
SELECT q.id, new_offer.id, q.package_label, q.package_category, q.package_order, q.quote_data, q.created_at, q.updated_at, q.created_by
FROM quotes q, new_offer
WHERE q.package_label IS NOT NULL;
