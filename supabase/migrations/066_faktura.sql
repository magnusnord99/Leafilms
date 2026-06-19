-- 066_faktura.sql
-- Legger til ansvarlig for fakturering + task-mal for fakturert-steget.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS invoice_assignee_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- Legg til ny notification-type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned'
  ));

-- Task-mal for fakturert-steget
INSERT INTO task_templates (pipeline_stage, title, description, sort_order)
VALUES (
  'fakturert',
  'Send faktura',
  'Send faktura til kunden via Fiken og marker som ferdig her',
  1
)
ON CONFLICT DO NOTHING;
