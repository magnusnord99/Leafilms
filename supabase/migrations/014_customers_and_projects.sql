-- Customers and Projects structure
-- Dette legger til kunde-struktur og kobler prosjekter til kunder

-- 1. Opprett customers tabell
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  company TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Legg til customer_id i projects (nullable for bakoverkompatibilitet)
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

-- 3. Opprett quotes tabell (tilbud knyttet til prosjekter)
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  sheet_url TEXT NOT NULL, -- Google Sheets URL
  version TEXT DEFAULT 'V1',
  status TEXT DEFAULT 'draft', -- 'draft', 'sent', 'accepted', 'rejected'
  accepted_at TIMESTAMPTZ,
  accepted_by TEXT, -- Email eller navn på person som aksepterte
  quote_data JSONB, -- Lagret quote data fra API
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Opprett contracts tabell (kontrakter knyttet til tilbud)
CREATE TABLE IF NOT EXISTS contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  pdf_path TEXT, -- Path til kontrakt PDF i storage
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'signed', 'cancelled'
  signed_at TIMESTAMPTZ,
  signed_by TEXT, -- Email eller navn på person som signerte
  signature_data JSONB, -- Data fra signeringstjeneste (DocuSign, etc.)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Opprett indexes for bedre ytelse
CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotes_project_id ON quotes(project_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_contracts_quote_id ON contracts(quote_id);
CREATE INDEX IF NOT EXISTS idx_contracts_project_id ON contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- 6. Disable RLS for development (kan aktiveres senere)
ALTER TABLE customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE quotes DISABLE ROW LEVEL SECURITY;
ALTER TABLE contracts DISABLE ROW LEVEL SECURITY;

-- 7. Migrer eksisterende client_name til customers (hvis det finnes)
-- Dette lager kunder basert på eksisterende client_name i projects
INSERT INTO customers (name, company, created_at, updated_at)
SELECT DISTINCT 
  COALESCE(client_name, 'Ukjent kunde') as name,
  COALESCE(client_name, 'Ukjent kunde') as company,
  MIN(created_at) as created_at,
  NOW() as updated_at
FROM projects
WHERE client_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM customers WHERE customers.name = projects.client_name
  )
GROUP BY client_name;

-- 8. Oppdater projects med customer_id basert på client_name
UPDATE projects p
SET customer_id = c.id
FROM customers c
WHERE p.client_name = c.name
  AND p.customer_id IS NULL;

-- Kommentarer for dokumentasjon
COMMENT ON TABLE customers IS 'Kunder som har prosjekter';
COMMENT ON TABLE quotes IS 'Pristilbud knyttet til prosjekter';
COMMENT ON TABLE contracts IS 'Kontrakter knyttet til tilbud og prosjekter';
COMMENT ON COLUMN quotes.status IS 'draft, sent, accepted, rejected';
COMMENT ON COLUMN contracts.status IS 'pending, sent, signed, cancelled';

