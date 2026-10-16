-- 171_transfer_last_downloaded.sql
--
-- `transfers.download_count` finnes allerede og øker korrekt (RLS-policyen
-- "Anon kan oppdatere nedlastingsteller via gyldig lenke" lar kunden
-- oppdatere den anonymt fra /d/[token] — verifisert mot produksjonsdata),
-- men det finnes ikke noe tidspunkt for SISTE nedlasting, og statusen vises
-- ingen steder Magnus faktisk ser etter den (kun en rå tallkolonne i den
-- separate /admin/transfers-listen). Legger til et tidsstempel som
-- lib/actions/transfers.ts sin recordDownload() setter ved hver nedlasting,
-- slik at "Lastet ned"/"Ikke lastet ned ennå"-status kan vises på
-- /admin/transfers og i leveringslistene på e-postsiden.

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS last_downloaded_at TIMESTAMPTZ;
COMMENT ON COLUMN transfers.last_downloaded_at IS 'Satt av recordDownload() i lib/actions/transfers.ts hver gang mottakeren laster ned filen via /d/[token]';
