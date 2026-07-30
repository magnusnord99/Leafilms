-- 133_unavailability.sql
-- Lar ansatte markere seg selv som utilgjengelig i kalenderen (f.eks. tannlege,
-- trening) uten å måtte skrive hva de skal — kun dato og valgfritt klokkeslett.
-- I motsetning til møter er dette rent informativt: synlig for alle ansatte
-- uansett hvilket person-filter kalenderen viser, men blokkerer ikke booking.

CREATE TABLE IF NOT EXISTS unavailability (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  start_time  TIME,
  end_time    TIME,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unavailability_profile ON unavailability(profile_id);
CREATE INDEX IF NOT EXISTS idx_unavailability_date ON unavailability(date);

ALTER TABLE unavailability ENABLE ROW LEVEL SECURITY;

-- Synlig for alle ansatte (samme is_staff() som profiles, 097_staff_can_view_profiles.sql) —
-- hele poenget er at kolleger skal se det før de booker deg.
CREATE POLICY "Staff can read all unavailability"
  ON unavailability FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "Users can create own unavailability"
  ON unavailability FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can delete own unavailability"
  ON unavailability FOR DELETE TO authenticated
  USING (profile_id = auth.uid());
