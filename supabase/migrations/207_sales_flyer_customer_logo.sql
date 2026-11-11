ALTER TABLE public.sales_flyers
  ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS show_customer_logo boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS sales_flyers_customer_id_idx ON public.sales_flyers(customer_id);
