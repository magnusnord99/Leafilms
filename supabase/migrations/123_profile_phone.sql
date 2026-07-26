-- 123_profile_phone.sql
-- Telefonnummer på profiles, slik at Leafilms-kontakten på et delt board kan
-- vise telefonnummer til kunden (i tillegg til navn og e-post).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS phone TEXT;
