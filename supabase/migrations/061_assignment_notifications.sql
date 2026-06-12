-- 061_assignment_notifications.sql
-- Varsler ved tildeling av oppgave/lead:
--  - project_id valgfri (lead-varsler kan mangle prosjekt)
--  - lead_id-kobling så varselet kan lenke til leaden
--  - nye typer: task_assigned, lead_assigned

ALTER TABLE notifications ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_lead ON notifications(lead_id);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned'
  ));
