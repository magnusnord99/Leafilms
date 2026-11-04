-- 184_lead_first_contacted.sql
-- Legger til first_contacted_at på projects — settes automatisk første gang
-- en e-post sendes fra prosjektets e-postside (via /api/send-email).
-- Vises som "Kontaktet"-badge i Kanban-kortet for leads.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS first_contacted_at TIMESTAMPTZ;
