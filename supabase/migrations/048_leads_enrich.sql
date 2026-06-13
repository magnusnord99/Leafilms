-- Migration 048: Berik leads-tabellen med salgsinformasjon + testdata

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sales_points TEXT[]    NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reason       TEXT,
  ADD COLUMN IF NOT EXISTS website      TEXT,
  ADD COLUMN IF NOT EXISTS cold_email   TEXT;

COMMENT ON COLUMN leads.sales_points IS 'Liste med konkrete salgspunkter — hvorfor passer Leafilms for denne leaden';
COMMENT ON COLUMN leads.reason       IS 'Kortfattet tekst om hvorfor denne leaden er interessant for Leafilms';
COMMENT ON COLUMN leads.website      IS 'Nettside til bedriften';
COMMENT ON COLUMN leads.cold_email   IS 'Ferdig utarbeidet kald e-post som kan sendes rett til leaden';

-- ============================================================
-- TESTDATA: én realistisk lead
-- ============================================================

INSERT INTO leads (
  name,
  company,
  email,
  phone,
  website,
  source,
  status,
  reason,
  sales_points,
  cold_email,
  notes
) VALUES (
  'Kari Nilsen',
  'Norsk Matfestival AS',
  'kari@norskmatfestival.no',
  '+47 920 15 678',
  'norskmatfestival.no',
  'market_analysis',
  'new',

  'Arrangerer tre store matfestivaler per år med over 5 000 besøkende per arrangement. Bruker i dag kun mobilbilder til markedsføring — stort rom for profesjonell video som kan løfte merkevaren og nå nytt publikum.',

  ARRAY[
    'Arrangerer 3 festivaler i året med 5 000+ besøkende',
    'Ingen fast videoproduksjon i dag — kun mobilbilder og amatørfilm',
    'Konkurrenter som Gladmatfestivalen bruker video aktivt i markedsføring',
    'Lanserer ny festival i Bergen høst 2026 — trenger promo-film',
    'Har markedsbudsjett (utlyst stilling som markedssjef med budsjettansvar)'
  ],

  'Hei Kari,

Vi i Leafilms følger med på norsk matscene og la merke til Norsk Matfestival — imponerende å bygge opp tre festivaler med så mange besøkende!

Vi tror en profesjonell kampanjefilm kan løfte merkevaren og nå et helt nytt publikum på sosiale medier og i pressen. Vi har laget promo-filmer for lignende arrangementer og vet hva som skaper engasjement.

Spesielt med den nye Bergen-festivalen i vente hadde det vært spennende å se om det er noe vi kan bidra med. Hadde det passet å ta en kort prat de neste dagene?

Beste hilsen,
Leafilms-teamet',

  'Lead hentet via automatisk markedsanalyse 2026-06-04. Prioritet: høy. Kontakt helst på telefon.'
);
