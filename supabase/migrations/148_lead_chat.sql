-- 148_lead_chat.sql
-- Lead-chat: en gruppesamtale knyttet til én lead, bygget på samme
-- conversations/conversation_participants-infrastruktur som produksjonschat
-- (096_production_chat.sql) og direktemeldinger (094_direct_messages.sql).
-- RLS trenger ingen endring: den eksisterende is_conversation_participant()-
-- baserte policyen bryr seg ikke om hvilken entitet conversation_id er knyttet til.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE;

-- Én lead-samtale per lead.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_lead_unique ON conversations(lead_id) WHERE lead_id IS NOT NULL;
