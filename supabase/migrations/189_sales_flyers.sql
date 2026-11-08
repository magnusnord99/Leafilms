-- 189_sales_flyers.sql
--
-- Digitale flyers: en eksisterende Leafilms-kunde kan sende en flyer videre
-- til sine egne kontakter (selger på Leafilms sine vegne), med pakkepriser
-- hentet fra faktiske, merkede tilbud (se migrasjon 190) i stedet for en
-- egen, parallell prisliste. Se docs/superpowers/specs/
-- 2026-11-08-sales-flyers-design.md ("Datamodell" + "Trafikk-statistikk").
--
-- RLS-mønster: samme som industry_landing_pages (migrasjon 174) — staff full
-- tilgang (inkl. upubliserte kladder, for forhåndsvisning), og offentlig
-- lesing (anon OG authenticated) kun for published = true. sales_flyer_views
-- er staff-read-only; innsetting skjer utelukkende server-side via
-- service-klient (Task 11), som går forbi RLS helt — derfor ingen
-- INSERT/public-policy her.

CREATE TABLE sales_flyers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text NOT NULL UNIQUE,
  published         boolean NOT NULL DEFAULT false,
  meta_title        text NOT NULL DEFAULT '',
  meta_description  text NOT NULL DEFAULT '',
  hero_video_path   text,
  hero_poster_path  text,
  headline          text NOT NULL DEFAULT '',
  engagement_text   text NOT NULL DEFAULT '',   -- kort "hvorfor godt innhold engasjerer"
  cta_headline      text NOT NULL DEFAULT '',
  cta_subtext       text NOT NULL DEFAULT '',
  cta_email         text NOT NULL DEFAULT '',   -- bevisst INGEN default post@leafilms.no
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE sales_flyer_cases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flyer_id      uuid NOT NULL REFERENCES sales_flyers(id) ON DELETE CASCADE,
  case_study_id uuid NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
  order_index   integer NOT NULL DEFAULT 0,
  UNIQUE (flyer_id, case_study_id)
);

CREATE TABLE sales_flyer_packages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flyer_id    uuid NOT NULL REFERENCES sales_flyers(id) ON DELETE CASCADE,
  quote_id    uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  UNIQUE (flyer_id, quote_id)
);

CREATE TABLE sales_flyer_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flyer_id   uuid NOT NULL REFERENCES sales_flyers(id) ON DELETE CASCADE,
  viewed_at  timestamptz NOT NULL DEFAULT now(),
  referrer   text
);
CREATE INDEX sales_flyer_views_flyer_id_idx ON sales_flyer_views (flyer_id, viewed_at);

ALTER TABLE sales_flyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_flyer_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_flyer_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_flyer_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_sales_flyer_views" ON sales_flyer_views
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
-- Ingen INSERT/public-policy: innsetting skjer utelukkende server-side via service-klient.

-- Staff full tilgang, samme mønster som industry_landing_pages
CREATE POLICY "staff_all_sales_flyers" ON sales_flyers
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_all_sales_flyer_cases" ON sales_flyer_cases
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_all_sales_flyer_packages" ON sales_flyer_packages
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Offentlig lesetilgang kun for publiserte flyers (anon OG authenticated,
-- samme begrunnelse som industry_landing_pages: en innlogget kunde skal se
-- akkurat det en anonym besøkende ser)
CREATE POLICY "public_read_published_sales_flyers" ON sales_flyers
  FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "public_read_sales_flyer_cases_for_published" ON sales_flyer_cases
  FOR SELECT TO anon, authenticated
  USING (flyer_id IN (SELECT id FROM sales_flyers WHERE published = true));
CREATE POLICY "public_read_sales_flyer_packages_for_published" ON sales_flyer_packages
  FOR SELECT TO anon, authenticated
  USING (flyer_id IN (SELECT id FROM sales_flyers WHERE published = true));
