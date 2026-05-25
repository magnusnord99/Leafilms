-- Migration 039: Pitch Feedback
-- Lar kunder (via offentlig prosjektlenke) gi innspill/kommentarer på pitcher

CREATE TABLE IF NOT EXISTS pitch_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  section_id UUID REFERENCES sections(id) ON DELETE SET NULL,
  share_token TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pitch_feedback_project_id ON pitch_feedback(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pitch_feedback_share_token ON pitch_feedback(share_token);

ALTER TABLE pitch_feedback ENABLE ROW LEVEL SECURITY;

-- Alle kan lese feedback for et prosjekt (brukes av admin og offentlig visning)
CREATE POLICY "Anyone can read pitch feedback"
  ON pitch_feedback FOR SELECT
  USING (true);

-- Alle kan sende inn feedback (krever gyldig share_token, valideres i API)
CREATE POLICY "Anyone can insert pitch feedback"
  ON pitch_feedback FOR INSERT
  WITH CHECK (true);

-- Kun autentiserte brukere (admin) kan slette feedback
CREATE POLICY "Authenticated users can delete feedback"
  ON pitch_feedback FOR DELETE
  USING (auth.role() = 'authenticated');
