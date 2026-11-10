-- 201_package_offers_cleanup.sql
--
-- Rydder opp etter overgangen til package_offers/packages (migrasjon 199-200):
-- de gamle pakke-tilbudene (quotes.package_label IS NOT NULL) er allerede
-- kopiert over til packages med samme id, og sales_flyer_packages/
-- quote_package_showcase_items peker nå på packages(id) i stedet for
-- quotes(id) — derfor er det trygt å slette de gamle quotes-radene her uten
-- at noe cascade-sletter lenkene på nytt. Deretter fjernes selve ghost-
-- prosjektet ("Leafilms — Pakkemaler", is_package_template) og ghost-kunden
-- med samme navn, siden pakker ikke lenger krever et prosjekt.
--
-- quotes.package_label/package_category/package_order og
-- projects.is_package_template STÅR FORTSATT i databasen (ikke droppet) —
-- samme bevisste valg som customers.email/phone/company etter migrasjon
-- 186/187: ingen kode skriver til dem lenger, men en kolonne droppes ikke i
-- samme slengen som dataen den holdt flyttes, i tilfelle noe uventet
-- fortsatt leser den.

DELETE FROM quotes WHERE package_label IS NOT NULL;

DELETE FROM projects WHERE is_package_template = true;

DELETE FROM customers c
WHERE c.name = 'Leafilms — Pakkemaler'
  AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.customer_id = c.id);
