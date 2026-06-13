-- Migration 042: project_type på projects og task_templates

-- Prosjekttype: video, photo, mixed
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_type text
  CHECK (project_type IN ('video', 'photo', 'mixed'));

-- Task-maler kan nå filtreres per prosjekttype (null = gjelder alle steg/typer)
ALTER TABLE task_templates
  ADD COLUMN IF NOT EXISTS project_type text
  CHECK (project_type IN ('video', 'photo', 'mixed'));

-- Erstatt generiske post_prod-maler med type-spesifikke
DELETE FROM task_templates WHERE pipeline_stage = 'post_prod';

INSERT INTO task_templates (pipeline_stage, project_type, title, description, sort_order) VALUES
  -- Video
  ('post_prod', 'video', 'Logging og grovklipp',      'Gå gjennom råmateriale og marker de beste klippene',          1),
  ('post_prod', 'video', 'Klipping og montering',     'Bygg historien — sett struktur og flyt i materialet',         2),
  ('post_prod', 'video', 'Fargegradering',             'Korriger eksponeringen og sett det estetiske preget',         3),
  ('post_prod', 'video', 'Lydmiks og musikk',          'Rens dialogen, legg til musikk og sett rette nivåer',         4),
  ('post_prod', 'video', 'Kundegjennomgang',           'Send utkast til kunde og håndter revisjoner',                 5),
  ('post_prod', 'video', 'Eksport og mastering',       'Eksporter i leveranseformat og kvalitetssikre resultatet',   6),

  -- Photo
  ('post_prod', 'photo', 'Gjennomgang og culling',              'Gå gjennom alle bilder og velg de sterkeste',               1),
  ('post_prod', 'photo', 'Fargegradering og retusjering',       'Bearbeid bilder med riktig look og nødvendig retusjering',  2),
  ('post_prod', 'photo', 'Kundegjennomgang',                    'Send bildeutvalg til kunde for godkjenning',                3),
  ('post_prod', 'photo', 'Eksport og levering',                 'Eksporter i riktig format, oppløsning og fargerom',         4),

  -- Mixed
  ('post_prod', 'mixed', 'Logging og grovklipp (video)',        'Gå gjennom videoklipp og marker de beste sekvensene',      1),
  ('post_prod', 'mixed', 'Gjennomgang og culling (foto)',       'Velg de sterkeste stillbildene fra innspillingen',          2),
  ('post_prod', 'mixed', 'Klipping og montering',               'Bygg ferdig videohistorien med valgt materiale',            3),
  ('post_prod', 'mixed', 'Fargegradering — visuell konsistens', 'Sørg for felles look på tvers av video og foto',           4),
  ('post_prod', 'mixed', 'Retusjering stillbilder',             'Ferdigstill de utvalgte stillbildene',                      5),
  ('post_prod', 'mixed', 'Lydmiks og musikk',                   'Rens lyd og sett musikkspor for video',                    6),
  ('post_prod', 'mixed', 'Kundegjennomgang',                    'Send alt materiale samlet til kundes godkjenning',          7),
  ('post_prod', 'mixed', 'Eksport og levering',                 'Lever video og bilder i avtalte formater',                  8);
