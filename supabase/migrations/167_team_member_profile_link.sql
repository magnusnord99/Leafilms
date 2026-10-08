-- 167_team_member_profile_link.sql
--
-- team_members (pitch-biblioteket, "Team" på /admin/team) matches i dag mot
-- profiles kun implisitt via e-post-streng (getPitchTeamAsProdCrew i
-- lib/actions/preprod.ts) — stille og usynlig for den som bygger en pitch.
-- Magnus (etter feedback 706674ff): når man velger team i pitchen bør man se
-- hvem som faktisk har en Leafilms-konto (og dermed blir med i prosjektteamet/
-- får varsler) og hvem som bare vises i den kundevendte pitchen (frilansere
-- uten innlogging).
--
-- Legger til en EKSPLISITT, lagret kobling (profile_id) i stedet for å stole
-- på at e-postfeltet alltid matcher nøyaktig — mer robust enn strengmatching,
-- og gjør "har konto eller ikke" til en synlig, satt verdi i UI-et i stedet for
-- noe som bare regnes ut bak kulissene. Eksisterende rader der e-posten allerede
-- matcher en profil, backfylles slik at ingenting som fungerte før slutter å
-- fungere.

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_profile_id ON team_members(profile_id);

COMMENT ON COLUMN team_members.profile_id IS
  'Eksplisitt kobling til en ekte Leafilms-konto (profiles). NULL = frilanser/ekstern uten innlogging — vises kun i kundevendt pitch, kan ikke varsles eller legges i prosjektteamet.';

UPDATE team_members tm
SET profile_id = p.id
FROM profiles p
WHERE tm.profile_id IS NULL
  AND tm.email IS NOT NULL
  AND lower(tm.email) = lower(p.email);
