-- 161_video_reviews_r2_support.sql
-- video_reviews støttet hittil kun Supabase Storage (2GB-tak, ikke chunket).
-- Postprod-filopplasting bruker R2 (multipart, ingen praktisk grense) — denne
-- migrasjonen lar video_reviews peke på enten kilde via storage_provider.

ALTER TABLE video_reviews ALTER COLUMN storage_path DROP NOT NULL;

ALTER TABLE video_reviews
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'supabase'
    CHECK (storage_provider IN ('supabase', 'r2')),
  ADD COLUMN IF NOT EXISTS r2_key TEXT,
  ADD COLUMN IF NOT EXISTS task_video_file_id UUID REFERENCES task_video_files(id) ON DELETE SET NULL;

ALTER TABLE video_reviews DROP CONSTRAINT IF EXISTS video_reviews_storage_source_check;
ALTER TABLE video_reviews ADD CONSTRAINT video_reviews_storage_source_check
  CHECK (
    (storage_provider = 'supabase' AND storage_path IS NOT NULL AND r2_key IS NULL) OR
    (storage_provider = 'r2' AND r2_key IS NOT NULL AND storage_path IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_video_reviews_task_video_file ON video_reviews(task_video_file_id);
