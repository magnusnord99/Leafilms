-- Migration 049: Leveringsinfo på prosjekter

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS delivery_description TEXT,
  ADD COLUMN IF NOT EXISTS post_prod_days       INT;

COMMENT ON COLUMN projects.delivery_description IS 'Beskrivelse av hva som leveres, f.eks. "2 kampanjefilmer + 30 bilder"';
COMMENT ON COLUMN projects.post_prod_days       IS 'Antall arbeidsdager satt av til post-produksjon';
