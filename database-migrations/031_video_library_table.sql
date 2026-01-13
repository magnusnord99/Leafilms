-- Video Library table for uploaded videos (NOT Vimeo videos)
-- The existing 'videos' table is for Vimeo videos, so we need a separate table

-- Opprett video_library tabellen
CREATE TABLE IF NOT EXISTS video_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,  -- Path i Supabase Storage (assets bucket)
  title TEXT,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'hero',  -- Hovedkategori: 'hero', 'background', 'showcase', etc.
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

-- Index for søk på kategori og subcategory
CREATE INDEX IF NOT EXISTS idx_video_library_category ON video_library(category);
CREATE INDEX IF NOT EXISTS idx_video_library_subcategory ON video_library(subcategory);
CREATE INDEX IF NOT EXISTS idx_video_library_tags ON video_library USING GIN(tags);

-- Kobling mellom seksjoner og videoer (mange-til-mange)
-- For Hero-seksjonen vil det typisk være én video som bakgrunn
CREATE TABLE IF NOT EXISTS section_video_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
  video_id UUID REFERENCES video_library(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  position TEXT DEFAULT 'background',  -- 'background', 'foreground', etc.
  autoplay BOOLEAN DEFAULT true,
  loop BOOLEAN DEFAULT true,
  muted BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(section_id, video_id, position)
);

CREATE INDEX IF NOT EXISTS idx_section_video_library_section ON section_video_library(section_id);
CREATE INDEX IF NOT EXISTS idx_section_video_library_video ON section_video_library(video_id);

-- Disable RLS for development (kan aktiveres senere)
ALTER TABLE video_library DISABLE ROW LEVEL SECURITY;
ALTER TABLE section_video_library DISABLE ROW LEVEL SECURITY;
