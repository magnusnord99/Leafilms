-- 175_replace_landing_page_cases_rpc.sql
--
-- lib/actions/industry-landing-pages.ts sin setIndustryLandingPageCases gjorde
-- DELETE og deretter INSERT som to separate klient-kall — funnet under
-- Codex-inspeksjon av 174-byggingen: et nettverksbrudd eller en ugyldig
-- case-id mellom de to kallene lot siden stå igjen med en tom case-liste,
-- uten rollback. En funksjonskropp er implisitt én transaksjon, så samler
-- begge operasjonene i én RPC i stedet.
--
-- SECURITY DEFINER + eksplisitt is_staff()-sjekk inni funksjonen: RPC-kall
-- går ikke automatisk gjennom tabellens RLS-policyer på samme måte som et
-- direkte .from()-kall, så funksjonen må selv håndheve det samme
-- staff-only-kravet som staff_all_industry_landing_page_cases allerede gir.

CREATE OR REPLACE FUNCTION public.replace_landing_page_cases(
  p_page_id uuid,
  p_case_study_ids uuid[]
) RETURNS void AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM industry_landing_page_cases WHERE page_id = p_page_id;

  INSERT INTO industry_landing_page_cases (page_id, case_study_id, order_index)
  SELECT p_page_id, id, ord - 1
  FROM unnest(p_case_study_ids) WITH ORDINALITY AS t(id, ord);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
