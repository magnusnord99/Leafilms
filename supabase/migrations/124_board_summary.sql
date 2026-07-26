-- 124_board_summary.sql
-- Manuelt redigerbar prosjektinfo-tekst til boardets sidepanel — separat fra
-- meeting_summary (AI-oppsummering av interne møtenotater/e-posttråd), siden
-- denne teksten nå også vises til kunden på delte boards og derfor må kunne
-- skrives/redigeres direkte av Leafilms-teamet.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS board_summary TEXT;
