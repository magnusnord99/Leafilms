ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS meeting_notes TEXT,
  ADD COLUMN IF NOT EXISTS meeting_summary JSONB;
