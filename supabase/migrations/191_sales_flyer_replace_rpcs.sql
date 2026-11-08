-- 191_sales_flyer_replace_rpcs.sql
--
-- Atomiske replace-RPC-er for flyerens ordnede case-liste og pakke-liste,
-- samme mønster som replace_landing_page_cases (migrasjon 175), videre
-- låst av 176-177: en funksjonskropp er implisitt én transaksjon (unngår
-- delete+insert-raceet mellom to separate klient-kall), og
-- SELECT ... FOR UPDATE på foreldre-raden (sales_flyers) serialiserer to
-- SAMTIDIGE replace-kall for samme flyer i stedet for at de flettes sammen,
-- pluss et eksplisitt avvist ukjent flyer_id i stedet for et stille no-op.

CREATE OR REPLACE FUNCTION public.replace_sales_flyer_cases(
  p_flyer_id uuid,
  p_case_study_ids uuid[]
) RETURNS void AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM 1 FROM sales_flyers WHERE id = p_flyer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown flyer_id';
  END IF;

  DELETE FROM sales_flyer_cases WHERE flyer_id = p_flyer_id;

  INSERT INTO sales_flyer_cases (flyer_id, case_study_id, order_index)
  SELECT p_flyer_id, id, ord - 1
  FROM unnest(p_case_study_ids) WITH ORDINALITY AS t(id, ord);

  UPDATE sales_flyers SET updated_at = now() WHERE id = p_flyer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.replace_sales_flyer_packages(
  p_flyer_id uuid,
  p_quote_ids uuid[]
) RETURNS void AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM 1 FROM sales_flyers WHERE id = p_flyer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown flyer_id';
  END IF;

  DELETE FROM sales_flyer_packages WHERE flyer_id = p_flyer_id;

  INSERT INTO sales_flyer_packages (flyer_id, quote_id, order_index)
  SELECT p_flyer_id, id, ord - 1
  FROM unnest(p_quote_ids) WITH ORDINALITY AS t(id, ord);

  UPDATE sales_flyers SET updated_at = now() WHERE id = p_flyer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
