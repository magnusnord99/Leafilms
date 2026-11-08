-- 186_customer_account_only_a.sql
-- Separerer customers (konto) fra customer_contacts (personer) — steg 1–4.
-- Steg 5 (DROP COLUMN email/phone/company) ligger i 187_customer_account_only_b.sql
-- og kjøres separat etter eksplisitt klarsignal fra Magnus.
-- Se docs/superpowers/specs/2026-10-16-customer-contacts-separation-design.md.
--
-- NB: De gamle kolonnene (email/phone/company) på customers finnes fortsatt i
-- databasen etter kjøring av DENNE filen, men all kode er oppdatert til å
-- lese/skrive via customer_contacts/invoice_company_name fra nå av.

-- 1. Backfill manglende customer_contacts-rader — fanger opp kunder opprettet
-- via ProjectForm.tsx etter migrasjon 117, som aldri skrev til customer_contacts.
INSERT INTO customer_contacts (customer_id, name, email, phone, is_primary)
SELECT id, name, email, phone, true
FROM customers
WHERE NOT EXISTS (
  SELECT 1 FROM customer_contacts WHERE customer_contacts.customer_id = customers.id
);

-- 2. Flytt fakturarelevant "Firma" ut i en egen kolonne FØR company-feltet
-- droppes i migrasjon B — dette er et annet bruksområde enn visningsnavn-duplikatet
-- i steg 3 (se spec), satt ved kontraktsignering (app/api/contracts/sign/route.ts).
ALTER TABLE customers ADD COLUMN IF NOT EXISTS invoice_company_name TEXT;
UPDATE customers SET invoice_company_name = company
WHERE company IS NOT NULL AND company != ''
  AND (
    invoice_info_confirmed_at IS NOT NULL
    OR org_nummer IS NOT NULL
    OR invoice_email IS NOT NULL
    OR address IS NOT NULL
  );

-- 3. Rett kontonavnet — kunder med firma får firmanavnet som kontonavn,
-- kunder uten firma beholder det eksisterende (person-)navnet.
UPDATE customers SET name = company WHERE company IS NOT NULL AND company != '';

-- 3b. Reconciler: triggeren i steg 4 forhindrer bare FREMTIDIGE avvik — den
-- gjør ingenting med customer_contacts-rader som allerede er i utakt.
-- Demot alle ekstra primærkontakter utover den første (eldste) per kunde:
UPDATE customer_contacts cc
SET is_primary = false
WHERE cc.is_primary = true
  AND cc.id NOT IN (
    SELECT DISTINCT ON (customer_id) id
    FROM customer_contacts
    WHERE is_primary = true
    ORDER BY customer_id, created_at ASC
  );

-- Forfrem én kontakt (den eldste) for kunder som har kontakter men ingen primær:
UPDATE customer_contacts cc
SET is_primary = true
WHERE cc.id IN (
  SELECT DISTINCT ON (customer_id) id
  FROM customer_contacts
  ORDER BY customer_id, created_at ASC
)
AND NOT EXISTS (
  SELECT 1 FROM customer_contacts cc2
  WHERE cc2.customer_id = cc.customer_id AND cc2.is_primary = true
);

-- 3c. Synk avvik: customers.email/phone kan ha blitt endret etter at migrasjon
-- 117 opprettet customer_contacts-raden uten at endringen ble speilet.
-- customers er det aktivt skrevne feltet frem til drop-et i migrasjon B, så det vinner.
UPDATE customer_contacts cc
SET email = CASE WHEN c.email IS NOT NULL AND c.email != '' THEN c.email ELSE cc.email END,
    phone = CASE WHEN c.phone IS NOT NULL AND c.phone != '' THEN c.phone ELSE cc.phone END
FROM customers c
WHERE cc.customer_id = c.id
  AND cc.is_primary = true;

-- 4. Garanter nøyaktig én hovedkontakt per kunde uansett hvor endringen skjer
-- (admin-UI, server action) — samme mønster som varseltriggerne i prosjektet.
CREATE OR REPLACE FUNCTION enforce_single_primary_customer_contact()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE customer_contacts
    SET is_primary = false
    WHERE customer_id = NEW.customer_id
      AND id != NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_primary_customer_contact ON customer_contacts;
CREATE TRIGGER trg_single_primary_customer_contact
BEFORE INSERT OR UPDATE ON customer_contacts
FOR EACH ROW EXECUTE FUNCTION enforce_single_primary_customer_contact();
