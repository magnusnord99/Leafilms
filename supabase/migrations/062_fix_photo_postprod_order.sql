-- Migration 062: Legg til "Seleksjon til kunde" før redigering i foto-flyten
-- Kunden skal velge sine favorittbilder FØR redigering starter

-- Bump eksisterende steg for å gi plass til nytt steg på sort_order 2
UPDATE task_templates SET sort_order = 6 WHERE pipeline_stage = 'post_prod' AND project_type = 'photo' AND title = 'Ferdig';
UPDATE task_templates SET sort_order = 5 WHERE pipeline_stage = 'post_prod' AND project_type = 'photo' AND title = 'Revisjoner';
UPDATE task_templates SET sort_order = 4 WHERE pipeline_stage = 'post_prod' AND project_type = 'photo' AND title = 'Venter på tilbakemelding';
UPDATE task_templates SET sort_order = 3 WHERE pipeline_stage = 'post_prod' AND project_type = 'photo' AND title = 'Redigering';

-- Legg til nytt steg: Seleksjon til kunde (sort_order 2)
INSERT INTO task_templates (pipeline_stage, project_type, title, description, sort_order)
VALUES (
  'post_prod',
  'photo',
  'Seleksjon til kunde',
  'Send bildeutvalg til kunden og la dem velge sine favoritter før redigering starter',
  2
);
