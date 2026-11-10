-- Keep the lead's history and record its customer independently of its project.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_customer_id ON public.leads(customer_id);

CREATE OR REPLACE FUNCTION public.convert_lead_to_customer(
  p_lead_id uuid,
  p_name text,
  p_org_nummer text,
  p_address text,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_existing_customer_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_customer_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Du har ikke tilgang til å konvertere leads.';
  END IF;

  -- Serialize retries/double clicks; all writes roll back together on failure.
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fant ikke leaden.'; END IF;
  IF v_lead.customer_id IS NOT NULL THEN RETURN v_lead.customer_id; END IF;

  IF v_lead.converted_to_project_id IS NOT NULL THEN
    SELECT customer_id INTO v_customer_id FROM public.projects
      WHERE id = v_lead.converted_to_project_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fant ikke prosjektet til leaden.'; END IF;
  END IF;

  IF v_customer_id IS NULL AND p_existing_customer_id IS NOT NULL THEN
    SELECT id INTO v_customer_id FROM public.customers WHERE id = p_existing_customer_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Fant ikke kunden du valgte.'; END IF;
  END IF;

  IF v_customer_id IS NULL THEN
    IF nullif(btrim(p_name), '') IS NULL THEN RAISE EXCEPTION 'Fyll inn kundenavn.'; END IF;
    IF nullif(btrim(p_org_nummer), '') IS NOT NULL THEN
      IF regexp_replace(p_org_nummer, '\s', '', 'g') !~ '^[0-9]{9}$' THEN
        RAISE EXCEPTION 'Organisasjonsnummer må ha 9 siffer.';
      END IF;
      -- Prevent simultaneous conversions with the same organization number.
      PERFORM pg_advisory_xact_lock(hashtextextended(regexp_replace(p_org_nummer, '\s', '', 'g'), 0));
      IF EXISTS (SELECT 1 FROM public.customers WHERE regexp_replace(org_nummer, '\s', '', 'g') = regexp_replace(p_org_nummer, '\s', '', 'g')) THEN
        RAISE EXCEPTION 'En kunde med dette organisasjonsnummeret finnes allerede. Velg eksisterende kunde.';
      END IF;
    END IF;
    IF nullif(btrim(p_email), '') IS NOT NULL AND btrim(p_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RAISE EXCEPTION 'Fyll inn en gyldig e-postadresse.';
    END IF;

    INSERT INTO public.customers (name, org_nummer, address, notes)
      VALUES (btrim(p_name), nullif(regexp_replace(p_org_nummer, '\s', '', 'g'), ''), nullif(btrim(p_address), ''), v_lead.notes)
      RETURNING id INTO v_customer_id;
    IF nullif(btrim(p_contact_name), '') IS NOT NULL OR nullif(btrim(p_email), '') IS NOT NULL OR nullif(btrim(p_phone), '') IS NOT NULL THEN
      INSERT INTO public.customer_contacts (customer_id, name, email, phone, is_primary)
        VALUES (v_customer_id, coalesce(nullif(btrim(p_contact_name), ''), btrim(p_name)), nullif(btrim(p_email), ''), nullif(btrim(p_phone), ''), true);
    END IF;
  END IF;

  IF v_lead.converted_to_project_id IS NOT NULL THEN
    UPDATE public.projects SET customer_id = v_customer_id, updated_at = now()
      WHERE id = v_lead.converted_to_project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kunne ikke koble kunden til prosjektet.'; END IF;
  END IF;
  UPDATE public.leads SET customer_id = v_customer_id, status = 'converted', updated_at = now()
    WHERE id = p_lead_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kunne ikke oppdatere leaden.'; END IF;
  RETURN v_customer_id;
END;
$$;
REVOKE ALL ON FUNCTION public.convert_lead_to_customer(uuid, text, text, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_lead_to_customer(uuid, text, text, text, text, text, text, uuid) TO authenticated;
