-- 136_task_turn_ready_notification.sql
-- Ny varseltype: task_turn_ready. Sendes til assignees på en post_prod-oppgave
-- som blir ulåst i stepperen når forrige steg i sekvensen settes til 'done'
-- (se notifyNewlyUnlockedPostProdTasks i lib/actions/pipeline.ts).

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'task_turn_ready', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention', 'quote_message',
    'feedback_reply', 'contract_signed', 'project_message_reaction', 'task_message_reaction',
    'quote_message_reaction', 'resale_assigned', 'direct_message', 'meeting_invite',
    'meeting_response', 'board_comment_mention', 'board_comment_reply',
    'pitch_review_requested', 'pitch_review_responded',
    'quote_review_requested', 'quote_review_responded',
    'preprod_mention', 'preprod_message', 'preprod_message_reaction', 'conversation_message_reaction',
    'gallery_review_requested', 'gallery_review_responded'
  ));
