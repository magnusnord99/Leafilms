-- Tidligere migrasjon la bare til feltet; visningen brukte fortsatt cta_email.
ALTER TABLE public.sales_flyers
  ADD COLUMN IF NOT EXISTS contact_email text NOT NULL DEFAULT '';

-- Behold dagens mottaker inntil kontaktadressen redigeres separat.
UPDATE public.sales_flyers
SET contact_email = cta_email
WHERE contact_email = '' AND cta_email <> '';
