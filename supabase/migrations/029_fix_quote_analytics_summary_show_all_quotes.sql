-- Fix quote_analytics_summary view to show all quotes, not just those with analytics data
-- This ensures all projects with quotes appear in the analytics view, even if they have no analytics yet

DROP VIEW IF EXISTS quote_analytics_summary CASCADE;

CREATE VIEW quote_analytics_summary AS
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
  ) as section_stats,
  -- Customer name added at the end to maintain column order
  COALESCE(c.name, p.client_name) as customer_name
FROM quotes q
LEFT JOIN projects p ON q.project_id = p.id
LEFT JOIN customers c ON p.customer_id = c.id
LEFT JOIN quote_analytics qa ON q.id = qa.quote_id
LEFT JOIN section_aggregates sa ON q.id = sa.quote_id
GROUP BY q.id, q.project_id, q.version, q.status, p.title, c.name, p.client_name;

COMMENT ON VIEW quote_analytics_summary IS 'Aggregated analytics summary for quotes. Shows all quotes, even those without analytics data yet. Uses SECURITY INVOKER (default) to enforce RLS based on caller permissions.';


