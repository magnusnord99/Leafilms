-- 064_notifications_realtime.sql
-- Aktiver realtime-events for notifications-tabellen slik at NotificationBell
-- mottar INSERT/UPDATE/DELETE direkte fra Postgres.
-- REPLICA IDENTITY FULL er nødvendig for at DELETE-filter på user_id skal virke.
alter table notifications replica identity full;
alter publication supabase_realtime add table notifications;
