-- Image Library for pitch presentations
-- Globalt bildebibliotek som kan brukes i alle prosjekter

CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,  -- Path i Supabase Storage (assets bucket)
  title TEXT,
  description TEXT,
  category TEXT NOT NULL,  -- Hovedkategori: 'landskap', 'sport', 'closeup', etc.
  subcategory TEXT,  -- Underkategori: 'sport/ski', 'landskap/fjell', etc.
  tags TEXT[] DEFAULT '{}',  -- Array av tags for søk
  width INTEGER,
  height INTEGER,
  file_size BIGINT,  -- Bytes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for søk på kategori og subcategory
CREATE INDEX idx_images_category ON images(category);
CREATE INDEX idx_images_subcategory ON images(subcategory);
CREATE INDEX idx_images_tags ON images USING GIN(tags);

-- Kobling mellom seksjoner og bilder (mange-til-mange)
CREATE TABLE section_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
  image_id UUID REFERENCES images(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  position TEXT,  -- 'left', 'right', 'background', 'center', etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(section_id, image_id, position)
);

CREATE INDEX idx_section_images_section ON section_images(section_id);
CREATE INDEX idx_section_images_image ON section_images(image_id);

-- Disable RLS for development
ALTER TABLE images DISABLE ROW LEVEL SECURITY;
ALTER TABLE section_images DISABLE ROW LEVEL SECURITY;

