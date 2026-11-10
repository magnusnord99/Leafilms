-- 199_sales_flyer_contact_email.sql
--
-- Egen e-postadresse for flyerens generelle "Ta kontakt"-knapp (bunn-CTA-en),
-- adskilt fra cta_email som brukes av per-pakke-knappene ("Velg denne
-- pakken"). Tidligere delte begge cta_email — feedback 2026-11-10: "kan
-- email til 'kontakt' og CTA være to forskjellige emails".
--
-- Bevisst INGEN default post@leafilms.no, samme begrunnelse som cta_email i
-- 189_sales_flyers.sql — tom streng skal bety "ingen knapp vist", ikke en
-- feilaktig delt innboks ingen sjekker.

ALTER TABLE sales_flyers ADD COLUMN contact_email text NOT NULL DEFAULT '';
