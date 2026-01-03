-- Analytics tracking for quote views
-- Tracks anonymous analytics: total time viewing quote and time per quote section/part
-- Quotes are displayed as a section in public project views

CREATE TABLE IF NOT EXISTS quote_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL, -- Token fra project_shares for å koble til prosjektet
  
  -- Total session data
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_ended_at TIMESTAMPTZ,
  total_time_seconds INTEGER, -- Total tid på quote-seksjonen i sekunder
  
  -- Page visibility tracking
  is_active BOOLEAN DEFAULT true, -- Om siden er aktiv (ikke i bakgrunn)
  visibility_changes INTEGER DEFAULT 0, -- Antall ganger siden ble skjult/vist
  
  -- Quote section/part time tracking (JSONB for fleksibilitet)
  -- Format: { "header": seconds, "line_items": seconds, "totals": seconds, "actions": seconds, ... }
  -- Dette lar oss tracke hvilke deler av tilbudet kunden ser mest på
  section_times JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  user_agent TEXT, -- Browser info (anonymisert)
  referrer TEXT, -- Hvor kom de fra (anonymisert)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for rask oppslag
CREATE INDEX IF NOT EXISTS idx_quote_analytics_quote_id ON quote_analytics(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_analytics_project_id ON quote_analytics(project_id);
CREATE INDEX IF NOT EXISTS idx_quote_analytics_share_token ON quote_analytics(share_token);
CREATE INDEX IF NOT EXISTS idx_quote_analytics_created_at ON quote_analytics(created_at DESC);

-- RLS policies - tillat anonym lesing/skriving (public side)
ALTER TABLE quote_analytics ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "authenticated_read_quote_analytics" ON quote_analytics;
DROP POLICY IF EXISTS "authenticated_insert_quote_analytics" ON quote_analytics;
DROP POLICY IF EXISTS "authenticated_update_quote_analytics" ON quote_analytics;
DROP POLICY IF EXISTS "authenticated_delete_quote_analytics" ON quote_analytics;
DROP POLICY IF EXISTS "public_read_quote_analytics" ON quote_analytics;
DROP POLICY IF EXISTS "public_write_quote_analytics" ON quote_analytics;
DROP POLICY IF EXISTS "public_update_quote_analytics" ON quote_analytics;

-- Authenticated users have full access
CREATE POLICY "authenticated_read_quote_analytics"
  ON quote_analytics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_quote_analytics"
  ON quote_analytics FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_quote_analytics"
  ON quote_analytics FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_quote_analytics"
  ON quote_analytics FOR DELETE
  TO authenticated
  USING (true);

-- Anonymous users can read/write analytics (for public tracking)
CREATE POLICY "public_read_quote_analytics"
  ON quote_analytics FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "public_write_quote_analytics"
  ON quote_analytics FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "public_update_quote_analytics"
  ON quote_analytics FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Trigger for å oppdatere updated_at
CREATE OR REPLACE FUNCTION update_quote_analytics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_quote_analytics_updated_at
  BEFORE UPDATE ON quote_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_quote_analytics_updated_at();

-- View for å se aggregerte analytics per quote
CREATE OR REPLACE VIEW quote_analytics_summary AS
WITH section_aggregates AS (
  SELECT 
    qa.quote_id,
    sections.key as section_name,
    SUM(sections.value::numeric) as total_time,
    COUNT(DISTINCT qa.id) as sessions
  FROM quote_analytics qa
  CROSS JOIN LATERAL jsonb_each_text(qa.section_times) AS sections(key, value)
  GROUP BY qa.quote_id, sections.key
)
SELECT 
  q.id as quote_id,
  q.project_id,
  q.version as quote_version,
  q.status as quote_status,
  p.title as project_title,
  COALESCE(c.name, p.client_name) as customer_name,
  COUNT(DISTINCT qa.id) as total_sessions,
  AVG(qa.total_time_seconds) as avg_time_seconds,
  SUM(qa.total_time_seconds) as total_time_seconds,
  MIN(qa.session_started_at) as first_view,
  MAX(qa.session_ended_at) as last_view,
  -- Aggreger section times fra CTE
  COALESCE(
    jsonb_object_agg(
      sa.section_name,
      jsonb_build_object(
        'total_time', sa.total_time,
        'sessions', sa.sessions
      )
    ) FILTER (WHERE sa.section_name IS NOT NULL),
    '{}'::jsonb
  ) as section_stats
FROM quotes q
LEFT JOIN projects p ON q.project_id = p.id
LEFT JOIN customers c ON p.customer_id = c.id
LEFT JOIN quote_analytics qa ON q.id = qa.quote_id
LEFT JOIN section_aggregates sa ON q.id = sa.quote_id
GROUP BY q.id, q.project_id, q.version, q.status, p.title, c.name, p.client_name;

COMMENT ON TABLE quote_analytics IS 'Anonymiserte analytics for quote views. Ingen personlig informasjon lagres.';
COMMENT ON COLUMN quote_analytics.share_token IS 'Token fra project_shares - brukes for å koble analytics til prosjektet';
COMMENT ON COLUMN quote_analytics.section_times IS 'JSONB objekt med section_name som key (f.eks. "header", "line_items", "totals") og antall sekunder som value';
COMMENT ON VIEW quote_analytics_summary IS 'Aggregated analytics summary for quotes. Uses SECURITY INVOKER (default) to enforce RLS based on caller permissions.';

