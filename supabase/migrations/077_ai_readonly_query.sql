-- 077_ai_readonly_query.sql
-- Sikkert lesegrensesnitt for AI-chat-boten

CREATE OR REPLACE FUNCTION execute_readonly_query(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Kun SELECT tillatt
  IF query !~* '^\s*SELECT' THEN
    RAISE EXCEPTION 'Kun SELECT-spørringer er tillatt';
  END IF;

  -- Blokker farlige nøkkelord
  IF query ~* '\m(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|COPY)\M' THEN
    RAISE EXCEPTION 'Ikke-tillatt SQL-operasjon';
  END IF;

  -- Blokker tilgang til sensitive skjemaer (auth, vault, storage, etc.)
  IF query ~* '\m(auth|vault|storage|supabase_functions|information_schema|pg_catalog)\s*\.' THEN
    RAISE EXCEPTION 'Tilgang til dette skjemaet er ikke tillatt';
  END IF;

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query || ' LIMIT 50) t'
    INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Kun service_role kan kalle funksjonen
REVOKE EXECUTE ON FUNCTION execute_readonly_query(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION execute_readonly_query(TEXT) TO service_role;

COMMENT ON FUNCTION execute_readonly_query(TEXT) IS
  'Sikkert grensesnitt for AI-chat: kun SELECT, maks 50 rader, kun service_role';
