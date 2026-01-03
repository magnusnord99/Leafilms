-- Analytics tracking for public project views
-- Tracks anonymous analytics: total time on page and time per section

CREATE TABLE IF NOT EXISTS project_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL, -- Token fra project_shares for å koble til prosjektet
  
  -- Total session data
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_ended_at TIMESTAMPTZ,
  total_time_seconds INTEGER, -- Total tid på siden i sekunder
  
  -- Page visibility tracking
  is_active BOOLEAN DEFAULT true, -- Om siden er aktiv (ikke i bakgrunn)
  visibility_changes INTEGER DEFAULT 0, -- Antall ganger siden ble skjult/vist
  
  -- Section time tracking (JSONB for fleksibilitet)
  -- Format: { "section_id": seconds, "section_id2": seconds, ... }
  section_times JSONB DEFAULT '{}'::jsonb,
  
  -- Metadata
  user_agent TEXT, -- Browser info (anonymisert)
  referrer TEXT, -- Hvor kom de fra (anonymisert)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for rask oppslag på prosjekt
CREATE INDEX IF NOT EXISTS idx_project_analytics_project_id ON project_analytics(project_id);
CREATE INDEX IF NOT EXISTS idx_project_analytics_share_token ON project_analytics(share_token);
CREATE INDEX IF NOT EXISTS idx_project_analytics_created_at ON project_analytics(created_at DESC);

-- RLS policies - tillat anonym lesing/skriving (public side)
ALTER TABLE project_analytics ENABLE ROW LEVEL SECURITY;

-- Tillat alle å lese analytics (for admin)
CREATE POLICY "Allow public read access to analytics"
  ON project_analytics FOR SELECT
  USING (true);

-- Tillat alle å skrive analytics (fra public side)
CREATE POLICY "Allow public write access to analytics"
  ON project_analytics FOR INSERT
  WITH CHECK (true);

-- Tillat oppdatering av eksisterende analytics (for å oppdatere session_ended_at)
CREATE POLICY "Allow public update access to analytics"
  ON project_analytics FOR UPDATE
  USING (true);

-- Trigger for å oppdatere updated_at
CREATE OR REPLACE FUNCTION update_project_analytics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_project_analytics_updated_at
  BEFORE UPDATE ON project_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_project_analytics_updated_at();

-- View for å se aggregerte analytics per prosjekt
-- Note: This view is SECURITY INVOKER by default (runs with caller's privileges)
-- This ensures RLS policies are enforced based on the querying user's context
CREATE OR REPLACE VIEW project_analytics_summary AS
WITH section_aggregates AS (
  SELECT 
    pa.project_id,
    sections.key as section_id,
    SUM(sections.value::numeric) as total_time,
    COUNT(DISTINCT pa.id) as sessions
  FROM project_analytics pa
  CROSS JOIN LATERAL jsonb_each_text(pa.section_times) AS sections(key, value)
  GROUP BY pa.project_id, sections.key
)
SELECT 
  p.id as project_id,
  p.title as project_title,
  COUNT(DISTINCT pa.id) as total_sessions,
  AVG(pa.total_time_seconds) as avg_time_seconds,
  SUM(pa.total_time_seconds) as total_time_seconds,
  MIN(pa.session_started_at) as first_view,
  MAX(pa.session_ended_at) as last_view,
  -- Aggreger section times fra CTE
  COALESCE(
    jsonb_object_agg(
      sa.section_id,
      jsonb_build_object(
        'total_time', sa.total_time,
        'sessions', sa.sessions
      )
    ) FILTER (WHERE sa.section_id IS NOT NULL),
    '{}'::jsonb
  ) as section_stats
FROM projects p
LEFT JOIN project_analytics pa ON p.id = pa.project_id
LEFT JOIN section_aggregates sa ON p.id = sa.project_id
GROUP BY p.id, p.title;

COMMENT ON TABLE project_analytics IS 'Anonymiserte analytics for public project views. Ingen personlig informasjon lagres.';
COMMENT ON COLUMN project_analytics.share_token IS 'Token fra project_shares - brukes for å koble analytics til prosjektet';
COMMENT ON COLUMN project_analytics.section_times IS 'JSONB objekt med section_id som key og antall sekunder som value';
COMMENT ON VIEW project_analytics_summary IS 'Aggregated analytics summary. Uses SECURITY INVOKER (default) to enforce RLS based on caller permissions.';

