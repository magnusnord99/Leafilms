-- Ensure RLS is enabled on sections table and verify the policy exists
-- This is a safety check to make sure RLS is properly configured

-- Enable RLS if not already enabled
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

-- Verify the policy exists, if not create it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'sections' 
    AND policyname = 'public_read_sections_for_published_projects'
  ) THEN
    CREATE POLICY "public_read_sections_for_published_projects"
      ON sections FOR SELECT
      TO anon
      USING (
        project_id IN (
          SELECT id FROM projects WHERE status = 'published'
        )
      );
  END IF;
END $$;

COMMENT ON POLICY "public_read_sections_for_published_projects" ON sections IS 'Anonymous users can read sections for published projects';

