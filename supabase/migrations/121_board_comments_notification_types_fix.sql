-- 121_board_comments_notification_types_fix.sql
-- Fikser notifications_type_check: en samtidig migrasjon (118_meetings.sql, kjørt av
-- Magnus etter 118_board_comments.sql) droppet og gjenopprettet denne constrainten
-- med sin egen typeliste (meeting_invite/meeting_response), uten å vite om
-- board_comment_mention/board_comment_reply fra 118_board_comments.sql — siden begge
-- migrasjonene bruker DROP CONSTRAINT + CREATE CONSTRAINT-mønsteret uavhengig av
-- hverandre, "vinner" den som kjøres sist og sletter den andres typer stille.
-- Oppdaget under manuell verifisering (Task 11) da et faktisk INSERT med type
-- 'board_comment_mention' feilet med constraint violation mot den skarpe databasen.
-- Denne migrasjonen slår sammen begge listene.

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
    'board_comment_mention', 'board_comment_reply'
  ));
