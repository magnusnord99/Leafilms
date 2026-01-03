-- Enable anonymous users to read published projects and related data
-- This is needed for public project pages to work

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "public_read_published_projects" ON projects;
DROP POLICY IF EXISTS "public_read_sections_for_published_projects" ON sections;
DROP POLICY IF EXISTS "public_read_images_for_published_projects" ON images;
DROP POLICY IF EXISTS "public_read_section_images_for_published_projects" ON section_images;
DROP POLICY IF EXISTS "public_read_team_members" ON team_members;
DROP POLICY IF EXISTS "public_read_section_team_members_for_published_projects" ON section_team_members;
DROP POLICY IF EXISTS "public_read_case_studies" ON case_studies;
DROP POLICY IF EXISTS "public_read_section_case_studies_for_published_projects" ON section_case_studies;
DROP POLICY IF EXISTS "public_read_collage_presets" ON collage_presets;
DROP POLICY IF EXISTS "public_read_collage_preset_images" ON collage_preset_images;

-- Allow anonymous users to read projects that are published
CREATE POLICY "public_read_published_projects"
  ON projects FOR SELECT
  TO anon
  USING (status = 'published');

COMMENT ON POLICY "public_read_published_projects" ON projects IS 'Anonymous users can read published projects for public project pages';

-- Allow anonymous users to read sections for published projects
CREATE POLICY "public_read_sections_for_published_projects"
  ON sections FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = sections.project_id
      AND projects.status = 'published'
    )
  );

COMMENT ON POLICY "public_read_sections_for_published_projects" ON sections IS 'Anonymous users can read sections for published projects';

-- Allow anonymous users to read images for published projects
CREATE POLICY "public_read_images_for_published_projects"
  ON images FOR SELECT
  TO anon
  USING (true); -- Images are generally safe to read publicly

COMMENT ON POLICY "public_read_images_for_published_projects" ON images IS 'Anonymous users can read images (needed for public project pages)';

-- Allow anonymous users to read section_images for published projects
CREATE POLICY "public_read_section_images_for_published_projects"
  ON section_images FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM sections
      JOIN projects ON projects.id = sections.project_id
      WHERE sections.id = section_images.section_id
      AND projects.status = 'published'
    )
  );

COMMENT ON POLICY "public_read_section_images_for_published_projects" ON section_images IS 'Anonymous users can read section_images for published projects';

-- Allow anonymous users to read team_members (needed for team sections)
CREATE POLICY "public_read_team_members"
  ON team_members FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY "public_read_team_members" ON team_members IS 'Anonymous users can read team members (needed for public project pages)';

-- Allow anonymous users to read section_team_members for published projects
CREATE POLICY "public_read_section_team_members_for_published_projects"
  ON section_team_members FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM sections
      JOIN projects ON projects.id = sections.project_id
      WHERE sections.id = section_team_members.section_id
      AND projects.status = 'published'
    )
  );

COMMENT ON POLICY "public_read_section_team_members_for_published_projects" ON section_team_members IS 'Anonymous users can read section_team_members for published projects';

-- Allow anonymous users to read case_studies (needed for cases sections)
CREATE POLICY "public_read_case_studies"
  ON case_studies FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY "public_read_case_studies" ON case_studies IS 'Anonymous users can read case studies (needed for public project pages)';

-- Allow anonymous users to read section_case_studies for published projects
CREATE POLICY "public_read_section_case_studies_for_published_projects"
  ON section_case_studies FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM sections
      JOIN projects ON projects.id = sections.project_id
      WHERE sections.id = section_case_studies.section_id
      AND projects.status = 'published'
    )
  );

COMMENT ON POLICY "public_read_section_case_studies_for_published_projects" ON section_case_studies IS 'Anonymous users can read section_case_studies for published projects';

-- Allow anonymous users to read collage_presets (needed for example_work sections)
CREATE POLICY "public_read_collage_presets"
  ON collage_presets FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY "public_read_collage_presets" ON collage_presets IS 'Anonymous users can read collage presets (needed for public project pages)';

-- Allow anonymous users to read collage_preset_images (needed for example_work sections)
CREATE POLICY "public_read_collage_preset_images"
  ON collage_preset_images FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY "public_read_collage_preset_images" ON collage_preset_images IS 'Anonymous users can read collage preset images (needed for public project pages)';

