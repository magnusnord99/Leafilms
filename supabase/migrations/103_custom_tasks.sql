-- 103_custom_tasks.sql
-- Lar brukere legge til egendefinerte oppgaver i pre- og postproduksjon,
-- adskilt fra faste maloppgaver / postprods låste stepper.

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tasks.is_custom IS 'true for oppgaver lagt til manuelt av brukeren, false for oppgaver seedet fra task_templates';
