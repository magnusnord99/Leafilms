-- 174_industry_landing_pages.sql
--
-- Admin-redigerbare bransje-landingssider (/energi, og fremtidige som
-- /bryllup, /sport). I dag er /energi hardkodet i app/energi/page.tsx — hver
-- tekst-/bilde-/case-justering krever en kodeendring + deploy. Dette
-- introduserer én strukturert rad per side (fast mal, redigerbare felter —
-- ikke et fritt seksjons-system, se docs/superpowers/specs/
-- 2026-10-21-industry-landing-pages-cms-design.md) pluss en ordnet liste med
-- referanser til det eksisterende case_studies-biblioteket.
--
-- RLS-mønster: staff full tilgang (inkl. upubliserte kladder, for
-- forhåndsvisning), og offentlig lesing (anon OG authenticated — en
-- innlogget kunde i sin prosjektportal skal se akkurat samme publiserte
-- sider som en utlogget besøkende) kun for published = true.

CREATE TABLE industry_landing_pages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL UNIQUE,
  published           boolean NOT NULL DEFAULT false,
  meta_title          text NOT NULL DEFAULT '',
  meta_description    text NOT NULL DEFAULT '',
  hero_type           text NOT NULL DEFAULT 'video' CHECK (hero_type IN ('video', 'image')),
  hero_video_path     text,
  hero_poster_path    text,
  hero_headline       text NOT NULL DEFAULT '',
  lede_text           text NOT NULL DEFAULT '',
  about_heading       text NOT NULL DEFAULT 'Om oss',
  about_content       text NOT NULL DEFAULT '',
  about_image_path    text,
  cta_headline        text NOT NULL DEFAULT '',
  cta_subtext         text NOT NULL DEFAULT '',
  cta_email           text NOT NULL DEFAULT 'post@leafilms.no',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE industry_landing_page_cases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         uuid NOT NULL REFERENCES industry_landing_pages(id) ON DELETE CASCADE,
  case_study_id   uuid NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
  order_index     integer NOT NULL DEFAULT 0,
  UNIQUE (page_id, case_study_id)
);

CREATE INDEX idx_industry_landing_page_cases_page_id ON industry_landing_page_cases(page_id);

ALTER TABLE industry_landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE industry_landing_page_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all_industry_landing_pages" ON industry_landing_pages
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "staff_all_industry_landing_page_cases" ON industry_landing_page_cases
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "public_read_published_industry_landing_pages" ON industry_landing_pages
  FOR SELECT TO anon, authenticated
  USING (published = true);

CREATE POLICY "public_read_industry_landing_page_cases_for_published" ON industry_landing_page_cases
  FOR SELECT TO anon, authenticated
  USING (page_id IN (SELECT id FROM industry_landing_pages WHERE published = true));

-- Seed: dagens /energi-innhold. about_image_path peker midlertidig på den
-- eksisterende biblioteksfilen — scripts/seed-energi-landing-page-media.ts
-- kjøres rett etter denne migrasjonen og kopierer den til sidens eget
-- lagringsområde (se migrasjonskommentaren i den filen for hvorfor ren SQL
-- ikke kan gjøre dette selv).
INSERT INTO industry_landing_pages (
  slug, published, meta_title, meta_description, hero_type,
  hero_video_path, hero_poster_path, hero_headline, lede_text,
  about_heading, about_content, about_image_path,
  cta_headline, cta_subtext, cta_email
) VALUES (
  'energi', true,
  'Leafilms for energibransjen',
  'Film og foto for norske energiselskaper, fra Leafilms.',
  'video',
  '/energi/hero.mp4',
  '/energi/hero-poster.jpg',
  'Vi filmer selskapene som holder Norge i gang.',
  'Corvus Energy og Statkraft har allerede vist fram arbeidet sitt gjennom oss.',
  'Om oss',
  $about$Vi kjenner industrien. Teamet har vært på anlegg, i produksjonshaller og på byggeplasser i hele landet, og vet hva som kreves av HMS-kurs og sikkerhetsrutiner før kamera i det hele tatt kommer fram. Et kraftverk eller en batterifabrikk er ikke selvforklarende — jobben vår er å gjøre prosessene forståelige og visuelt interessante, for kunder, investorer og fremtidige ansatte. Det gir resultater: kampanjer med film har gitt kundene våre over 140 % mer trafikk til landingssiden, og fire ganger høyere engasjement enn et vanlig tekstinnlegg.

Vi leverer både video — merkefilm, reportasjer fra anlegg og prosjekter, dronefilm, og korte kutt til sosiale medier og internkommunikasjon — og foto: anleggsdokumentasjon, produktbilder, portretter til pressemateriell, og bilder til årsrapport og nettside. Fra opptak til ferdig klipp holder vi tidsfristene dere faktisk trenger. Én tidligere kunde brukte filmen direkte i et vinnende anbud. I dag jobber vi også med Statkraft, Netflix, Breitling, Asics og Vitamin Well.$about$,
  'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/images/511810jjo23.jpg',
  'Klare for å vise fram arbeidet deres?',
  'Send oss noen ord om prosjektet, så tar vi kontakt for en uforpliktende prat.',
  'post@leafilms.no'
);

INSERT INTO industry_landing_page_cases (page_id, case_study_id, order_index)
SELECT
  (SELECT id FROM industry_landing_pages WHERE slug = 'energi'),
  id,
  CASE WHEN title = 'CORVUS ENERGY' THEN 0 ELSE 1 END
FROM case_studies
WHERE title IN ('CORVUS ENERGY', 'STATKRAFT');
