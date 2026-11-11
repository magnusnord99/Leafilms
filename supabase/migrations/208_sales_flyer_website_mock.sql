-- Tomt objekt følger flyerens medier og standardtekst. Nøkler overstyrer kun mockupen.
ALTER TABLE public.sales_flyers
  ADD COLUMN IF NOT EXISTS website_mock jsonb NOT NULL DEFAULT '{}'::jsonb
  CHECK (jsonb_typeof(website_mock) = 'object');
