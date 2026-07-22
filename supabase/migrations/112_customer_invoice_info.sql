-- Fakturainformasjon samlet inn fra kunden ved kontraktsignering. company/org_nummer/address
-- gjenbrukes fra kundekortet (fylles/oppdateres ved signering); disse to er nye:
-- invoice_email kan avvike fra kundens vanlige e-post, invoice_reference er valgfri PO/merking.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS invoice_email TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS invoice_reference TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS invoice_info_skipped BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS invoice_info_confirmed_at TIMESTAMPTZ;
