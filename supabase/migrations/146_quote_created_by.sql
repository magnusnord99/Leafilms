-- 146_quote_created_by.sql
-- Sporer hvem som opprettet et pristilbud, slik at det er synlig i admin hvem
-- som laget det (feedback ec244372) — samme mønster som tasks.created_by/boards.created_by.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
