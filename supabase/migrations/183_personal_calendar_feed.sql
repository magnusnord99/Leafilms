-- 183_personal_calendar_feed.sql
-- Personlig kalender-abonnement pr. bruker, i tillegg til den eksisterende delte
-- feeden (CALENDAR_FEED_TOKEN-miljøvariabelen, uendret — eksisterende abonnement
-- fortsetter å virke). Hver bruker får sitt eget hemmelige token og kan selv velge
-- hvilke hendelsestyper som skal synces (feedback fra Magnus 2026-10-29).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_feed_token TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_sync_shoots BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_sync_deliveries BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_sync_meetings BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS calendar_sync_tasks BOOLEAN NOT NULL DEFAULT true;

-- Backfill for eksisterende rader (DEFAULT på en ALTER TABLE ADD COLUMN dekker bare
-- fremtidige INSERT-er for en verdi beregnet av en funksjon som gen_random_bytes).
UPDATE profiles SET calendar_feed_token = encode(gen_random_bytes(24), 'hex') WHERE calendar_feed_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_calendar_feed_token ON profiles(calendar_feed_token);
