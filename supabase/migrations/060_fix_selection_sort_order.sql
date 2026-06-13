-- 060_fix_selection_sort_order.sql
-- Flytt "Seleksjon til kunde" før "Redigering" i post_prod

UPDATE task_templates
SET sort_order = 0
WHERE pipeline_stage = 'post_prod'
  AND title = 'Seleksjon til kunde';
