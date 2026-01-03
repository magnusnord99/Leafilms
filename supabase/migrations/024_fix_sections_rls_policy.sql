-- Fix RLS policy for sections to allow anonymous users to read sections for published projects
-- The previous policy might not be working correctly, so we'll recreate it with a simpler approach

-- Drop existing policy
DROP POLICY IF EXISTS "public_read_sections_for_published_projects" ON sections;

-- Create a new policy that uses a JOIN instead of EXISTS for better performance and reliability
-- This policy allows anon users to read sections where the project is published
CREATE POLICY "public_read_sections_for_published_projects"
  ON sections FOR SELECT
  TO anon
  USING (
    project_id IN (
      SELECT id FROM projects WHERE status = 'published'
    )
  );

COMMENT ON POLICY "public_read_sections_for_published_projects" ON sections IS 'Anonymous users can read sections for published projects';

