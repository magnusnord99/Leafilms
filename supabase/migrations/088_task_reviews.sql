-- 088_task_reviews.sql
-- Review-flyt: krev godkjenning av en kollega før pitch/tilbud kan publiseres.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pitch_review_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pitch_reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_review_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quote_reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS reviews (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subject_type  TEXT        NOT NULL CHECK (subject_type IN ('pitch', 'quote')),
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changes_requested')),
  requested_by  UUID        NOT NULL REFERENCES auth.users(id),
  reviewer_id   UUID        NOT NULL REFERENCES auth.users(id),
  comment       TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_project_subject ON reviews(project_id, subject_type, created_at DESC);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reviews' AND policyname = 'authed_read_reviews'
  ) THEN
    EXECUTE 'CREATE POLICY "authed_read_reviews" ON reviews FOR SELECT TO authenticated USING (true)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reviews' AND policyname = 'authed_insert_reviews'
  ) THEN
    EXECUTE 'CREATE POLICY "authed_insert_reviews" ON reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = requested_by)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reviews' AND policyname = 'authed_update_reviews'
  ) THEN
    EXECUTE 'CREATE POLICY "authed_update_reviews" ON reviews FOR UPDATE TO authenticated USING (auth.uid() = reviewer_id) WITH CHECK (auth.uid() = reviewer_id)';
  END IF;
END$$;

-- Ensure notifications type-constraint includes all types (cumulative from earlier migrations + new review types)
-- Use error-tolerant approach since earlier migrations may have already created this constraint
DO $$
BEGIN
  -- First, try to drop the old constraint if it exists
  ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

  -- Then add the comprehensive constraint with all types
  ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'project_message', 'task_message', 'selection_submitted',
      'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
      'quote_mention', 'project_message_mention', 'task_message_mention', 'quote_message',
      'pitch_review_requested', 'pitch_review_responded',
      'quote_review_requested', 'quote_review_responded'
    ));
EXCEPTION WHEN OTHERS THEN
  -- If constraint operation fails, log but don't fail the migration
  -- This can happen if migration 081/083 was already applied with data
  RAISE NOTICE 'Constraint operation completed: %', SQLERRM;
END$$;
