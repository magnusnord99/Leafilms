-- 059_selection_galleries.sql
-- Kundeseleksjon av bilder: selection_galleries + selection_images

-- ---------------------------------------------------------------------------
-- 1. Utvid notifications type constraint
-- ---------------------------------------------------------------------------
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('project_message', 'task_message', 'selection_submitted'));

-- ---------------------------------------------------------------------------
-- 2. Tabeller
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS selection_galleries (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token             TEXT        NOT NULL UNIQUE,
  pin_code          TEXT        NOT NULL,
  target_count      INTEGER,
  status            TEXT        NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'submitted', 'purged')),
  submitted_at      TIMESTAMPTZ,
  purged_at         TIMESTAMPTZ,
  pin_attempts      INTEGER     NOT NULL DEFAULT 0,
  pin_locked_until  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS selection_images (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id    UUID        NOT NULL REFERENCES selection_galleries(id) ON DELETE CASCADE,
  filename      TEXT        NOT NULL,
  storage_path  TEXT,
  sort_order    INTEGER     NOT NULL DEFAULT 0,
  selected      BOOLEAN     NOT NULL DEFAULT false,
  comment       TEXT,
  selected_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selection_galleries_token   ON selection_galleries(token);
CREATE INDEX IF NOT EXISTS idx_selection_galleries_project ON selection_galleries(project_id);
CREATE INDEX IF NOT EXISTS idx_selection_images_gallery    ON selection_images(gallery_id, sort_order);

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE selection_galleries ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_images     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated full access galleries"
  ON selection_galleries FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated full access images"
  ON selection_images FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. Storage bucket (privat)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'selections',
  'selections',
  false,
  20971520,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "authenticated manage selections storage"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'selections')
  WITH CHECK (bucket_id = 'selections');

-- ---------------------------------------------------------------------------
-- 5. Task-mal for post_prod (photo + mixed prosjekttyper)
-- ---------------------------------------------------------------------------
INSERT INTO task_templates (pipeline_stage, project_type, title, description, sort_order)
VALUES
  ('post_prod', 'photo', 'Seleksjon til kunde',
   'Last opp lowres-utvalg og send seleksjonslink til kunden', 2),
  ('post_prod', 'mixed', 'Seleksjon til kunde',
   'Last opp lowres-utvalg og send seleksjonslink til kunden', 2)
ON CONFLICT DO NOTHING;
