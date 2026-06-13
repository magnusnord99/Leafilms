-- Migration 048: Legg til task_data-kolonne og nytt Klipp-steg i video-malen

-- 1. Ny kolonne for å lagre linkdata per oppgave
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_data JSONB DEFAULT '{}';

-- 2. Oppdater video post_prod-maler: legg til Klipp mellom Grovklipp og Farger
DELETE FROM task_templates WHERE pipeline_stage = 'post_prod' AND project_type = 'video';

INSERT INTO task_templates (pipeline_stage, project_type, title, description, sort_order) VALUES
  ('post_prod', 'video', 'Logging',
    'Gå gjennom råmateriale og marker de beste klippene', 1),
  ('post_prod', 'video', 'Grovklipp',
    'Bygg grunnstrukturen — sett scene, tempo og flyt', 2),
  ('post_prod', 'video', 'Klipp',
    'Finjuster klipping, kutt og tempobygging', 3),
  ('post_prod', 'video', 'Farger',
    'Fargegradering og visuell look', 4),
  ('post_prod', 'video', 'Lyd',
    'Lydmiks, musikk og lyddesign', 5),
  ('post_prod', 'video', 'Venter på tilbakemelding',
    'Send utkast til kunde og vent på tilbakemelding', 6),
  ('post_prod', 'video', 'Ferdig',
    'Ferdigstill og eksporter i leveranseformat', 7);
