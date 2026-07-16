-- 096_resale_assignee.sql
-- Legger til ansvarlig for videresalg til eksisterende kunde.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS resale_assignee_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- Oppdater notification_type-sjekk med ny type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply', 'contract_signed',
    'project_message_reaction', 'task_message_reaction', 'quote_message_reaction',
    'direct_message', 'resale_assigned'
  ));
