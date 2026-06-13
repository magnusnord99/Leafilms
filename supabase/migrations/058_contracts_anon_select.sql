-- Tillat anon-brukere å lese publiserte kontrakter (for pitch-siden)
-- Uten denne policyene får createPublicClient() null tilbake og signeringsseksjonen vises ikke.
CREATE POLICY "Public can read published contracts"
  ON contracts
  FOR SELECT
  TO anon
  USING (published_at IS NOT NULL);
