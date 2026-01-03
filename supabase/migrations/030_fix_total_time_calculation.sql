-- Fix total_time_seconds calculation in project_analytics_summary
-- Instead of using SUM(pa.total_time_seconds) which includes inactive time,
-- calculate total time as the sum of all section_times (actual active time)

-- Drop view first to allow data type change
DROP VIEW IF EXISTS project_analytics_summary CASCADE;

CREATE VIEW project_analytics_summary AS
WITH section_aggregates AS (
  SELECT 
    pa.project_id,
    sections.key as section_id,
    SUM(sections.value::numeric) as total_time,
    COUNT(DISTINCT pa.id) as sessions
  FROM project_analytics pa
  CROSS JOIN LATERAL jsonb_each_text(pa.section_times) AS sections(key, value)
  GROUP BY pa.project_id, sections.key
),
-- Calculate total active time per session (sum of all section_times)
session_total_times AS (
  SELECT 
    pa.project_id,
    pa.id as session_id,
    COALESCE(
      (SELECT SUM(value::numeric) 
       FROM jsonb_each_text(pa.section_times)),
      0
    ) as active_time_seconds
  FROM project_analytics pa
)
SELECT 
  p.id as project_id,
  p.title as project_title,
  COUNT(DISTINCT pa.id) as total_sessions,
  -- Average time: use active time from section_times only (no fallback to total_time_seconds)
  -- Cast to bigint to maintain data type compatibility
  COALESCE(AVG(stt.active_time_seconds)::bigint, 0) as avg_time_seconds,
  -- Total time: sum of all active time from section_times only (no fallback to total_time_seconds)
  -- This ensures we only count actual active time, not session duration
  COALESCE(SUM(stt.active_time_seconds)::bigint, 0) as total_time_seconds,
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
LEFT JOIN session_total_times stt ON pa.id = stt.session_id AND pa.project_id = stt.project_id
LEFT JOIN section_aggregates sa ON p.id = sa.project_id
GROUP BY p.id, p.title;

COMMENT ON VIEW project_analytics_summary IS 'Aggregated analytics summary. total_time_seconds now uses sum of section_times (active time) instead of session duration.';

