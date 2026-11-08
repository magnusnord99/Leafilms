-- 176_lock_replace_landing_page_cases.sql
--
-- Funnet under Codex-inspeksjon av 175: replace_landing_page_cases var
-- transaksjonell internt (DELETE+INSERT i én funksjonskropp), men serialiserte
-- ikke to SAMTIDIGE kall for samme side — to staff-sesjoner som erstatter en
-- tom case-liste med hhv. [A] og [B] samtidig kunne begge få sine DELETE-
-- setninger til å treffe null rader og begge INSERT-setningene til å lykkes,
-- og sluttresultatet ble en liste med BÅDE A og B på order_index 0, i stedet
-- for én av de to listene brukeren faktisk ba om.
--
-- Retter ved å låse foreldreraden (SELECT ... FOR UPDATE) før DELETE/INSERT —
-- det andre samtidige kallet venter til det første er ferdig (committed) før
-- det får låsen, slik at de to erstatningene serialiseres i stedet for å
-- flette sammen. Avviser også et ukjent page_id eksplisitt (i stedet for å
-- stille lykkes med null effekt).

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
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
