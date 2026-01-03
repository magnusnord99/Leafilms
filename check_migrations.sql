-- Check what migrations are actually in the remote database
-- Run this in Supabase Dashboard SQL Editor

SELECT version, name 
FROM supabase_migrations.schema_migrations 
ORDER BY version;

