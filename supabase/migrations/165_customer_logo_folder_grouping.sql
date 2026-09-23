-- 165_customer_logo_folder_grouping.sql
-- Filer lastet opp som en mappe (webkitdirectory, se "+ Legg til mappe" på
-- kundesiden) skal vises samlet som den mappen de kom fra, ikke som en flat
-- liste av enkeltfiler — feedback: "de vises som mappen man lastet [opp] med
-- mulighet for å klikke seg inn i den eller laste den ned".
--
-- batch_id er den autoritative grupperingsnøkkelen (delt av alle filer fra
-- samme opplasting); folder_name er kun til visning. Enkeltfil-opplastinger
-- ("+ Legg til filer") setter ingen av delene og listes som før.

ALTER TABLE customer_logo_files ADD COLUMN IF NOT EXISTS folder_name TEXT;
ALTER TABLE customer_logo_files ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_customer_logo_files_batch ON customer_logo_files(batch_id);
