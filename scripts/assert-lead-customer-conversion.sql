-- Run after the migration. All fixtures are rolled back, including notifications.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM public.profiles WHERE role = 'admin' LIMIT 1), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_project_id uuid;
  v_lead_id uuid;
  v_second_lead_id uuid;
  v_customer_id uuid;
  v_retry_id uuid;
  v_before_count bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Test requires an existing admin profile'; END IF;
  INSERT INTO public.projects (title, slug) VALUES ('Conversion regression fixture', 'conversion-fixture-' || gen_random_uuid()) RETURNING id INTO v_project_id;
  INSERT INTO public.leads (name, company, notes, converted_to_project_id)
    VALUES ('Test Contact', 'Conversion fixture', 'Preserved notes', v_project_id) RETURNING id INTO v_lead_id;

  v_customer_id := public.convert_lead_to_customer(v_lead_id, 'Conversion fixture', '', 'Test address', 'Test Contact', 'conversion@example.com', '12345678');
  IF NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = v_lead_id AND l.customer_id = v_customer_id AND l.status = 'converted' AND l.notes = 'Preserved notes') THEN
    RAISE EXCEPTION 'Lead was not linked/converted or history was lost';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = v_project_id AND p.customer_id = v_customer_id) THEN
    RAISE EXCEPTION 'Project customer link missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customer_contacts c WHERE c.customer_id = v_customer_id AND c.name = 'Test Contact' AND c.email = 'conversion@example.com' AND c.is_primary) THEN
    RAISE EXCEPTION 'Primary contact missing';
  END IF;
  SELECT count(*) INTO v_before_count FROM public.customers;
  v_retry_id := public.convert_lead_to_customer(v_lead_id, 'Duplicate must not exist', '', '', '', '', '');
  IF v_retry_id <> v_customer_id OR (SELECT count(*) FROM public.customers) <> v_before_count THEN
    RAISE EXCEPTION 'Retry created a duplicate';
  END IF;

  INSERT INTO public.leads (name) VALUES ('Existing customer fixture') RETURNING id INTO v_second_lead_id;
  v_retry_id := public.convert_lead_to_customer(v_second_lead_id, '', '', '', '', '', '', v_customer_id);
  IF v_retry_id <> v_customer_id OR (SELECT count(*) FROM public.customers) <> v_before_count THEN
    RAISE EXCEPTION 'Existing customer was duplicated';
  END IF;

  INSERT INTO public.leads (name) VALUES ('Validation fixture') RETURNING id INTO v_second_lead_id;
  BEGIN
    PERFORM public.convert_lead_to_customer(v_second_lead_id, 'Invalid email fixture', '', '', '', 'invalid-email', '');
    RAISE EXCEPTION USING ERRCODE = 'XX000', MESSAGE = 'Invalid email was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;
  IF (SELECT count(*) FROM public.customers) <> v_before_count OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = v_second_lead_id AND l.status = 'converted') THEN
    RAISE EXCEPTION 'Failed conversion left partial records';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', '', true);
  BEGIN
    PERFORM public.convert_lead_to_customer(v_second_lead_id, 'Unauthorized fixture', '', '', '', '', '');
    RAISE EXCEPTION USING ERRCODE = 'XX000', MESSAGE = 'Unauthenticated conversion was accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL;
  END;
  RAISE NOTICE 'PASS: conversion, contact, project link, retry, existing customer, validation and authentication';
END;
$$;
ROLLBACK;
