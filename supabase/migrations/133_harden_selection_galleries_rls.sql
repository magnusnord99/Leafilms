-- 133_harden_selection_galleries_rls.sql
-- Forward repair for databases that already applied:
--   059_selection_galleries.sql — "authenticated full access" FOR ALL true
--                                  + open storage manage on selections bucket
--   067_selection_albums.sql    — "authenticated full access" FOR ALL true
--
-- Same class as 102/103/123/124/131/132 harden migrations.
--
-- Trigger: any customer JWT can PostgREST SELECT selection_galleries /
-- selection_albums (including token + pin_code / album_token + album_pin_code),
-- then bypass the public PIN gate, and DELETE/UPDATE selection_images /
-- selection_album_picks / storage objects in the selections bucket.
--
-- Public customer flows (lib/actions/selections.ts, selection-picks.ts) already
-- use createServiceClient() after token+PIN checks — staff-only RLS is safe.
--
-- Numbered 133_ to avoid clash with open PR #37 (130_), #41 (131_), #42 (132_).
-- Idempotent — safe if 059/067 were already rewritten in source.

-- selection_galleries
DROP POLICY IF EXISTS "authenticated full access galleries" ON selection_galleries;
DROP POLICY IF EXISTS "staff_all_selection_galleries" ON selection_galleries;

CREATE POLICY "staff_all_selection_galleries"
  ON selection_galleries FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- selection_images
DROP POLICY IF EXISTS "authenticated full access images" ON selection_images;
DROP POLICY IF EXISTS "staff_all_selection_images" ON selection_images;

CREATE POLICY "staff_all_selection_images"
  ON selection_images FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- selection_albums
DROP POLICY IF EXISTS "authenticated full access albums" ON selection_albums;
DROP POLICY IF EXISTS "staff_all_selection_albums" ON selection_albums;

CREATE POLICY "staff_all_selection_albums"
  ON selection_albums FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- selection_album_picks
DROP POLICY IF EXISTS "authenticated full access album picks" ON selection_album_picks;
DROP POLICY IF EXISTS "staff_all_selection_album_picks" ON selection_album_picks;

CREATE POLICY "staff_all_selection_album_picks"
  ON selection_album_picks FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- selections storage bucket
DROP POLICY IF EXISTS "authenticated manage selections storage" ON storage.objects;
DROP POLICY IF EXISTS "staff_manage_selections_storage" ON storage.objects;

CREATE POLICY "staff_manage_selections_storage"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'selections' AND public.is_staff(auth.uid()))
  WITH CHECK (bucket_id = 'selections' AND public.is_staff(auth.uid()));
