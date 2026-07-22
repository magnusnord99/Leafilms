-- 117_customer_contacts.sql
-- Kontaktpersoner per kunde — customers-tabellen har i dag kun ett kontaktfelt
-- (name/email/phone) inline. Denne tabellen lar en kunde ha flere kontaktpersoner,
-- brukt av "legg til person"-velgeren på timeplan-kort på boardet (schedule-korttype).

CREATE TABLE IF NOT EXISTS customer_contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  role        TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);

ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_contacts' AND policyname = 'authenticated full access customer_contacts') THEN
    EXECUTE 'CREATE POLICY "authenticated full access customer_contacts" ON customer_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- Backfill: gjør eksisterende ett-felt-kontakt på customers om til en primær rad,
-- slik at ingen eksisterende kontaktdata går tapt. Idempotent (kjøres kun for kunder
-- som ikke allerede har en rad i customer_contacts).
INSERT INTO customer_contacts (customer_id, name, email, phone, is_primary)
SELECT id, name, email, phone, true
FROM customers
WHERE NOT EXISTS (
  SELECT 1 FROM customer_contacts WHERE customer_contacts.customer_id = customers.id
);
