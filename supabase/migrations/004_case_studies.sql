-- Case Studies (tidligere arbeid / portfolio items)
-- Kan også brukes som mal for team-medlemmer senere

CREATE TABLE case_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  vimeo_url TEXT NOT NULL,
  vimeo_id TEXT,
  thumbnail_path TEXT,  -- Path i Supabase Storage
  tags TEXT[] DEFAULT '{}',
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_case_studies_tags ON case_studies USING GIN(tags);

-- Kobling mellom seksjoner og case studies
CREATE TABLE section_case_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
  case_study_id UUID REFERENCES case_studies(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  UNIQUE(section_id, case_study_id)
);

-- Disable RLS for development
ALTER TABLE case_studies DISABLE ROW LEVEL SECURITY;
ALTER TABLE section_case_studies DISABLE ROW LEVEL SECURITY;

-- Insert example cases (fra ditt skjermbilde)
INSERT INTO case_studies (title, description, vimeo_url, vimeo_id, tags) VALUES
('AKER BRYGGE', 'Aker Brygge er klare for en ny sommersesong og ønsker å vise frem hva de tilbyr', 'https://vimeo.com/123456', '123456', ARRAY['event', 'commercial']),
('NETFLIX', 'Netflix skulle lansere kommende nyheter, samt fremheve sukksesserier. Leafilms dokumenterte.', 'https://vimeo.com/123457', '123457', ARRAY['event', 'corporate']),
('VITAMIN WELL', 'Casper Ruud trener hardt mot nye mål og turneringer. Vitamin Well er med han på veien.', 'https://vimeo.com/123458', '123458', ARRAY['commercial', 'sport']),
('BREITLING', 'Se Breitling i aktivitet i vann og fjell i lyngsalpene', 'https://vimeo.com/123459', '123459', ARRAY['commercial', 'product']);

