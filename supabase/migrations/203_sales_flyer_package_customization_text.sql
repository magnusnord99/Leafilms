-- Redigerbar tekst per flyer. Behold dagens tekst på eksisterende og nye flyers.
ALTER TABLE public.sales_flyers
  ADD COLUMN IF NOT EXISTS package_customization_text text NOT NULL
  DEFAULT 'Alle pakkene kan skreddersys til deres behov. Ønsker dere mer innhold enn det som er spesifisert her, setter vi gjerne sammen en kvantumspakke. Ta kontakt, så finner vi en løsning som passer dere.';
