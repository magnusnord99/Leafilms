-- 065_quote_assignee.sql
-- Legger til ansvarlig for å sende tilbud på hvert prosjekt.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS quote_assignee_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- Oppdater notification_type-sjekk med ny type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned'
  ));
