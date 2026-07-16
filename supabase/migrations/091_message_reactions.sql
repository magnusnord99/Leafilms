-- 091_message_reactions.sql
-- Emoji-reaksjoner på meldinger (prosjekt-chat, oppgave-chat, tilbud-chat) — lar team-
-- medlemmer bekrefte at de har lest en melding uten å skrive et svar. Én delt tabell for
-- alle tre meldingstypene i stedet for tre separate reaksjonstabeller, siden meldingene
-- allerede lever i tre ulike tabeller (project_messages/task_messages/quote_messages) og
-- message_id ikke kan FK-e til tre tabeller samtidig — enforced i appkode i stedet.

CREATE TABLE IF NOT EXISTS message_reactions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_type TEXT        NOT NULL CHECK (message_type IN ('project', 'task', 'quote')),
  message_id   UUID        NOT NULL,
  user_id      UUID        NOT NULL REFERENCES auth.users(id),
  emoji        TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_type, message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_lookup
  ON message_reactions(message_type, message_id);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read reactions"
  ON message_reactions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert own reactions"
  ON message_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reactions"
  ON message_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- Realtime, samme mønster som project_messages/task_messages (081_message_mentions.sql)
ALTER TABLE message_reactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
EXCEPTION WHEN SQLSTATE '42710' THEN
  NULL;
END$$;
