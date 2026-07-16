-- 096_production_chat.sql
-- Produksjonschat: en gruppesamtale knyttet til ett prosjekt, bygget på samme
-- conversations/conversation_participants-infrastruktur som direktemeldinger
-- (094_direct_messages.sql) — det var nettopp derfor den ble laget med en egen
-- deltaker-tabell i utgangspunktet. RLS trenger ingen endring: den eksisterende
-- is_conversation_participant()-baserte policyen bryr seg ikke om antall
-- deltakere eller om project_id er satt.
--
-- direct_messages døpes om siden tabellen nå bærer meldinger for både 1:1-DM-er
-- og prosjekt-gruppesamtaler, ikke bare direktemeldinger.
ALTER TABLE direct_messages RENAME TO conversation_messages;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS title TEXT;

-- Én produksjonssamtale per prosjekt.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_project_unique ON conversations(project_id) WHERE project_id IS NOT NULL;
