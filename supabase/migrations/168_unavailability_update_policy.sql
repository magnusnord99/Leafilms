-- 168_unavailability_update_policy.sql
--
-- 133_unavailability.sql ga RLS-policyer for SELECT/INSERT/DELETE, men ingen
-- UPDATE — med RLS enablet betyr det at UPDATE var fullstendig blokkert, ikke
-- bare begrenset. Magnus: la en "besøke Andrea"-markering stå med feil lengde
-- fordi han bare kunne slette og opprette på nytt, ikke redigere tidsrommet.

CREATE POLICY "Users can update own unavailability"
  ON unavailability FOR UPDATE TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
