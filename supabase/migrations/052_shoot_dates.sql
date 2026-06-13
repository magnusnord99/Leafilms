-- Migration 052: Opptaksdatoer på prosjekter

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS shoot_start DATE,
  ADD COLUMN IF NOT EXISTS shoot_end   DATE;

COMMENT ON COLUMN projects.shoot_start IS 'Første opptaksdag';
COMMENT ON COLUMN projects.shoot_end   IS 'Siste opptaksdag (kan være samme som shoot_start)';
