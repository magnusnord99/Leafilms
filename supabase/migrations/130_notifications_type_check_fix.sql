-- 130_notifications_type_check_fix.sql
-- Fikser notifications_type_check etter at 129_conversation_message_reactions.sql
-- (før rettelsen) droppet og gjenopprettet constrainten uten typene fra 127/088:
--   resale_assigned, meeting_invite, meeting_response,
--   board_comment_mention, board_comment_reply,
--   pitch_review_*, quote_review_*
--
-- Samme klasse bug som 121_board_comments_notification_types_fix.sql (118-kollisjon).
-- Konsekvens uten fix: AFTER INSERT-triggere på meeting_participants / board_comments
-- feiler med check violation og ruller tilbake selve invitasjonen/kommentaren.
-- Idempotent — trygg å kjøre selv om 129 allerede er rettet i kilde.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply', 'contract_signed',
    'project_message_reaction', 'task_message_reaction', 'quote_message_reaction',
    'resale_assigned', 'direct_message',
    'meeting_invite', 'meeting_response',
    'board_comment_mention', 'board_comment_reply',
    'pitch_review_requested', 'pitch_review_responded',
    'quote_review_requested', 'quote_review_responded',
    'preprod_mention', 'preprod_message', 'preprod_message_reaction',
    'conversation_message_reaction'
  ));
