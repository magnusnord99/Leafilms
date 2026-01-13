-- Video Library for pitch presentations
-- Globalt videobibliotek som kan brukes i alle prosjekter (spesielt Hero-seksjonen)

-- Sjekk om tabellen eksisterer og hvilke kolonner den har
DO $$
BEGIN
  -- Opprett tabellen hvis den ikke eksisterer
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'videos') THEN
    CREATE TABLE videos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      filename TEXT NOT NULL,
      file_path TEXT NOT NULL,
      title TEXT,
      description TEXT,
      category TEXT NOT NULL,
      subcategory TEXT,
      tags TEXT[] DEFAULT '{}',
      duration INTEGER,
      width INTEGER,
      height INTEGER,
      file_size BIGINT,
      thumbnail_path TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  ELSE
    -- Legg til manglende kolonner hvis tabellen allerede eksisterer
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'category') THEN
      ALTER TABLE videos ADD COLUMN category TEXT NOT NULL DEFAULT 'hero';
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'subcategory') THEN
      ALTER TABLE videos ADD COLUMN subcategory TEXT;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'tags') THEN
      ALTER TABLE videos ADD COLUMN tags TEXT[] DEFAULT '{}';
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'duration') THEN
      ALTER TABLE videos ADD COLUMN duration INTEGER;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'width') THEN
      ALTER TABLE videos ADD COLUMN width INTEGER;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'height') THEN
      ALTER TABLE videos ADD COLUMN height INTEGER;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'file_size') THEN
      ALTER TABLE videos ADD COLUMN file_size BIGINT;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'thumbnail_path') THEN
      ALTER TABLE videos ADD COLUMN thumbnail_path TEXT;
    END IF;
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'updated_at') THEN
      ALTER TABLE videos ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
  END IF;
END $$;

-- Opprett tabellen hvis den ikke eksisterer (fallback)
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,  -- Path i Supabase Storage (assets bucket)
  title TEXT,
  description TEXT,
  category TEXT NOT NULL,  -- Hovedkategori: 'hero', 'background', 'showcase', etc.
  subcategory TEXT,  -- Underkategori: 'hero/nature', 'hero/urban', etc.
  tags TEXT[] DEFAULT '{}',  -- Array av tags for søk
  duration INTEGER,  -- Varighet i sekunder
  width INTEGER,
  height INTEGER,
  file_size BIGINT,  -- Bytes
  thumbnail_path TEXT,  -- Path til thumbnail i Supabase Storage
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for søk på kategori og subcategory (hvis de ikke allerede eksisterer)
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category);
CREATE INDEX IF NOT EXISTS idx_videos_subcategory ON videos(subcategory);
CREATE INDEX IF NOT EXISTS idx_videos_tags ON videos USING GIN(tags);

-- Kobling mellom seksjoner og videoer (mange-til-mange)
-- For Hero-seksjonen vil det typisk være én video som bakgrunn
CREATE TABLE IF NOT EXISTS section_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
  video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  position TEXT DEFAULT 'background',  -- 'background', 'foreground', etc.
  autoplay BOOLEAN DEFAULT true,
  loop BOOLEAN DEFAULT true,
  muted BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(section_id, video_id, position)
);

CREATE INDEX IF NOT EXISTS idx_section_videos_section ON section_videos(section_id);
CREATE INDEX IF NOT EXISTS idx_section_videos_video ON section_videos(video_id);

-- Disable RLS for development (kan aktiveres senere)
ALTER TABLE videos DISABLE ROW LEVEL SECURITY;
ALTER TABLE section_videos DISABLE ROW LEVEL SECURITY;
