-- 090_notify_contract_signed.sql
-- Internt varsel til admin-teamet når en kunde signerer produksjonsavtalen
-- (app/api/contracts/sign/route.ts). Broadcast til alle admin-profiler i stedet
-- for kun task-assignees, siden pre_prod-oppgaver først blir sådd i samme
-- forespørsel og ingen rekker å være tildelt ennå.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply', 'contract_signed'
  ));
