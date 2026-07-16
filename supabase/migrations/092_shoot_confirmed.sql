-- Migration 092: Manuell bekreftelse av opptaksdato
--
-- Opptak regnes som bekreftet når enten kontrakten for prosjektet er signert,
-- eller en admin manuelt har bekreftet det (uavhengig av kontraktstatus).
-- Erstatter den tidligere heuristikken i lib/actions/calendar.ts som antok
-- at pipeline_stage >= 'kontrakt' betydde signert — det stemmer ikke, siden
-- prosjekter kan flyttes forbi kontrakt-steget uten signatur (se
-- advanceFromKontraktUnsigned i lib/actions/pipeline.ts).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS shoot_confirmed BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN projects.shoot_confirmed IS 'Manuell bekreftelse av opptaksdato, satt av admin uavhengig av kontraktstatus';
