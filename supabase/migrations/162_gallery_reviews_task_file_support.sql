-- 162_gallery_reviews_task_file_support.sql
-- gallery_reviews hittil bare for selection_galleries. Postprod "send til
-- kollega" på en opplastet videofil gjenbruker samme intern-review-mekanikk
-- (admin_tasks + waiting_review-status), men trigges fra en fil, ikke et
-- galleri — derfor gjøres gallery_id valgfri og task_video_file_id lagt til.

ALTER TABLE gallery_reviews ALTER COLUMN gallery_id DROP NOT NULL;

ALTER TABLE gallery_reviews
  ADD COLUMN IF NOT EXISTS task_video_file_id UUID REFERENCES task_video_files(id) ON DELETE CASCADE;

ALTER TABLE gallery_reviews DROP CONSTRAINT IF EXISTS gallery_reviews_source_check;
ALTER TABLE gallery_reviews ADD CONSTRAINT gallery_reviews_source_check
  CHECK (
    (gallery_id IS NOT NULL AND task_video_file_id IS NULL) OR
    (gallery_id IS NULL AND task_video_file_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_gallery_reviews_task_video_file ON gallery_reviews(task_video_file_id);
