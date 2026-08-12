-- 143_harden_gallery_reviews_rls.sql
-- Forward repair for databases that already applied:
--   130_image_comments.sql   — "authenticated full access" FOR ALL true
--   131_gallery_reviews.sql  — "authenticated full access" FOR ALL true
--     (gallery_reviews + gallery_review_marks)
--
-- Same class as harden PRs #29/#41/#42/#43/#44/#45/#46.
--
-- Concrete trigger: any customer (or other non-staff) JWT can PostgREST
-- DELETE/UPDATE gallery_reviews. getGalleryForCustomer / getAlbumForCustomer
-- unlock the gallery when the latest review is missing OR status = 'approved',
-- so deleting a pending review (or flipping it to approved) bypasses the
-- internal review gate. gallery_review_marks.note is explicitly internal and
-- must not be readable by customers. image_comments customer writes already
-- go through createServiceClient(); open authenticated CRUD let any JWT wipe
-- or spam comments across all galleries.
--
-- Numbered 143_ to avoid clash with main's 130–142 product migrations and
-- open harden PRs #37 (130_) … #46 (136_).
-- Idempotent — safe if 130/131 were already rewritten in source.

-- image_comments
DROP POLICY IF EXISTS "authenticated full access image_comments" ON image_comments;
DROP POLICY IF EXISTS "staff_all_image_comments" ON image_comments;

CREATE POLICY "staff_all_image_comments"
  ON image_comments FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- gallery_reviews
DROP POLICY IF EXISTS "authenticated full access gallery_reviews" ON gallery_reviews;
DROP POLICY IF EXISTS "staff_all_gallery_reviews" ON gallery_reviews;

CREATE POLICY "staff_all_gallery_reviews"
  ON gallery_reviews FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- gallery_review_marks
DROP POLICY IF EXISTS "authenticated full access gallery_review_marks" ON gallery_review_marks;
DROP POLICY IF EXISTS "staff_all_gallery_review_marks" ON gallery_review_marks;

CREATE POLICY "staff_all_gallery_review_marks"
  ON gallery_review_marks FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
