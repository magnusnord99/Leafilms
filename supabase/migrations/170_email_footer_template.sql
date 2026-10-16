-- 170_email_footer_template.sql
--
-- Felles e-post-footer-mal: Magnus ønsker en profesjonell footer på alle
-- utgående e-poster (app/api/send-email/route.ts), men innholdet (navn,
-- stilling, telefon, e-post) skal variere per avsender. Løsningen er én
-- delt mal i en singleton-rad (samme mønster som company_direction/
-- "Vår retning", 158_company_direction.sql) med plassholdere som fylles inn
-- fra avsenderens egen profil ved sending — se lib/email-footer.ts.
--
-- profiles.job_title er nytt: den eksisterende `role`-kolonnen er en
-- tilgangsrolle ('admin'/'sales'/'production'/'customer'), ikke en
-- visningstittel som "Daglig leder"/"Filmskaper" — trenger et eget
-- fritekstfelt for footeren, redigeres på /admin/profile.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS job_title TEXT;
COMMENT ON COLUMN profiles.job_title IS 'Visningstittel i e-post-footer, f.eks. "Daglig leder" — IKKE det samme som role (tilgangsnivå for RLS)';

CREATE TABLE IF NOT EXISTS email_footer_template (
  id          text PRIMARY KEY,
  template    text NOT NULL DEFAULT '',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES profiles(id)
);
COMMENT ON TABLE email_footer_template IS 'Singleton-rad (id=''main''): én delt footer-mal for alle utgående e-poster. Plassholdere {{name}}/{{job_title}}/{{phone}}/{{email}} fylles inn fra avsenderens profil ved sending, se lib/email-footer.ts';

ALTER TABLE email_footer_template ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_email_footer_template"
  ON email_footer_template FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_insert_email_footer_template"
  ON email_footer_template FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_update_email_footer_template"
  ON email_footer_template FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

-- Hvert felt på egen linje med vilje: renderEmailFooter() dropper en linje helt
-- når linjens eneste plassholder(e) er tom for avsenderen (f.eks. job_title før
-- noen har fylt den inn) — det unngår foreldreløse skilletegn som "{{phone}} · {{email}}"
-- ville gitt hvis bare én av to placeholdere på samme linje var tom.
INSERT INTO email_footer_template (id, template)
VALUES ('main', '{{name}}
{{job_title}}
{{phone}}
{{email}}

Leafilms — [leafilms.no](https://leafilms.no)')
ON CONFLICT (id) DO NOTHING;
