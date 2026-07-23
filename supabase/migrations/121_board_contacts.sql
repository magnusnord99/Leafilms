-- 121_board_contacts.sql
-- Kontaktpersoner per board: én fra Leafilms (prosjektansvarlig, valgt blant
-- profiles — samme kilde som projects.project_lead_id) og én fra kunden
-- (valgt blant customer_contacts for prosjektets kunde). Settes per board,
-- ikke per prosjekt, siden et prosjekt kan ha flere boards (rot + underboards).

ALTER TABLE boards
  ADD COLUMN IF NOT EXISTS lead_profile_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_contact_id UUID REFERENCES customer_contacts(id) ON DELETE SET NULL;
