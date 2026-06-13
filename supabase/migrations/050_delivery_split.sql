-- Migration 050: Leveranse-split og pre-prod mal for oppgavetildeling

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS delivery_video TEXT,
  ADD COLUMN IF NOT EXISTS delivery_photo TEXT;

COMMENT ON COLUMN projects.delivery_video IS 'Hva som leveres av film/video, f.eks. "2 kampanjefilmer á 90 sek"';
COMMENT ON COLUMN projects.delivery_photo IS 'Hva som leveres av bilder, f.eks. "30 retuserte produktbilder"';

-- Legg til pre_prod-mal for oppgavetildeling
INSERT INTO task_templates (pipeline_stage, title, description, sort_order)
VALUES (
  'pre_prod',
  'Tildel oppgaver til teamet',
  'Fordel ansvar for produksjon og post-produksjon — hvem filmer, hvem redigerer, hvem håndterer lyd og farger.',
  0
)
ON CONFLICT DO NOTHING;
