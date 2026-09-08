-- 145_task_calendar_name.sql
-- Valgfritt eget kalendernavn per oppgave, uavhengig av oppgavetittelen (feedback
-- 89524e2d). Tomt/NULL betyr "bruk standardmalen" (se buildTaskCalendarLabel i
-- lib/actions/calendar.ts) — kun satt når noen eksplisitt har overstyrt navnet,
-- f.eks. "Aftermovie Slottsfjell" i stedet for "POSTPROD - Klipp - Slottsfjell".

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS calendar_name TEXT;

COMMENT ON COLUMN tasks.calendar_name IS
  'Overstyrer kalendervisningsnavnet for denne oppgaven. NULL/tomt = bruk standardmalen utledet fra steg + oppgavetittel + kunde.';
