-- 163_task_video_file_comments.sql
-- Tidsankrede kommentarer på en opplastet postprod-videofil, for intern
-- kollega-review direkte i post-prod-steget (erstatter den frittstående
-- /admin/task-file-reviews-siden). Speiler video_comments-mønsteret
-- (073_video_reviews.sql), men knyttet til task_video_files og med en
-- ekte author_id i stedet for fritekst-navn, siden dette er internt og
-- alltid autentisert.

CREATE TABLE IF NOT EXISTS task_video_file_comments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id           UUID        NOT NULL REFERENCES task_video_files(id) ON DELETE CASCADE,
  author_id         UUID        REFERENCES profiles(id),
  timestamp_seconds FLOAT,
  text              TEXT        NOT NULL,
  resolved          BOOLEAN     NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_video_file_comments_file ON task_video_file_comments(file_id, timestamp_seconds);

ALTER TABLE task_video_file_comments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'task_video_file_comments' AND policyname = 'authenticated full access task_video_file_comments'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated full access task_video_file_comments" ON task_video_file_comments FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;
