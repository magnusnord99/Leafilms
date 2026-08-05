-- 131_harden_preprod_postprod_rls.sql
-- Forward repair for databases that already applied:
--   122_post_prod_board.sql   — open authenticated CRUD on post_prod_lanes /
--                               post_prod_task_library (USING/WITH CHECK true)
--   127_preprod_messages.sql  — open authenticated SELECT on preprod_messages
--                               (USING true) + insert as self
--
-- Same class as 102/103/123/124 harden migrations (boards, transfers, daily_plan,
-- board_comments). Trigger: any customer JWT can PostgREST SELECT all pre-prod
-- chat, and SELECT/INSERT/UPDATE/DELETE every post-prod lane and library row.
--
-- Idempotent — safe if 122/127 were already rewritten in source.

-- preprod_messages
DROP POLICY IF EXISTS "authed_read_preprod_messages" ON preprod_messages;
DROP POLICY IF EXISTS "authed_insert_preprod_messages" ON preprod_messages;
DROP POLICY IF EXISTS "staff_read_preprod_messages" ON preprod_messages;
DROP POLICY IF EXISTS "staff_insert_preprod_messages" ON preprod_messages;

CREATE POLICY "staff_read_preprod_messages"
  ON preprod_messages FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff_insert_preprod_messages"
  ON preprod_messages FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()) AND auth.uid() = user_id);

-- post_prod_lanes
DROP POLICY IF EXISTS "authenticated_read_post_prod_lanes"   ON post_prod_lanes;
DROP POLICY IF EXISTS "authenticated_insert_post_prod_lanes" ON post_prod_lanes;
DROP POLICY IF EXISTS "authenticated_update_post_prod_lanes" ON post_prod_lanes;
DROP POLICY IF EXISTS "authenticated_delete_post_prod_lanes" ON post_prod_lanes;
DROP POLICY IF EXISTS "staff_read_post_prod_lanes"   ON post_prod_lanes;
DROP POLICY IF EXISTS "staff_insert_post_prod_lanes" ON post_prod_lanes;
DROP POLICY IF EXISTS "staff_update_post_prod_lanes" ON post_prod_lanes;
DROP POLICY IF EXISTS "staff_delete_post_prod_lanes" ON post_prod_lanes;

CREATE POLICY "staff_read_post_prod_lanes"
  ON post_prod_lanes FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_insert_post_prod_lanes"
  ON post_prod_lanes FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_post_prod_lanes"
  ON post_prod_lanes FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_delete_post_prod_lanes"
  ON post_prod_lanes FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));

-- post_prod_task_library
DROP POLICY IF EXISTS "authenticated_read_post_prod_task_library"   ON post_prod_task_library;
DROP POLICY IF EXISTS "authenticated_insert_post_prod_task_library" ON post_prod_task_library;
DROP POLICY IF EXISTS "authenticated_update_post_prod_task_library" ON post_prod_task_library;
DROP POLICY IF EXISTS "authenticated_delete_post_prod_task_library" ON post_prod_task_library;
DROP POLICY IF EXISTS "staff_read_post_prod_task_library"   ON post_prod_task_library;
DROP POLICY IF EXISTS "staff_insert_post_prod_task_library" ON post_prod_task_library;
DROP POLICY IF EXISTS "staff_update_post_prod_task_library" ON post_prod_task_library;
DROP POLICY IF EXISTS "staff_delete_post_prod_task_library" ON post_prod_task_library;

CREATE POLICY "staff_read_post_prod_task_library"
  ON post_prod_task_library FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
CREATE POLICY "staff_insert_post_prod_task_library"
  ON post_prod_task_library FOR INSERT TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_post_prod_task_library"
  ON post_prod_task_library FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_delete_post_prod_task_library"
  ON post_prod_task_library FOR DELETE TO authenticated
  USING (public.is_staff(auth.uid()));
