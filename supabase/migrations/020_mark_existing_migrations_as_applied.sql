-- Mark existing migrations as applied
-- This migration marks all previously manually-run migrations as applied
-- so that Supabase CLI can track them correctly
--
-- IMPORTANT: This migration should be run via Supabase Dashboard SQL Editor
-- After running this, use: supabase migration repair --status reverted <all-migrations>
-- Then: supabase db pull
-- Finally: supabase db push
--
-- OR use the simpler approach: supabase migration repair --status reverted <migrations>
-- as suggested by the CLI error message

-- Supabase CLI tracks migrations in supabase_migrations.schema_migrations
-- The table structure is: (version TEXT PRIMARY KEY)
-- Where version is typically a hash or timestamp-based identifier
-- NOT just the filename - this is why we need to use migration repair instead

-- Ensure the schema_migrations table exists (it should, but just in case)
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

-- Supabase CLI uses a simple structure: just version (TEXT PRIMARY KEY)
-- Let's check the actual structure first, then create/insert accordingly
DO $$
BEGIN
  -- Check if table exists and what columns it has
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'supabase_migrations' 
    AND table_name = 'schema_migrations'
  ) THEN
    -- Create table with minimal structure (just version)
    CREATE TABLE supabase_migrations.schema_migrations (
      version TEXT PRIMARY KEY
    );
  END IF;
END $$;

-- Insert all existing migration files that were run manually
-- Using the filename (without .sql) as the version
-- Supabase CLI typically uses just the version column
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES
  ('003_ai_examples'),
  ('004_case_studies'),
  ('007_image_library'),
  ('008_create_storage_bucket'),
  ('009_background_image_position'),
  ('010_team_members'),
  ('011_add_updated_at_to_section_images'),
  ('012_collage_presets'),
  ('013_project_metadata'),
  ('014_customers_and_projects'),
  ('015_add_pdf_path_to_quotes'),
  ('016_auth_setup'),
  ('017_fix_profiles_rls'),
  ('018_project_analytics'),
  ('019_enable_rls_all_tables')
ON CONFLICT (version) DO NOTHING;

-- Verify the migrations were inserted
DO $$
DECLARE
  migration_count INTEGER;
  rec RECORD;
BEGIN
  SELECT COUNT(*) INTO migration_count
  FROM supabase_migrations.schema_migrations
  WHERE version IN (
    '003_ai_examples', '004_case_studies', '007_image_library',
    '008_create_storage_bucket', '009_background_image_position',
    '010_team_members', '011_add_updated_at_to_section_images',
    '012_collage_presets', '013_project_metadata',
    '014_customers_and_projects', '015_add_pdf_path_to_quotes',
    '016_auth_setup', '017_fix_profiles_rls',
    '018_project_analytics', '019_enable_rls_all_tables'
  );
  
  RAISE NOTICE 'Successfully marked % existing migrations as applied', migration_count;
  
  -- Also show all current migrations for debugging
  RAISE NOTICE 'Current migrations in schema_migrations:';
  FOR rec IN 
    SELECT version FROM supabase_migrations.schema_migrations ORDER BY version
  LOOP
    RAISE NOTICE '  - %', rec.version;
  END LOOP;
END $$;

