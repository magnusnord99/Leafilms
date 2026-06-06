-- Enable RLS on both video table generations used by the app.
-- Earlier migrations disabled RLS for development; production must not expose
-- public-schema video metadata to anonymous callers.

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_videos" ON public.videos;
DROP POLICY IF EXISTS "authenticated_insert_videos" ON public.videos;
DROP POLICY IF EXISTS "authenticated_update_videos" ON public.videos;
DROP POLICY IF EXISTS "authenticated_delete_videos" ON public.videos;

CREATE POLICY "authenticated_read_videos"
  ON public.videos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_videos"
  ON public.videos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_videos"
  ON public.videos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_videos"
  ON public.videos FOR DELETE
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_read_section_videos" ON public.section_videos;
DROP POLICY IF EXISTS "authenticated_insert_section_videos" ON public.section_videos;
DROP POLICY IF EXISTS "authenticated_update_section_videos" ON public.section_videos;
DROP POLICY IF EXISTS "authenticated_delete_section_videos" ON public.section_videos;

CREATE POLICY "authenticated_read_section_videos"
  ON public.section_videos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_section_videos"
  ON public.section_videos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_section_videos"
  ON public.section_videos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_section_videos"
  ON public.section_videos FOR DELETE
  TO authenticated
  USING (true);

ALTER TABLE public.video_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.section_video_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_video_library" ON public.video_library;
DROP POLICY IF EXISTS "authenticated_insert_video_library" ON public.video_library;
DROP POLICY IF EXISTS "authenticated_update_video_library" ON public.video_library;
DROP POLICY IF EXISTS "authenticated_delete_video_library" ON public.video_library;
DROP POLICY IF EXISTS "public_read_video_library_for_published_projects" ON public.video_library;

DROP POLICY IF EXISTS "authenticated_read_section_video_library" ON public.section_video_library;
DROP POLICY IF EXISTS "authenticated_insert_section_video_library" ON public.section_video_library;
DROP POLICY IF EXISTS "authenticated_update_section_video_library" ON public.section_video_library;
DROP POLICY IF EXISTS "authenticated_delete_section_video_library" ON public.section_video_library;
DROP POLICY IF EXISTS "public_read_section_video_library_for_published_projects" ON public.section_video_library;

CREATE POLICY "authenticated_read_video_library"
  ON public.video_library FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_video_library"
  ON public.video_library FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_video_library"
  ON public.video_library FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_video_library"
  ON public.video_library FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_read_section_video_library"
  ON public.section_video_library FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_section_video_library"
  ON public.section_video_library FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_section_video_library"
  ON public.section_video_library FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_section_video_library"
  ON public.section_video_library FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "public_read_section_video_library_for_published_projects"
  ON public.section_video_library FOR SELECT
  TO anon
  USING (
    section_id IN (
      SELECT s.id
      FROM public.sections s
      JOIN public.projects p ON p.id = s.project_id
      WHERE p.status = 'published'
        AND s.visible = true
    )
  );

CREATE POLICY "public_read_video_library_for_published_projects"
  ON public.video_library FOR SELECT
  TO anon
  USING (
    id IN (
      SELECT sv.video_id
      FROM public.section_video_library sv
      JOIN public.sections s ON s.id = sv.section_id
      JOIN public.projects p ON p.id = s.project_id
      WHERE p.status = 'published'
        AND s.visible = true
    )
  );
