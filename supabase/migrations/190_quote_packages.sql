-- 190_quote_packages.sql
--
-- Gjør det mulig å merke et vilkårlig, helt normalt tilbud som en
-- gjenbrukbar "pakke" (navn + kategori + rekkefølge) som vises på en
-- sales_flyer (migrasjon 189). is_package_template på prosjektet lar
-- pakke-maler skjules fra den vanlige pipeline/Kanban-tavlen og fra alle
-- omsetnings-/aktivitetstall, uten å løsne quotes.project_id sitt
-- NOT NULL-krav. Se docs/superpowers/specs/2026-11-08-sales-flyers-design.md.
--
-- Ingen RLS-endring — eksisterende policyer på projects/quotes dekker de nye
-- kolonnene uendret (samme rader, bare flere felt på dem).

ALTER TABLE projects ADD COLUMN is_package_template boolean NOT NULL DEFAULT false;

ALTER TABLE quotes ADD COLUMN package_label text;        -- NULL = ikke en pakke
ALTER TABLE quotes ADD COLUMN package_category text CHECK (package_category IN ('foto', 'film', 'foto_film'));
ALTER TABLE quotes ADD COLUMN package_order integer NOT NULL DEFAULT 0;
