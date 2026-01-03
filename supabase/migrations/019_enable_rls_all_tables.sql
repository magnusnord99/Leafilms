-- Enable RLS on all tables and add appropriate policies
-- This is an admin application, so authenticated users get full access
-- Anonymous users only get access to public data (project_shares, project_analytics)

-- Helper function to check if user is admin (reuse from 017_fix_profiles_rls.sql)
-- This function already exists, but we'll ensure it's available
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- AI EXAMPLES
-- ============================================
ALTER TABLE ai_examples ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "authenticated_read_ai_examples" ON ai_examples;
DROP POLICY IF EXISTS "authenticated_insert_ai_examples" ON ai_examples;
DROP POLICY IF EXISTS "authenticated_update_ai_examples" ON ai_examples;
DROP POLICY IF EXISTS "authenticated_delete_ai_examples" ON ai_examples;

-- Authenticated users can read all AI examples
CREATE POLICY "authenticated_read_ai_examples"
  ON ai_examples FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert AI examples
CREATE POLICY "authenticated_insert_ai_examples"
  ON ai_examples FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update AI examples
CREATE POLICY "authenticated_update_ai_examples"
  ON ai_examples FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Authenticated users can delete AI examples
CREATE POLICY "authenticated_delete_ai_examples"
  ON ai_examples FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- CASE STUDIES
-- ============================================
ALTER TABLE case_studies ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_read_case_studies" ON case_studies;
DROP POLICY IF EXISTS "authenticated_insert_case_studies" ON case_studies;
DROP POLICY IF EXISTS "authenticated_update_case_studies" ON case_studies;
DROP POLICY IF EXISTS "authenticated_delete_case_studies" ON case_studies;

CREATE POLICY "authenticated_read_case_studies"
  ON case_studies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_case_studies"
  ON case_studies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_case_studies"
  ON case_studies FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_case_studies"
  ON case_studies FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- SECTION CASE STUDIES (junction table)
-- ============================================
ALTER TABLE section_case_studies ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_read_section_case_studies" ON section_case_studies;
DROP POLICY IF EXISTS "authenticated_insert_section_case_studies" ON section_case_studies;
DROP POLICY IF EXISTS "authenticated_update_section_case_studies" ON section_case_studies;
DROP POLICY IF EXISTS "authenticated_delete_section_case_studies" ON section_case_studies;

CREATE POLICY "authenticated_read_section_case_studies"
  ON section_case_studies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_section_case_studies"
  ON section_case_studies FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_section_case_studies"
  ON section_case_studies FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_section_case_studies"
  ON section_case_studies FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- IMAGES
-- ============================================
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_read_images" ON images;
DROP POLICY IF EXISTS "authenticated_insert_images" ON images;
DROP POLICY IF EXISTS "authenticated_update_images" ON images;
DROP POLICY IF EXISTS "authenticated_delete_images" ON images;

CREATE POLICY "authenticated_read_images"
  ON images FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_images"
  ON images FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_images"
  ON images FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_images"
  ON images FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- SECTION IMAGES (junction table)
-- ============================================
ALTER TABLE section_images ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_read_section_images" ON section_images;
DROP POLICY IF EXISTS "authenticated_insert_section_images" ON section_images;
DROP POLICY IF EXISTS "authenticated_update_section_images" ON section_images;
DROP POLICY IF EXISTS "authenticated_delete_section_images" ON section_images;

CREATE POLICY "authenticated_read_section_images"
  ON section_images FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_section_images"
  ON section_images FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_section_images"
  ON section_images FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_section_images"
  ON section_images FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- TEAM MEMBERS
-- ============================================
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_read_team_members" ON team_members;
DROP POLICY IF EXISTS "authenticated_insert_team_members" ON team_members;
DROP POLICY IF EXISTS "authenticated_update_team_members" ON team_members;
DROP POLICY IF EXISTS "authenticated_delete_team_members" ON team_members;

CREATE POLICY "authenticated_read_team_members"
  ON team_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_team_members"
  ON team_members FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_team_members"
  ON team_members FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_team_members"
  ON team_members FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- SECTION TEAM MEMBERS (junction table)
-- ============================================
ALTER TABLE section_team_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_read_section_team_members" ON section_team_members;
DROP POLICY IF EXISTS "authenticated_insert_section_team_members" ON section_team_members;
DROP POLICY IF EXISTS "authenticated_update_section_team_members" ON section_team_members;
DROP POLICY IF EXISTS "authenticated_delete_section_team_members" ON section_team_members;

CREATE POLICY "authenticated_read_section_team_members"
  ON section_team_members FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_section_team_members"
  ON section_team_members FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_section_team_members"
  ON section_team_members FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_section_team_members"
  ON section_team_members FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- COLLAGE PRESETS
-- ============================================
ALTER TABLE collage_presets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_read_collage_presets" ON collage_presets;
DROP POLICY IF EXISTS "authenticated_insert_collage_presets" ON collage_presets;
DROP POLICY IF EXISTS "authenticated_update_collage_presets" ON collage_presets;
DROP POLICY IF EXISTS "authenticated_delete_collage_presets" ON collage_presets;

CREATE POLICY "authenticated_read_collage_presets"
  ON collage_presets FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_collage_presets"
  ON collage_presets FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_collage_presets"
  ON collage_presets FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_collage_presets"
  ON collage_presets FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- COLLAGE PRESET IMAGES (junction table)
-- ============================================
ALTER TABLE collage_preset_images ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_read_collage_preset_images" ON collage_preset_images;
DROP POLICY IF EXISTS "authenticated_insert_collage_preset_images" ON collage_preset_images;
DROP POLICY IF EXISTS "authenticated_update_collage_preset_images" ON collage_preset_images;
DROP POLICY IF EXISTS "authenticated_delete_collage_preset_images" ON collage_preset_images;

CREATE POLICY "authenticated_read_collage_preset_images"
  ON collage_preset_images FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_collage_preset_images"
  ON collage_preset_images FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_collage_preset_images"
  ON collage_preset_images FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_collage_preset_images"
  ON collage_preset_images FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- PROJECT COLLAGE IMAGES
-- ============================================
ALTER TABLE project_collage_images ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_read_project_collage_images" ON project_collage_images;
DROP POLICY IF EXISTS "authenticated_insert_project_collage_images" ON project_collage_images;
DROP POLICY IF EXISTS "authenticated_update_project_collage_images" ON project_collage_images;
DROP POLICY IF EXISTS "authenticated_delete_project_collage_images" ON project_collage_images;

CREATE POLICY "authenticated_read_project_collage_images"
  ON project_collage_images FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_project_collage_images"
  ON project_collage_images FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_project_collage_images"
  ON project_collage_images FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_project_collage_images"
  ON project_collage_images FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- CUSTOMERS
-- ============================================
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_read_customers" ON customers;
DROP POLICY IF EXISTS "authenticated_insert_customers" ON customers;
DROP POLICY IF EXISTS "authenticated_update_customers" ON customers;
DROP POLICY IF EXISTS "authenticated_delete_customers" ON customers;

CREATE POLICY "authenticated_read_customers"
  ON customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_customers"
  ON customers FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- QUOTES
-- ============================================
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_read_quotes" ON quotes;
DROP POLICY IF EXISTS "authenticated_insert_quotes" ON quotes;
DROP POLICY IF EXISTS "authenticated_update_quotes" ON quotes;
DROP POLICY IF EXISTS "authenticated_delete_quotes" ON quotes;

CREATE POLICY "authenticated_read_quotes"
  ON quotes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_quotes"
  ON quotes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_quotes"
  ON quotes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_quotes"
  ON quotes FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- CONTRACTS
-- ============================================
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "authenticated_read_contracts" ON contracts;
DROP POLICY IF EXISTS "authenticated_insert_contracts" ON contracts;
DROP POLICY IF EXISTS "authenticated_update_contracts" ON contracts;
DROP POLICY IF EXISTS "authenticated_delete_contracts" ON contracts;

CREATE POLICY "authenticated_read_contracts"
  ON contracts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_contracts"
  ON contracts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_contracts"
  ON contracts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_contracts"
  ON contracts FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- PROJECTS
-- ============================================
-- Enable RLS if not already enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'projects'
  ) THEN
    RAISE NOTICE 'Table projects does not exist, skipping RLS setup';
  ELSE
    ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "authenticated_read_projects" ON projects;
    DROP POLICY IF EXISTS "authenticated_insert_projects" ON projects;
    DROP POLICY IF EXISTS "authenticated_update_projects" ON projects;
    DROP POLICY IF EXISTS "authenticated_delete_projects" ON projects;
    
    CREATE POLICY "authenticated_read_projects"
      ON projects FOR SELECT
      TO authenticated
      USING (true);
    
    CREATE POLICY "authenticated_insert_projects"
      ON projects FOR INSERT
      TO authenticated
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_update_projects"
      ON projects FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_delete_projects"
      ON projects FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================
-- SECTIONS
-- ============================================
-- Enable RLS if not already enabled
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'sections'
  ) THEN
    RAISE NOTICE 'Table sections does not exist, skipping RLS setup';
  ELSE
    ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "authenticated_read_sections" ON sections;
    DROP POLICY IF EXISTS "authenticated_insert_sections" ON sections;
    DROP POLICY IF EXISTS "authenticated_update_sections" ON sections;
    DROP POLICY IF EXISTS "authenticated_delete_sections" ON sections;
    
    CREATE POLICY "authenticated_read_sections"
      ON sections FOR SELECT
      TO authenticated
      USING (true);
    
    CREATE POLICY "authenticated_insert_sections"
      ON sections FOR INSERT
      TO authenticated
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_update_sections"
      ON sections FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_delete_sections"
      ON sections FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- ============================================
-- PROJECT SHARES (for public access)
-- ============================================
-- Enable RLS if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'project_shares'
  ) THEN
    ALTER TABLE project_shares ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "authenticated_read_project_shares" ON project_shares;
    DROP POLICY IF EXISTS "authenticated_insert_project_shares" ON project_shares;
    DROP POLICY IF EXISTS "authenticated_update_project_shares" ON project_shares;
    DROP POLICY IF EXISTS "authenticated_delete_project_shares" ON project_shares;
    DROP POLICY IF EXISTS "public_read_project_shares" ON project_shares;
    
    -- Authenticated users have full access
    CREATE POLICY "authenticated_read_project_shares"
      ON project_shares FOR SELECT
      TO authenticated
      USING (true);
    
    CREATE POLICY "authenticated_insert_project_shares"
      ON project_shares FOR INSERT
      TO authenticated
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_update_project_shares"
      ON project_shares FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_delete_project_shares"
      ON project_shares FOR DELETE
      TO authenticated
      USING (true);
    
    -- Anonymous users can read project_shares (needed for public project pages)
    CREATE POLICY "public_read_project_shares"
      ON project_shares FOR SELECT
      TO anon
      USING (true);
  ELSE
    RAISE NOTICE 'Table project_shares does not exist, skipping RLS setup';
  END IF;
END $$;

-- ============================================
-- PROJECT ANALYTICS
-- ============================================
-- This table already has RLS enabled in 018_project_analytics.sql
-- We'll just ensure the policies are correct and add authenticated access
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'project_analytics'
  ) THEN
    -- Drop existing policies if they exist (they were created in 018)
    DROP POLICY IF EXISTS "Allow public read access to analytics" ON project_analytics;
    DROP POLICY IF EXISTS "Allow public write access to analytics" ON project_analytics;
    DROP POLICY IF EXISTS "Allow public update access to analytics" ON project_analytics;
    
    -- Drop new policies if they exist (for idempotency)
    DROP POLICY IF EXISTS "authenticated_read_project_analytics" ON project_analytics;
    DROP POLICY IF EXISTS "authenticated_insert_project_analytics" ON project_analytics;
    DROP POLICY IF EXISTS "authenticated_update_project_analytics" ON project_analytics;
    DROP POLICY IF EXISTS "authenticated_delete_project_analytics" ON project_analytics;
    DROP POLICY IF EXISTS "public_read_project_analytics" ON project_analytics;
    DROP POLICY IF EXISTS "public_write_project_analytics" ON project_analytics;
    DROP POLICY IF EXISTS "public_update_project_analytics" ON project_analytics;
    
    -- Authenticated users have full access
    CREATE POLICY "authenticated_read_project_analytics"
      ON project_analytics FOR SELECT
      TO authenticated
      USING (true);
    
    CREATE POLICY "authenticated_insert_project_analytics"
      ON project_analytics FOR INSERT
      TO authenticated
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_update_project_analytics"
      ON project_analytics FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_delete_project_analytics"
      ON project_analytics FOR DELETE
      TO authenticated
      USING (true);
    
    -- Anonymous users can read/write analytics (for public tracking)
    CREATE POLICY "public_read_project_analytics"
      ON project_analytics FOR SELECT
      TO anon
      USING (true);
    
    CREATE POLICY "public_write_project_analytics"
      ON project_analytics FOR INSERT
      TO anon
      WITH CHECK (true);
    
    CREATE POLICY "public_update_project_analytics"
      ON project_analytics FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  ELSE
    RAISE NOTICE 'Table project_analytics does not exist, skipping RLS setup';
  END IF;
END $$;

-- ============================================
-- ASSETS
-- ============================================
-- Enable RLS if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'assets'
  ) THEN
    ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "authenticated_read_assets" ON assets;
    DROP POLICY IF EXISTS "authenticated_insert_assets" ON assets;
    DROP POLICY IF EXISTS "authenticated_update_assets" ON assets;
    DROP POLICY IF EXISTS "authenticated_delete_assets" ON assets;
    
    CREATE POLICY "authenticated_read_assets"
      ON assets FOR SELECT
      TO authenticated
      USING (true);
    
    CREATE POLICY "authenticated_insert_assets"
      ON assets FOR INSERT
      TO authenticated
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_update_assets"
      ON assets FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_delete_assets"
      ON assets FOR DELETE
      TO authenticated
      USING (true);
    
    RAISE NOTICE 'Enabled RLS on assets table';
  ELSE
    RAISE NOTICE 'Table assets does not exist, skipping RLS setup';
  END IF;
END $$;

-- ============================================
-- VIDEOS
-- ============================================
-- Enable RLS if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'videos'
  ) THEN
    ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "authenticated_read_videos" ON videos;
    DROP POLICY IF EXISTS "authenticated_insert_videos" ON videos;
    DROP POLICY IF EXISTS "authenticated_update_videos" ON videos;
    DROP POLICY IF EXISTS "authenticated_delete_videos" ON videos;
    
    CREATE POLICY "authenticated_read_videos"
      ON videos FOR SELECT
      TO authenticated
      USING (true);
    
    CREATE POLICY "authenticated_insert_videos"
      ON videos FOR INSERT
      TO authenticated
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_update_videos"
      ON videos FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_delete_videos"
      ON videos FOR DELETE
      TO authenticated
      USING (true);
    
    RAISE NOTICE 'Enabled RLS on videos table';
  ELSE
    RAISE NOTICE 'Table videos does not exist, skipping RLS setup';
  END IF;
END $$;

-- ============================================
-- SECTION ASSETS (junction table)
-- ============================================
-- Enable RLS if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'section_assets'
  ) THEN
    ALTER TABLE section_assets ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "authenticated_read_section_assets" ON section_assets;
    DROP POLICY IF EXISTS "authenticated_insert_section_assets" ON section_assets;
    DROP POLICY IF EXISTS "authenticated_update_section_assets" ON section_assets;
    DROP POLICY IF EXISTS "authenticated_delete_section_assets" ON section_assets;
    
    CREATE POLICY "authenticated_read_section_assets"
      ON section_assets FOR SELECT
      TO authenticated
      USING (true);
    
    CREATE POLICY "authenticated_insert_section_assets"
      ON section_assets FOR INSERT
      TO authenticated
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_update_section_assets"
      ON section_assets FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_delete_section_assets"
      ON section_assets FOR DELETE
      TO authenticated
      USING (true);
    
    RAISE NOTICE 'Enabled RLS on section_assets table';
  ELSE
    RAISE NOTICE 'Table section_assets does not exist, skipping RLS setup';
  END IF;
END $$;

-- ============================================
-- SECTION VIDEOS (junction table)
-- ============================================
-- Enable RLS if table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'section_videos'
  ) THEN
    ALTER TABLE section_videos ENABLE ROW LEVEL SECURITY;
    
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "authenticated_read_section_videos" ON section_videos;
    DROP POLICY IF EXISTS "authenticated_insert_section_videos" ON section_videos;
    DROP POLICY IF EXISTS "authenticated_update_section_videos" ON section_videos;
    DROP POLICY IF EXISTS "authenticated_delete_section_videos" ON section_videos;
    
    CREATE POLICY "authenticated_read_section_videos"
      ON section_videos FOR SELECT
      TO authenticated
      USING (true);
    
    CREATE POLICY "authenticated_insert_section_videos"
      ON section_videos FOR INSERT
      TO authenticated
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_update_section_videos"
      ON section_videos FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
    
    CREATE POLICY "authenticated_delete_section_videos"
      ON section_videos FOR DELETE
      TO authenticated
      USING (true);
    
    RAISE NOTICE 'Enabled RLS on section_videos table';
  ELSE
    RAISE NOTICE 'Table section_videos does not exist, skipping RLS setup';
  END IF;
END $$;

-- ============================================
-- PROJECT ANALYTICS SUMMARY VIEW
-- ============================================
-- Fix view to ensure it uses SECURITY INVOKER (not SECURITY DEFINER)
-- This ensures RLS policies are enforced based on the querying user's context
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_views 
    WHERE schemaname = 'public' 
    AND viewname = 'project_analytics_summary'
  ) THEN
    -- Drop and recreate view without SECURITY DEFINER
    -- This ensures RLS policies are enforced based on the caller's permissions
    -- Views are SECURITY INVOKER by default (runs with caller's privileges)
    -- We explicitly drop and recreate to ensure no SECURITY DEFINER is set
    DROP VIEW IF EXISTS project_analytics_summary CASCADE;
    
    -- Create view (SECURITY INVOKER is the default - no need to specify)
    -- This ensures RLS policies are enforced based on the querying user's context
    CREATE VIEW project_analytics_summary AS
    WITH section_aggregates AS (
      SELECT 
        pa.project_id,
        sections.key as section_id,
        SUM(sections.value::numeric) as total_time,
        COUNT(DISTINCT pa.id) as sessions
      FROM project_analytics pa
      CROSS JOIN LATERAL jsonb_each_text(pa.section_times) AS sections(key, value)
      GROUP BY pa.project_id, sections.key
    )
    SELECT 
      p.id as project_id,
      p.title as project_title,
      COUNT(DISTINCT pa.id) as total_sessions,
      AVG(pa.total_time_seconds) as avg_time_seconds,
      SUM(pa.total_time_seconds) as total_time_seconds,
      MIN(pa.session_started_at) as first_view,
      MAX(pa.session_ended_at) as last_view,
      -- Aggreger section times fra CTE
      COALESCE(
        jsonb_object_agg(
          sa.section_id,
          jsonb_build_object(
            'total_time', sa.total_time,
            'sessions', sa.sessions
          )
        ) FILTER (WHERE sa.section_id IS NOT NULL),
        '{}'::jsonb
      ) as section_stats
    FROM projects p
    LEFT JOIN project_analytics pa ON p.id = pa.project_id
    LEFT JOIN section_aggregates sa ON p.id = sa.project_id
    GROUP BY p.id, p.title;
    
    -- Grant access to authenticated users
    GRANT SELECT ON project_analytics_summary TO authenticated;
    
    RAISE NOTICE 'Recreated project_analytics_summary view with SECURITY INVOKER';
  ELSE
    RAISE NOTICE 'View project_analytics_summary does not exist, skipping';
  END IF;
END $$;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON POLICY "authenticated_read_ai_examples" ON ai_examples IS 'All authenticated users can read AI examples';
COMMENT ON POLICY "authenticated_read_case_studies" ON case_studies IS 'All authenticated users can read case studies';
COMMENT ON POLICY "public_read_project_shares" ON project_shares IS 'Anonymous users can read project_shares for public project access';
COMMENT ON POLICY "public_read_project_analytics" ON project_analytics IS 'Anonymous users can read analytics for public tracking';
COMMENT ON VIEW project_analytics_summary IS 'Aggregated analytics summary. Uses SECURITY INVOKER to enforce RLS based on caller permissions.';

