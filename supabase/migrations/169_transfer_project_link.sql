-- 169_transfer_project_link.sql
--
-- 074_transfers.sql lagret kun customer_id på en leveranse — koblingen til
-- prosjekt ble bare sendt som URL-query-param i UI, ikke i databasen.
-- Nå som leveransesteget i pipeline skal sende filer direkte fra prosjektsiden
-- (app/admin/projects/[id]/email), trenger vi en ekte project_id-kobling slik
-- at vi kan hente ut alle leveranser for et gitt prosjekt.
-- Kolonnen er nullable (eksisterende leveranser har ikke project_id).

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS project_id uuid
    REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transfers_project_id
  ON transfers(project_id);
