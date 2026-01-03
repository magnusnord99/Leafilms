-- Fix all RLS policies for public project pages
-- Ensure all necessary tables have proper policies for anonymous users

-- Enable RLS on all tables if not already enabled
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_case_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE collage_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE collage_preset_images ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "public_read_team_members" ON team_members;
DROP POLICY IF EXISTS "public_read_section_team_members_for_published_projects" ON section_team_members;
DROP POLICY IF EXISTS "public_read_case_studies" ON case_studies;
DROP POLICY IF EXISTS "public_read_section_case_studies_for_published_projects" ON section_case_studies;
DROP POLICY IF EXISTS "public_read_collage_presets" ON collage_presets;
DROP POLICY IF EXISTS "public_read_collage_preset_images" ON collage_preset_images;

-- Team members - allow all to be read (they're public info)
CREATE POLICY "public_read_team_members"
  ON team_members FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY "public_read_team_members" ON team_members IS 'Anonymous users can read team members (needed for public project pages)';

-- Section team members - use simpler IN query
CREATE POLICY "public_read_section_team_members_for_published_projects"
  ON section_team_members FOR SELECT
  TO anon
  USING (
    section_id IN (
      SELECT s.id 
      FROM sections s
      JOIN projects p ON p.id = s.project_id
      WHERE p.status = 'published'
    )
  );

COMMENT ON POLICY "public_read_section_team_members_for_published_projects" ON section_team_members IS 'Anonymous users can read section_team_members for published projects';

-- Case studies - allow all to be read (they're public portfolio items)
CREATE POLICY "public_read_case_studies"
  ON case_studies FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY "public_read_case_studies" ON case_studies IS 'Anonymous users can read case studies (needed for public project pages)';

-- Section case studies - use simpler IN query
CREATE POLICY "public_read_section_case_studies_for_published_projects"
  ON section_case_studies FOR SELECT
  TO anon
  USING (
    section_id IN (
      SELECT s.id 
      FROM sections s
      JOIN projects p ON p.id = s.project_id
      WHERE p.status = 'published'
    )
  );

COMMENT ON POLICY "public_read_section_case_studies_for_published_projects" ON section_case_studies IS 'Anonymous users can read section_case_studies for published projects';

-- Collage presets - allow all to be read
CREATE POLICY "public_read_collage_presets"
  ON collage_presets FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY "public_read_collage_presets" ON collage_presets IS 'Anonymous users can read collage presets (needed for public project pages)';

-- Collage preset images - allow all to be read
CREATE POLICY "public_read_collage_preset_images"
  ON collage_preset_images FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY "public_read_collage_preset_images" ON collage_preset_images IS 'Anonymous users can read collage preset images (needed for public project pages)';

