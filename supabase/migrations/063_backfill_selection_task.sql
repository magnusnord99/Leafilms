-- 063_backfill_selection_task.sql
-- Legger til "Seleksjon til kunde"-oppgaven på eksisterende photo/mixed-prosjekter
-- som allerede var i post_prod da 059 ble kjørt og dermed ikke fikk oppgaven seedet.

INSERT INTO tasks (project_id, pipeline_stage, title, description, status, sort_order)
SELECT
  p.id,
  'post_prod',
  'Seleksjon til kunde',
  'Last opp lowres-utvalg og send seleksjonslink til kunden',
  'todo',
  2
FROM projects p
WHERE p.project_type IN ('photo', 'mixed')
  AND p.pipeline_stage = 'post_prod'
  AND NOT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.project_id = p.id
      AND t.pipeline_stage = 'post_prod'
      AND t.title = 'Seleksjon til kunde'
  );
