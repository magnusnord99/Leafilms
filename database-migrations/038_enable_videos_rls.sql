-- Enable RLS on videos and section_videos and grant full access to authenticated users
-- Overrides the DISABLE RLS set in 021_video_library.sql

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_videos ENABLE ROW LEVEL SECURITY;

-- videos policies
DROP POLICY IF EXISTS "authenticated_read_videos" ON videos;
DROP POLICY IF EXISTS "authenticated_insert_videos" ON videos;
DROP POLICY IF EXISTS "authenticated_update_videos" ON videos;
DROP POLICY IF EXISTS "authenticated_delete_videos" ON videos;

CREATE POLICY "authenticated_read_videos"
  ON videos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_videos"
  ON videos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_videos"
  ON videos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_videos"
  ON videos FOR DELETE
  TO authenticated
  USING (true);

-- section_videos policies
DROP POLICY IF EXISTS "authenticated_read_section_videos" ON section_videos;
DROP POLICY IF EXISTS "authenticated_insert_section_videos" ON section_videos;
DROP POLICY IF EXISTS "authenticated_update_section_videos" ON section_videos;
DROP POLICY IF EXISTS "authenticated_delete_section_videos" ON section_videos;

CREATE POLICY "authenticated_read_section_videos"
  ON section_videos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_section_videos"
  ON section_videos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_section_videos"
  ON section_videos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_section_videos"
  ON section_videos FOR DELETE
  TO authenticated
  USING (true);
