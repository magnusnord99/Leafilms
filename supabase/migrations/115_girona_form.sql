-- 115_girona_form.sql
-- Ren for-gøy-side: live formkurve for Girona-sykkeltur 2026. Ingen kobling til
-- resten av appen. Formen settes manuelt (av Magnus, via Claude) en gang i uka —
-- prev_*-kolonnene holder forrige ukes tall slik at siden kan vise endring
-- (+1/-2) i tillegg til gjeldende form. Kun lesetilgang for anon/authenticated;
-- oppdateringer gjøres direkte mot databasen (service role / postgres), aldri
-- via appen.

CREATE TABLE IF NOT EXISTS girona_form (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  sort_order       INT         NOT NULL DEFAULT 0,
  flat_form        INT         NOT NULL DEFAULT 5 CHECK (flat_form BETWEEN 1 AND 10),
  climb_form       INT         NOT NULL DEFAULT 5 CHECK (climb_form BETWEEN 1 AND 10),
  prev_flat_form   INT         NOT NULL DEFAULT 5 CHECK (prev_flat_form BETWEEN 1 AND 10),
  prev_climb_form  INT         NOT NULL DEFAULT 5 CHECK (prev_climb_form BETWEEN 1 AND 10),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE girona_form IS 'For-gøy formkurve til Girona-sykkeltur 2026, oppdateres manuelt utenfor appen';

ALTER TABLE girona_form ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_girona_form" ON girona_form;

CREATE POLICY "public_read_girona_form"
  ON girona_form FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO girona_form (name, sort_order) VALUES
  ('Ådne Eide Stavseng', 1),
  ('Aksel Solberg', 2),
  ('Eivind Nervik Lea', 3),
  ('Elias Bjørdal', 4),
  ('Erlend Bergset', 5),
  ('Johannes Herud Røhnebæk', 6),
  ('Kristian Herud Røhnebæk', 7),
  ('Magnus Nordmo', 8),
  ('Martin Raaen', 9),
  ('Oskar Røhnebæk', 10),
  ('Øystein Bækken Nordmo', 11),
  ('Sondre Bjørke', 12)
ON CONFLICT DO NOTHING;
