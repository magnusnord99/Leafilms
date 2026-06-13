-- Migration 041: pipeline_data JSONB + backfill eksisterende prosjekter

-- Fleksibel kolonne for stage-spesifikk data per prosjekt
-- Eksempel møte: { "meeting_link": "...", "meeting_link_sent_at": "..." }
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pipeline_data JSONB DEFAULT '{}'::jsonb;

-- Alle eksisterende prosjekter har allerede tilbud og prosjektbeskrivelse
-- og hører derfor hjemme i tilbud_sendt, ikke lead
UPDATE projects
  SET pipeline_stage = 'tilbud_sendt'
  WHERE pipeline_stage = 'lead';
