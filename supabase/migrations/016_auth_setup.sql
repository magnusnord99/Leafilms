-- Authentication setup
-- Dette setter opp autentisering med Supabase Auth og profiles tabell

-- 1. Opprett profiles tabell for brukerinfo
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin', -- 'admin' eller 'customer'
  name TEXT,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL, -- NULL for admin, koblet til customer for kunde-brukere
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Opprett indexes for bedre ytelse
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_customer_id ON profiles(customer_id);

-- 3. Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- Admin kan se alle profiles
CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Brukere kan se sin egen profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

-- Admin kan oppdatere alle profiles
CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Brukere kan oppdatere sin egen profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Admin kan slette profiles (unntatt seg selv)
CREATE POLICY "Admins can delete profiles"
  ON profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
    AND id != auth.uid() -- Kan ikke slette seg selv
  );

-- 5. Trigger for å automatisk opprette profile når bruker opprettes i auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'admin')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Slett eksisterende trigger hvis den finnes
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Opprett trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Trigger for å oppdatere updated_at automatisk
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Kommentarer for dokumentasjon
COMMENT ON TABLE profiles IS 'Brukerprofiler knyttet til Supabase Auth';
COMMENT ON COLUMN profiles.id IS 'UUID fra auth.users, primary key';
COMMENT ON COLUMN profiles.role IS 'admin eller customer';
COMMENT ON COLUMN profiles.customer_id IS 'NULL for admin, koblet til customer for kunde-brukere';

