-- Intern signering av kontrakter: lagret signatur per teammedlem, og
-- Leafilms-signatur på kontrakten (satt ved første publisering, bevart senere).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signature_image TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS our_signature JSONB;
