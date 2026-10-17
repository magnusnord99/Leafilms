-- 172_profile_fk_delete_rules.sql
--
-- "Database error deleting user" i /admin/users (Supabase sin generiske
-- GoTrue-feilmelding) når en admin prøver å slette en bruker som har sendt
-- meldinger i direktemeldinger-chatten: conversation_messages.sender_id
-- REFERENCES profiles(id) uten noen ON DELETE-regel (default NO ACTION),
-- som blokkerer slettingen av auth.users-raden når profiles-raden cascader.
--
-- Samme sjekk mot alle andre FK-er som peker på profiles(id) fant 4 til med
-- samme mangel (ingen av dem oppdaget tidligere fordi ingen bruker som er
-- forsøkt slettet før nå har hatt rader der) — inkludert company_direction
-- og email_footer_template (158/170), begge skrevet med samme manglende
-- ON DELETE som direct_messages_sender_id_fkey (094) fra starten av.
--
-- Fordelt på to riktige strategier:
-- 1. conversation_messages.sender_id — CASCADE, samme mønster som
--    task_messages.user_id/notifications.user_id allerede bruker for
--    chat-meldinger. Kolonnen er NOT NULL, så SET NULL er uansett ikke et
--    alternativ uten en egen kolonne-endring.
-- 2. De tre andre peker på ekte INNHOLD som skal overleve at opphavspersonen
--    slettes — en video-fil levert til en kunde, en kollega-kommentar på
--    den, eller en delt innstillings-tekst (footer-malen/"Vår retning") —
--    IKKE kaskade-slettes. SET NULL (alle tre kolonner er allerede
--    nullable, jf. lib/types.ts TaskVideoFile.uploaded_by: string | null),
--    attribusjonen forsvinner, innholdet består.

ALTER TABLE conversation_messages DROP CONSTRAINT direct_messages_sender_id_fkey;
ALTER TABLE conversation_messages ADD CONSTRAINT direct_messages_sender_id_fkey
  FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE task_video_file_comments DROP CONSTRAINT task_video_file_comments_author_id_fkey;
ALTER TABLE task_video_file_comments ADD CONSTRAINT task_video_file_comments_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE task_video_files DROP CONSTRAINT task_video_files_uploaded_by_fkey;
ALTER TABLE task_video_files ADD CONSTRAINT task_video_files_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE company_direction DROP CONSTRAINT company_direction_updated_by_fkey;
ALTER TABLE company_direction ADD CONSTRAINT company_direction_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE email_footer_template DROP CONSTRAINT email_footer_template_updated_by_fkey;
ALTER TABLE email_footer_template ADD CONSTRAINT email_footer_template_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
