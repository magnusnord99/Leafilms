-- Fix RLS policy for quotes table to allow anonymous users to read quotes for published projects
-- This is needed for the QuoteSection component on public project pages

-- Enable RLS if not already enabled
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "public_read_quotes_for_published_projects" ON quotes;

-- Create policy for quotes - allow reading quotes for published projects
CREATE POLICY "public_read_quotes_for_published_projects"
  ON quotes FOR SELECT
  TO anon
  USING (
    project_id IN (
      SELECT id FROM projects WHERE status = 'published'
    )
  );

COMMENT ON POLICY "public_read_quotes_for_published_projects" ON quotes IS 'Anonymous users can read quotes for published projects (needed for public project pages)';

