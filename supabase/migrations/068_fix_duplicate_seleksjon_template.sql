-- Migration 068: Fjern duplikat "Seleksjon til kunde" i task_templates
-- Migration 059 og 062 la begge til samme rad for (post_prod, photo, 'Seleksjon til kunde')
-- noe som forårsaket at seeding skapte to identiske tasks når et prosjekt ble
-- sendt tilbake i pipelinen og deretter frem igjen til post_prod.

-- Behold kun én rad per (pipeline_stage, project_type, title) — ta den med lavest id
DELETE FROM task_templates
WHERE id NOT IN (
  SELECT DISTINCT ON (pipeline_stage, project_type, title) id
  FROM task_templates
  ORDER BY pipeline_stage, project_type, title, id
);

-- Rydd opp duplikate tasks i tasks-tabellen:
-- Behold kun én "Seleksjon til kunde"-task per prosjekt (den med lavest sort_order, så lavest id)
DELETE FROM tasks
WHERE pipeline_stage = 'post_prod'
AND title = 'Seleksjon til kunde'
AND id NOT IN (
  SELECT DISTINCT ON (project_id, pipeline_stage, COALESCE(sub_type, ''), title) id
  FROM tasks
  ORDER BY project_id, pipeline_stage, COALESCE(sub_type, ''), title, sort_order, id
);
