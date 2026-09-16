-- 151_email_discussion_chat.sql
-- E-postdiskusjon: en egen samtaletråd per prosjekt for å diskutere e-poster
-- som skal sendes ut (feedback e9431fb7) — bevisst adskilt fra den
-- eksisterende produksjonschatten (096_production_chat.sql), ikke samme tråd.
-- Samme conversations/conversation_participants-infrastruktur, egen kolonne
-- siden ett prosjekt allerede kan ha én produksjonssamtale (project_id) og nå
-- også kan ha én egen e-postsamtale (email_discussion_project_id) — to rader,
-- to uavhengige unike indekser.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS email_discussion_project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_email_discussion_unique ON conversations(email_discussion_project_id) WHERE email_discussion_project_id IS NOT NULL;
