-- 143_harden_profile_role.sql
-- To privilege-escalation holes on profiles.role:
--
-- 1) handle_new_user() (016) + column DEFAULT insert every new auth.users row as
--    role='admin'. Google-login on /login uses signInWithOAuth without an invite;
--    if Supabase allows the provider to create the user, the auth callback then
--    treats them as staff and lets them into /admin.
--    Invite-flyten (/api/auth/invite) overskriver rollen etterpå — den fortsetter
--    å virke, og blir fail-closed hvis overskrivingen feiler (customer i stedet
--    for admin).
--
-- 2) RLS-policyen "Users can update own profile" (017) er USING (id = auth.uid())
--    uten restriksjon på kolonner. En innlogget sales/production-bruker kan
--    PATCH-e sin egen rad til role='admin' via den publiserte anon-nøkkelen
--    (supabase-js ligger allerede i admin-bundle). Deretter slipper middleware
--    dem inn på /admin/users, /admin/okonomi, osv.
--
-- Nummer 143 er neste ledige på main (142 er siste produktmigrasjon). Lukket
-- PR #47 brukte 143 til gallery-reviews-RLS som aldri ble merget.

ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'customer';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'customer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_profile_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- service_role (invitasjon via /api/auth/invite) har ingen auth.uid().
  -- Admin-UI-et på /admin/users oppdaterer via innlogget admin-JWT.
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Only admins can change profile roles'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_role_change ON profiles;
CREATE TRIGGER trg_enforce_profile_role_change
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_role_change();

COMMENT ON FUNCTION public.enforce_profile_role_change() IS
  'Blokkerer at en innlogget ikke-admin endrer profiles.role (privilege escalation). Service role og is_admin() er unntatt.';

COMMENT ON COLUMN profiles.role IS
  'admin | sales | production | customer. Nye auth-brukere får customer (handle_new_user); kun admin/service_role kan endre verdien.';
