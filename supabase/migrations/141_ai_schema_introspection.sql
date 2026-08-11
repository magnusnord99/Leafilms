-- Migration 141: Dynamisk skjema-introspeksjon for AI-chat-boten
--
-- lib/ai/schema-context.ts var en hånd-skrevet, statisk liste over tabeller/kolonner
-- som gikk ut av synk med databasen — bl.a. manglet shoot_start/shoot_end/shoot_confirmed
-- og hele contracts-tabellen helt, så boten kunne ikke svare på spørsmål om opptaksdatoer.
-- Denne funksjonen lar chat-koden hente det faktiske public-skjemaet (tabeller, kolonner,
-- typer, CHECK-constraints og kommentarer) direkte fra databasen ved hver forespørsel,
-- så den alltid er oppdatert uten manuelt vedlikehold av en egen tekstbeskrivelse.
--
-- Samme sikkerhetsmønster som execute_readonly_query (077): SECURITY DEFINER,
-- kun service_role kan kalle den, ingen input (ingen injection-flate).

CREATE OR REPLACE FUNCTION get_schema_context()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT string_agg(line, E'\n' ORDER BY table_name, ord)
  FROM (
    -- Tabell/view-overskrift + kommentar
    SELECT
      c.relname AS table_name,
      0 AS ord,
      c.relname || CASE WHEN obj_description(c.oid) IS NOT NULL
        THEN ' — ' || obj_description(c.oid) ELSE '' END AS line
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v')

    UNION ALL

    -- Kolonner: navn, type, kommentar
    SELECT
      c.relname AS table_name,
      a.attnum::int AS ord,
      '  ' || a.attname || ' (' || format_type(a.atttypid, a.atttypmod) || ')'
        || CASE WHEN col_description(c.oid, a.attnum) IS NOT NULL
             THEN ' — ' || col_description(c.oid, a.attnum) ELSE '' END AS line
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v')
      AND a.attnum > 0 AND NOT a.attisdropped

    UNION ALL

    -- CHECK- og FK-constraints (dokumenterer gyldige enum-verdier og relasjoner)
    SELECT
      c.relname AS table_name,
      100000 + row_number() OVER (PARTITION BY c.relname ORDER BY con.conname) AS ord,
      '  ' || CASE con.contype WHEN 'c' THEN 'CHECK: ' WHEN 'f' THEN 'FK: ' ELSE '' END
        || pg_get_constraintdef(con.oid) AS line
    FROM pg_constraint con
    JOIN pg_class c ON con.conrelid = c.oid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND con.contype IN ('c', 'f')
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION get_schema_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_schema_context() TO service_role;

COMMENT ON FUNCTION get_schema_context() IS
  'Genererer en live tekstoversikt over public-skjemaet (tabeller, kolonner, typer, constraints, kommentarer) for AI-chat-boten — leses ved hver forespørsel så den aldri går ut av synk med databasen.';

-- Fyll på manglende/utdaterte kommentarer for forretningsregler som ikke er
-- selvforklarende fra kolonnenavn/type alene (resten av public-skjemaet dokumenteres
-- allerede fint av eksisterende COMMENT-er + CHECK-constraints).

COMMENT ON COLUMN projects.shoot_confirmed IS
  'Opptak regnes som bekreftet når shoot_confirmed = true ELLER prosjektet har en kontrakt med status = ''signed'' i contracts-tabellen. pipeline_stage alene er IKKE pålitelig for bekreftelse — prosjekter kan flyttes forbi kontrakt-steget uten signatur.';

COMMENT ON COLUMN projects.client_name IS
  'Utdatert - bruk customers via customer_id i stedet. Kan være tom/feil på nyere prosjekter.';

COMMENT ON COLUMN projects.delivery_description IS
  'Ofte tom/utdatert. Leveringsinfo til kunden ("hva som skal leveres") ligger i sections der type = ''deliverables'', i content->''deliverableItems''.';

COMMENT ON TABLE sections IS
  'Innhold på prosjektsiden, ett rad per type (JSONB content). type = ''deliverables'' → content->''deliverableItems'' er en array av { id, title, quantity, format, aspectRatio, description } og er kilden til leveringsinfo — ikke projects.delivery_description.';

COMMENT ON COLUMN quotes.quote_data IS
  'JSONB med prisinfo, bl.a. total_price og line_items.';
