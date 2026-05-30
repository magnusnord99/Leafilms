-- Harden RLS for recently added tables that live in the exposed public schema.

ALTER TABLE video_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE section_video_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_video_library" ON video_library;
DROP POLICY IF EXISTS "authenticated_insert_video_library" ON video_library;
DROP POLICY IF EXISTS "authenticated_update_video_library" ON video_library;
DROP POLICY IF EXISTS "authenticated_delete_video_library" ON video_library;
DROP POLICY IF EXISTS "public_read_video_library_for_published_projects" ON video_library;

DROP POLICY IF EXISTS "authenticated_read_section_video_library" ON section_video_library;
DROP POLICY IF EXISTS "authenticated_insert_section_video_library" ON section_video_library;
DROP POLICY IF EXISTS "authenticated_update_section_video_library" ON section_video_library;
DROP POLICY IF EXISTS "authenticated_delete_section_video_library" ON section_video_library;
DROP POLICY IF EXISTS "public_read_section_video_library_for_published_projects" ON section_video_library;

CREATE POLICY "authenticated_read_video_library"
  ON video_library FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_video_library"
  ON video_library FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_video_library"
  ON video_library FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_video_library"
  ON video_library FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_read_section_video_library"
  ON section_video_library FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_section_video_library"
  ON section_video_library FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_section_video_library"
  ON section_video_library FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_section_video_library"
  ON section_video_library FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "public_read_section_video_library_for_published_projects"
  ON section_video_library FOR SELECT
  TO anon
  USING (
    section_id IN (
      SELECT s.id
      FROM sections s
      JOIN projects p ON p.id = s.project_id
      WHERE p.status = 'published'
        AND s.visible = true
    )
  );

CREATE POLICY "public_read_video_library_for_published_projects"
  ON video_library FOR SELECT
  TO anon
  USING (
    id IN (
      SELECT sv.video_id
      FROM section_video_library sv
      JOIN sections s ON s.id = sv.section_id
      JOIN projects p ON p.id = s.project_id
      WHERE p.status = 'published'
        AND s.visible = true
    )
  );

-- Repair databases that may have applied the original overly broad 037 policy.
ALTER TABLE market_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can insert/update" ON market_analyses;

CREATE POLICY "Service role can insert/update"
  ON market_analyses FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
