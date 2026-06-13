-- Migration 044: Slett eksisterende post_prod tasks så de re-seedes fra nye maler
-- Gjelder kun prosjekter som er i post_prod-steget akkurat nå

DELETE FROM tasks
WHERE pipeline_stage = 'post_prod'
  AND project_id IN (
    SELECT id FROM projects WHERE pipeline_stage = 'post_prod'
  );
