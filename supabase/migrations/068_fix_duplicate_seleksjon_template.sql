-- Migration 068: Fjern duplikat "Seleksjon til kunde" i task_templates
-- Migration 059 og 062 la begge til samme rad for (post_prod, photo, 'Seleksjon til kunde')
-- noe som forårsaket at seeding skapte to identiske tasks når et prosjekt ble
-- sendt tilbake i pipelinen og deretter frem igjen til post_prod.

-- Behold kun én rad per (pipeline_stage, project_type, title) — ta den med lavest id
DELETE FROM task_templates
WHERE id NOT IN (
  SELECT MIN(id)
  FROM task_templates
  GROUP BY pipeline_stage, project_type, title
);

-- Rydd opp duplikate tasks i tasks-tabellen:
-- Behold kun én "Seleksjon til kunde"-task per prosjekt (den med lavest sort_order, så lavest id)
DELETE FROM tasks
WHERE id NOT IN (
  SELECT MIN(id)
  FROM tasks
  GROUP BY project_id, pipeline_stage, COALESCE(sub_type, ''), title
)
AND pipeline_stage = 'post_prod'
AND title = 'Seleksjon til kunde';
