-- 160_task_video_files.sql
-- Filer lastet opp direkte på et video-postprod-steg (Grovklipp/Farger/Lyd/Klipp),
-- erstatter de gamle fritekst-lenkefeltene (TASK_LINK_FIELDS i postprod-siden).
-- Fri liste (ingen fast "hovedfil") — replaces_file_id danner en enkel
-- versjonskjede når man laster opp "ny versjon av X". Se
-- docs/superpowers/specs/2026-09-21-postprod-video-file-upload-design.md

CREATE TABLE IF NOT EXISTS task_video_files (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename          TEXT        NOT NULL,
  r2_key            TEXT        NOT NULL,
  size_bytes        BIGINT      NOT NULL,
  content_type      TEXT,
  uploaded_by       UUID        REFERENCES profiles(id),
  replaces_file_id  UUID        REFERENCES task_video_files(id),
  sort_order        INT         NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_video_files_task ON task_video_files(task_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_task_video_files_replaces ON task_video_files(replaces_file_id);

ALTER TABLE task_video_files ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'task_video_files' AND policyname = 'authenticated full access task_video_files'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated full access task_video_files" ON task_video_files FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;
