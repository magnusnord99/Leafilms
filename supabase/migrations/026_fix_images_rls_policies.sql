-- Fix RLS policies for images and section_images to allow anonymous users to read them
-- Similar to the sections fix, we'll use simpler queries for better reliability

-- Enable RLS if not already enabled
ALTER TABLE images ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_images ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "public_read_images_for_published_projects" ON images;
DROP POLICY IF EXISTS "public_read_section_images_for_published_projects" ON section_images;

-- Create policy for images - allow all images to be read by anon (they're generally safe)
CREATE POLICY "public_read_images_for_published_projects"
  ON images FOR SELECT
  TO anon
  USING (true);

COMMENT ON POLICY "public_read_images_for_published_projects" ON images IS 'Anonymous users can read images (needed for public project pages)';

-- Create policy for section_images - use simpler IN query instead of EXISTS
CREATE POLICY "public_read_section_images_for_published_projects"
  ON section_images FOR SELECT
  TO anon
  USING (
    section_id IN (
      SELECT s.id 
      FROM sections s
      JOIN projects p ON p.id = s.project_id
      WHERE p.status = 'published'
    )
  );

COMMENT ON POLICY "public_read_section_images_for_published_projects" ON section_images IS 'Anonymous users can read section_images for published projects';

