-- Migration 159: Lead-temperatur og kontakt-frist
--
-- Tre feedback-saker om leads (bb6b3251, 71f1caec, 4820c6a6):
-- 1. "source" var låst til en fast dropdown — gjøres om til fritekst i UI,
--    ingen skjemaendring nødvendig (kolonnen er allerede TEXT, se 040).
-- 2. Selgere må kunne markere hvor "varm" en lead er (kald/lunken/varm).
-- 3. Selgere må kunne sette en frist for når leaden senest må kontaktes.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS temperature     TEXT
    CHECK (temperature IN ('cold', 'lukewarm', 'warm')),
  ADD COLUMN IF NOT EXISTS contact_deadline DATE;

COMMENT ON COLUMN leads.temperature      IS 'Hvor varm leaden er: cold (kald), lukewarm (lunken), warm (varm) — valgfritt, satt av selger';
COMMENT ON COLUMN leads.contact_deadline IS 'Frist for når leaden senest bør kontaktes — valgfritt, satt av selger';

CREATE INDEX IF NOT EXISTS idx_leads_contact_deadline ON leads(contact_deadline) WHERE contact_deadline IS NOT NULL;
