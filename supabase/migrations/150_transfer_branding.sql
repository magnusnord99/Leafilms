-- 150_transfer_branding.sql
-- Lar en leveranse vise kundens logo (via customer_id, se 149_customer_logos.sql)
-- og et valgfritt bakgrunnsbilde på /d/[token]-siden i stedet for standard
-- Leafilms-branding og flat bakgrunn.

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE transfers ADD COLUMN IF NOT EXISTS background_image_path TEXT;

CREATE INDEX IF NOT EXISTS idx_transfers_customer ON transfers(customer_id);
