-- Legg til pdf_path i quotes tabellen for å lagre path til PDF-filer

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS pdf_path TEXT;

-- Kommentar for dokumentasjon
COMMENT ON COLUMN quotes.pdf_path IS 'Path til PDF-fil i Supabase Storage (f.eks. customers/kunde/prosjekt/quotes/fil.pdf)';

