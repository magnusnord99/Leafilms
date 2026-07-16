-- 097_staff_can_view_profiles.sql
-- Interne ansatte kunne til nå kun se sin egen profil via RLS på `profiles`
-- (unntatt admin, som via is_admin() ser alle). Dette var usynlig så lenge alle
-- interne brukere hadde role='admin' — etter at salg/produksjon-rollene ble innført
-- brøt det getConversations() i Meldinger: den henter motpartens navn/e-post via en
-- join fra conversation_participants til profiles, RLS blokkerte joinen stille for
-- ikke-admin, og appen filtrerer bort enhver samtale uten en lest profil-rad —
-- resultat: tom meldingsliste for salg/produksjon selv om samtale og varsel var
-- korrekt opprettet i databasen.
--
-- Fikser ved å la alle interne staff-roller (admin/sales/production) se hverandres
-- profiler — matcher mønsteret ellers i appen der internt delt data (f.eks.
-- project_messages/quote_messages) er lesbart for alle autentiserte, ikke bare admin.
-- Kunde-brukere (role='customer') er fortsatt ekskludert.

CREATE OR REPLACE FUNCTION public.is_staff(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role IN ('admin', 'sales', 'production')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP POLICY IF EXISTS "Staff can view all profiles" ON profiles;
CREATE POLICY "Staff can view all profiles"
  ON profiles FOR SELECT
  USING (public.is_staff(auth.uid()));
