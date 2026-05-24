-- Prevent self-service/OAuth signups from receiving admin access.
-- Admin invitations are promoted explicitly by /api/auth/invite after user creation.
ALTER TABLE profiles
ALTER COLUMN role SET DEFAULT 'customer';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, name)
  VALUES (
    NEW.id,
    NEW.email,
    'customer',
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Remove permissive development policies that allowed anonymous asset mutation.
DROP POLICY IF EXISTS "Allow upload to assets" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete from assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin upload to assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin update assets" ON storage.objects;
DROP POLICY IF EXISTS "Admin delete from assets" ON storage.objects;

CREATE POLICY "Admin upload to assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'assets'
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Admin update assets"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'assets'
    AND public.is_admin(auth.uid())
  )
  WITH CHECK (
    bucket_id = 'assets'
    AND public.is_admin(auth.uid())
  );

CREATE POLICY "Admin delete from assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'assets'
    AND public.is_admin(auth.uid())
  );
