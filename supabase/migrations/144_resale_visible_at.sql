-- 144_resale_visible_at.sql
-- Prosjekter skal forsvinne fra den aktive pipeline-tavlen når fakturering er
-- fullført, og dukke opp igjen som "Videresalg" 3 uker senere (feedback b92936d5).
-- Ferdige prosjekter er fortsatt synlige i hele perioden via "Fullført"-filteret
-- på listevisningen (/admin/projects), som ikke bruker denne kolonnen.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS resale_visible_at TIMESTAMPTZ;

COMMENT ON COLUMN projects.resale_visible_at IS
  'Satt når prosjektet automatisk flyttes til pipeline_stage=videresalg (faktura sendt). Til og med dette tidspunktet skjules prosjektet fra pipeline-tavlen (BoardView); NULL = alltid synlig.';
