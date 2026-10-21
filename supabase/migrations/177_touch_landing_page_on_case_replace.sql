-- 177_touch_landing_page_on_case_replace.sql
--
-- Funnet under Codex-inspeksjon: replace_landing_page_cases endret kun
-- industry_landing_page_cases, aldri foreldre-sidens updated_at/updated_by.
-- Å legge til, fjerne eller flytte cases endrer publisert innhold, men
-- /admin/landingssider sin "sist oppdatert"-sortering/visning forble på det
-- gamle tidspunktet. Legger til samme oppdatering som
-- updateIndustryLandingPage allerede gjør for tekstfelt, inni samme låste
-- transaksjon (raden er allerede låst av SELECT ... FOR UPDATE over).

CREATE OR REPLACE FUNCTION public.replace_landing_page_cases(
  p_page_id uuid,
  p_case_study_ids uuid[]
) RETURNS void AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM industry_landing_pages WHERE id = p_page_id FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'landing page % not found', p_page_id;
  END IF;

  DELETE FROM industry_landing_page_cases WHERE page_id = p_page_id;

  INSERT INTO industry_landing_page_cases (page_id, case_study_id, order_index)
  SELECT p_page_id, id, ord - 1
  FROM unnest(p_case_study_ids) WITH ORDINALITY AS t(id, ord);

  UPDATE industry_landing_pages
  SET updated_at = now(), updated_by = auth.uid()
  WHERE id = p_page_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
