-- Migration 043: Oppdater post_prod task-maler til Leafilms' faktiske arbeidsflyt

DELETE FROM task_templates WHERE pipeline_stage = 'post_prod';

INSERT INTO task_templates (pipeline_stage, project_type, title, description, sort_order) VALUES

  -- ── Foto ──────────────────────────────────────────────────────────────────
  ('post_prod', 'photo', 'Selektering',
    'Gå gjennom alle bilder og velg de sterkeste', 1),

  ('post_prod', 'photo', 'Redigering',
    'Bearbeid og ferdigstill utvalgte bilder', 2),

  ('post_prod', 'photo', 'Venter på tilbakemelding',
    'Send bildeutvalg til kunde og vent på tilbakemelding', 3),

  ('post_prod', 'photo', 'Revisjoner',
    'Korriger bilder basert på tilbakemelding fra kunde', 4),

  ('post_prod', 'photo', 'Ferdig',
    'Eksporter i riktig format og klargjer for levering', 5),

  -- ── Video ─────────────────────────────────────────────────────────────────
  ('post_prod', 'video', 'Logging',
    'Gå gjennom råmateriale og marker de beste klippene', 1),

  ('post_prod', 'video', 'Grovklipp',
    'Bygg grunnstrukturen — sett scene, tempo og flyt', 2),

  ('post_prod', 'video', 'Farger',
    'Fargegradering og visuell look', 3),

  ('post_prod', 'video', 'Lyd',
    'Lydmiks, musikk og lyddesign', 4),

  ('post_prod', 'video', 'Venter på tilbakemelding',
    'Send utkast til kunde og vent på tilbakemelding', 5),

  ('post_prod', 'video', 'Ferdig',
    'Ferdigstill og eksporter i leveranseformat', 6),

  -- ── Begge (mixed) ─────────────────────────────────────────────────────────
  ('post_prod', 'mixed', 'Logging',
    'Gå gjennom råmateriale og marker de beste videoklippene', 1),

  ('post_prod', 'mixed', 'Selektering bilder',
    'Velg de sterkeste stillbildene fra innspillingen', 2),

  ('post_prod', 'mixed', 'Grovklipp',
    'Bygg grunnstrukturen i videoklippet', 3),

  ('post_prod', 'mixed', 'Redigering bilder',
    'Bearbeid og ferdigstill utvalgte stillbilder', 4),

  ('post_prod', 'mixed', 'Farger',
    'Fargegradering — konsistent look på tvers av video og bilder', 5),

  ('post_prod', 'mixed', 'Lyd',
    'Lydmiks, musikk og lyddesign for video', 6),

  ('post_prod', 'mixed', 'Venter på tilbakemelding',
    'Send alt materiale til kunde og vent på tilbakemelding', 7),

  ('post_prod', 'mixed', 'Revisjoner',
    'Korriger video og bilder basert på tilbakemelding fra kunde', 8),

  ('post_prod', 'mixed', 'Ferdig',
    'Eksporter og klargjer alt for levering', 9);
