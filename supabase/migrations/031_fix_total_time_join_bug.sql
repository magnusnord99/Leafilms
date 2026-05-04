-- Fix total_time_seconds and avg_time_seconds inflation caused by JOIN with section_aggregates.
-- When session_total_times (1 row/session) is joined with section_aggregates (1 row/section),
-- each session row is duplicated M times (M = number of unique sections), making SUM M× too large.
-- Fix: aggregate session totals into project_totals CTE before joining with section_aggregates.

DROP VIEW IF EXISTS project_analytics_summary CASCADE;

CREATE VIEW project_analytics_summary AS
WITH session_total_times AS (
  SELECT
    pa.project_id,
    pa.id AS session_id,
    COALESCE(
      (SELECT SUM(value::numeric) FROM jsonb_each_text(pa.section_times)),
      0
    ) AS active_time_seconds
  FROM project_analytics pa
),
project_totals AS (
  SELECT
    project_id,
    SUM(active_time_seconds)::bigint AS total_time_seconds,
    AVG(active_time_seconds)::bigint   AS avg_time_seconds
  FROM session_total_times
  GROUP BY project_id
),
section_aggregates AS (
  SELECT
    pa.project_id,
    sections.key                   AS section_id,
    SUM(sections.value::numeric)   AS total_time,
    COUNT(DISTINCT pa.id)          AS sessions
  FROM project_analytics pa
  CROSS JOIN LATERAL jsonb_each_text(pa.section_times) AS sections(key, value)
  GROUP BY pa.project_id, sections.key
)
SELECT
  p.id                                                      AS project_id,
  p.title                                                   AS project_title,
  COUNT(DISTINCT pa.id)                                     AS total_sessions,
  COALESCE(pt.avg_time_seconds, 0)                          AS avg_time_seconds,
  COALESCE(pt.total_time_seconds, 0)                        AS total_time_seconds,
  MIN(pa.session_started_at)                                AS first_view,
  MAX(pa.session_ended_at)                                  AS last_view,
  COALESCE(
    jsonb_object_agg(
      sa.section_id,
      jsonb_build_object('total_time', sa.total_time, 'sessions', sa.sessions)
    ) FILTER (WHERE sa.section_id IS NOT NULL),
    '{}'::jsonb
  )                                                         AS section_stats
FROM projects p
LEFT JOIN project_analytics   pa ON p.id = pa.project_id
LEFT JOIN project_totals       pt ON p.id = pt.project_id
LEFT JOIN section_aggregates   sa ON p.id = sa.project_id
GROUP BY p.id, p.title, pt.avg_time_seconds, pt.total_time_seconds;

COMMENT ON VIEW project_analytics_summary IS
  'Aggregated analytics. total/avg_time_seconds computed from project_totals CTE to avoid JOIN inflation with section_aggregates.';
