-- Team Members (team-bibliotek)
-- Tilsvarende struktur som case_studies

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT NOT NULL,  -- F.eks. "Director", "Producer", "Photographer"
  bio TEXT,  -- Lengre beskrivelse om personen
  profile_image_path TEXT,  -- Path i Supabase Storage
  email TEXT,
  phone TEXT,
  tags TEXT[] DEFAULT '{}',
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_team_members_tags ON team_members USING GIN(tags);

-- Kobling mellom seksjoner og team-medlemmer
CREATE TABLE section_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID REFERENCES sections(id) ON DELETE CASCADE,
  team_member_id UUID REFERENCES team_members(id) ON DELETE CASCADE,
  order_index INTEGER DEFAULT 0,
  UNIQUE(section_id, team_member_id)
);

-- Disable RLS for development
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE section_team_members DISABLE ROW LEVEL SECURITY;

