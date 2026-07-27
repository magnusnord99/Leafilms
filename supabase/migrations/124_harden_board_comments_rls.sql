-- Board comments are internal planning discussion. The original policies granted
-- every authenticated account (including customers) full CRUD access via PostgREST.

DROP POLICY IF EXISTS "authenticated full access board_comment_threads" ON public.board_comment_threads;
DROP POLICY IF EXISTS "staff full access board_comment_threads" ON public.board_comment_threads;
CREATE POLICY "staff full access board_comment_threads"
  ON public.board_comment_threads
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "authenticated full access board_comments" ON public.board_comments;
DROP POLICY IF EXISTS "staff full access board_comments" ON public.board_comments;
CREATE POLICY "staff full access board_comments"
  ON public.board_comments
  FOR ALL
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
