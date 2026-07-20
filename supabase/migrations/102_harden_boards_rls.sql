-- Boards are internal planning data. The original policies granted every
-- authenticated account (including customers) full CRUD access.

DROP POLICY IF EXISTS "authenticated full access boards" ON public.boards;
DROP POLICY IF EXISTS "staff full access boards" ON public.boards;
CREATE POLICY "staff full access boards"
  ON public.boards
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "authenticated full access board_cards" ON public.board_cards;
DROP POLICY IF EXISTS "staff full access board_cards" ON public.board_cards;
CREATE POLICY "staff full access board_cards"
  ON public.board_cards
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "authenticated full access board_edges" ON public.board_edges;
DROP POLICY IF EXISTS "staff full access board_edges" ON public.board_edges;
CREATE POLICY "staff full access board_edges"
  ON public.board_edges
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "board images auth insert" ON storage.objects;
DROP POLICY IF EXISTS "board images staff insert" ON storage.objects;
CREATE POLICY "board images staff insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'board-images'
    AND public.is_staff(auth.uid())
  );

DROP POLICY IF EXISTS "board images auth delete" ON storage.objects;
DROP POLICY IF EXISTS "board images staff delete" ON storage.objects;
CREATE POLICY "board images staff delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'board-images'
    AND public.is_staff(auth.uid())
  );
