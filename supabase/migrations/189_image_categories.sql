-- 189_image_categories.sql
-- Kategorier/underkategorier for bildebiblioteket flyttes fra en hardkodet
-- liste (lib/image-categories.ts, som fantes i 3 ulike kopier i koden) til
-- denne tabellen, slik at admin kan opprette/gi nytt navn til kategorier og
-- underkategorier direkte i /admin/images uten kodeendring.
--
-- Seedet med de eksisterende 10 kategoriene + underkategorier, med samme
-- slugs som allerede ligger i images.category/images.subcategory
-- (subcategory lagres som 'kategori-slug/underkategori-slug'), slik at
-- ingen eksisterende bilder mister kategoriseringen sin.

CREATE TABLE IF NOT EXISTS image_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT        NOT NULL,
  label       TEXT        NOT NULL,
  parent_id   UUID        REFERENCES image_categories(id) ON DELETE CASCADE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Slug unikt blant toppnivå-kategorier, og unikt per forelder blant underkategorier
CREATE UNIQUE INDEX IF NOT EXISTS idx_image_categories_top_slug
  ON image_categories(slug) WHERE parent_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_image_categories_sub_slug
  ON image_categories(parent_id, slug) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_image_categories_parent ON image_categories(parent_id);

ALTER TABLE image_categories ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'image_categories' AND policyname = 'authenticated full access image_categories'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated full access image_categories" ON image_categories FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- Seed: toppnivå-kategorier
INSERT INTO image_categories (slug, label, sort_order) VALUES
  ('landskap', 'Landskap', 0),
  ('sport', 'Sport', 1),
  ('closeup', 'Close-up', 2),
  ('portrett', 'Portrett', 3),
  ('event', 'Event', 4),
  ('kommersiell', 'Kommersiell', 5),
  ('abstrakt', 'Abstrakt', 6),
  ('bts', 'BTS', 7),
  ('bryllup', 'Bryllup', 8),
  ('industri', 'Industri/Corporate', 9)
ON CONFLICT DO NOTHING;

-- Seed: underkategorier (label = kapitalisert slug, samme som admin-UI viste før)
INSERT INTO image_categories (slug, label, parent_id, sort_order)
SELECT sub.slug, sub.label, parent.id, sub.sort_order
FROM (VALUES
  ('landskap', 'fjell', 'Fjell', 0),
  ('landskap', 'kyst', 'Kyst', 1),
  ('landskap', 'by', 'By', 2),
  ('landskap', 'natur', 'Natur', 3),
  ('landskap', 'skog', 'Skog', 4),
  ('sport', 'ski', 'Ski', 0),
  ('sport', 'løping', 'Løping', 1),
  ('sport', 'sykkel', 'Sykkel', 2),
  ('sport', 'vannsport', 'Vannsport', 3),
  ('sport', 'klatring', 'Klatring', 4),
  ('sport', 'fotball', 'Fotball', 5),
  ('closeup', 'produkt', 'Produkt', 0),
  ('closeup', 'detalj', 'Detalj', 1),
  ('closeup', 'tekstur', 'Tekstur', 2),
  ('closeup', 'ansikt', 'Ansikt', 3),
  ('portrett', 'enkel', 'Enkel', 0),
  ('portrett', 'gruppe', 'Gruppe', 1),
  ('portrett', 'bedrift', 'Bedrift', 2),
  ('event', 'konsert', 'Konsert', 0),
  ('event', 'konferanse', 'Konferanse', 1),
  ('event', 'festival', 'Festival', 2),
  ('event', 'sport', 'Sport', 3),
  ('kommersiell', 'produkt', 'Produkt', 0),
  ('kommersiell', 'merkevare', 'Merkevare', 1),
  ('kommersiell', 'reklame', 'Reklame', 2),
  ('abstrakt', 'kunst', 'Kunst', 0),
  ('abstrakt', 'mønster', 'Mønster', 1),
  ('abstrakt', 'farge', 'Farge', 2),
  ('bts', 'opptak', 'Opptak', 0),
  ('bts', 'rigging', 'Rigging', 1),
  ('bts', 'team', 'Team', 2),
  ('bts', 'utstyr', 'Utstyr', 3),
  ('bts', 'lokasjon', 'Lokasjon', 4),
  ('bryllup', 'seremoni', 'Seremoni', 0),
  ('bryllup', 'fest', 'Fest', 1),
  ('bryllup', 'portrett', 'Portrett', 2),
  ('bryllup', 'detaljer', 'Detaljer', 3),
  ('industri', 'kontor', 'Kontor', 0),
  ('industri', 'produksjon', 'Produksjon', 1),
  ('industri', 'team', 'Team', 2),
  ('industri', 'produkt', 'Produkt', 3),
  ('industri', 'fasade', 'Fasade', 4)
) AS sub(parent_slug, slug, label, sort_order)
JOIN image_categories parent ON parent.slug = sub.parent_slug AND parent.parent_id IS NULL
ON CONFLICT DO NOTHING;
