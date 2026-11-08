-- 187_customer_account_only_b.sql
-- IRREVERSIBELT: dropper email/phone/company fra customers.
-- Kjøres KUN etter eksplisitt klarsignal fra Magnus, og KUN etter at
-- 186_customer_account_only_a.sql er kjørt og verifisert i produksjon.
--
-- Forutsetning: alle customer_contacts-rader er backfilt og reconcilert av
-- migrasjon 186. Stikkprøv at ingen kunde mangler en is_primary=true-kontakt
-- før kjøring.

-- 5. customers representerer nå kun kontoen — all kontaktinfo bor i customer_contacts.
ALTER TABLE customers DROP COLUMN IF EXISTS email;
ALTER TABLE customers DROP COLUMN IF EXISTS phone;
ALTER TABLE customers DROP COLUMN IF EXISTS company;
