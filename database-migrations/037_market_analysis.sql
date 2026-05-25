-- Migration 037: Market Analysis results

CREATE TABLE IF NOT EXISTS market_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',
  triggered_by TEXT,
  results JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE market_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read market analyses"
  ON market_analyses FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Service role can insert/update"
  ON market_analyses FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
