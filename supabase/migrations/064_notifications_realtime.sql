-- 064_notifications_realtime.sql
-- Aktiver realtime-events for notifications-tabellen slik at NotificationBell
-- mottar INSERT/UPDATE/DELETE direkte fra Postgres.
-- REPLICA IDENTITY FULL er nødvendig for at DELETE-filter på user_id skal virke.
alter table notifications replica identity full;

-- Add table to publication if not already present (ignore if already exists)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN SQLSTATE '42710' THEN
  -- Relation is already member of publication, ignore
  NULL;
END$$;
