-- Fix RLS policies for profiles to avoid infinite recursion
-- The issue is that policies check profiles table, which triggers the same policies

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON profiles;

-- Create a helper function to check if user is admin
-- This function bypasses RLS to avoid recursion
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- New policies that use the helper function or check auth.uid() directly

-- Users can always see their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Admins can see all profiles (using function to avoid recursion)
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (public.is_admin(auth.uid()));

-- Admins can delete profiles (except themselves)
CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  USING (
    public.is_admin(auth.uid()) AND id != auth.uid()
  );

-- Allow inserts (for trigger and initial setup)
-- The trigger will create profiles, so we need to allow inserts
CREATE POLICY "Allow profile inserts"
  ON profiles FOR INSERT
  WITH CHECK (true);

