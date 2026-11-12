-- Read-only aggregater; beholder eksisterende visningshistorikk og staff-RLS.
CREATE OR REPLACE FUNCTION public.get_sales_flyer_analytics(p_flyer_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_flyers jsonb;
  v_days jsonb;
  v_sources jsonb;
  v_recent jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Du har ikke tilgang til statistikken.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.last_view DESC NULLS LAST, s.slug), '[]'::jsonb) INTO v_flyers
  FROM (
    SELECT f.id, f.slug, f.headline, f.published,
      count(v.id) AS total_views,
      count(v.id) FILTER (WHERE v.viewed_at >= now() - interval '7 days') AS views_7d,
      count(v.id) FILTER (WHERE v.viewed_at >= now() - interval '30 days') AS views_30d,
      min(v.viewed_at) AS first_view, max(v.viewed_at) AS last_view
    FROM public.sales_flyers f LEFT JOIN public.sales_flyer_views v ON v.flyer_id = f.id
    WHERE p_flyer_id IS NULL OR f.id = p_flyer_id
    GROUP BY f.id
  ) s;

  IF p_flyer_id IS NULL THEN RETURN v_flyers; END IF;
  IF jsonb_array_length(v_flyers) = 0 THEN RETURN NULL; END IF;

  SELECT jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'views', coalesce(v.views, 0)) ORDER BY d.day)
    INTO v_days
  FROM generate_series((now() AT TIME ZONE 'Europe/Oslo')::date - 29,
    (now() AT TIME ZONE 'Europe/Oslo')::date, interval '1 day') d(day)
  LEFT JOIN (
    SELECT (viewed_at AT TIME ZONE 'Europe/Oslo')::date AS day, count(*) AS views
    FROM public.sales_flyer_views WHERE flyer_id = p_flyer_id AND viewed_at >= now() - interval '31 days'
    GROUP BY 1
  ) v ON v.day = d.day::date;

  -- Vis kun domenet, aldri URL-parametere eller andre data fra referrer.
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.views DESC, s.source), '[]'::jsonb) INTO v_sources
  FROM (
    SELECT coalesce(lower(substring(referrer from '^https?://([^/?#]+)')), 'Direkte / ukjent') AS source, count(*) AS views
    FROM public.sales_flyer_views WHERE flyer_id = p_flyer_id
    GROUP BY 1 ORDER BY views DESC, source LIMIT 10
  ) s;

  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.viewed_at DESC), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT viewed_at, coalesce(lower(substring(referrer from '^https?://([^/?#]+)')), 'Direkte / ukjent') AS source
    FROM public.sales_flyer_views WHERE flyer_id = p_flyer_id ORDER BY viewed_at DESC LIMIT 50
  ) s;
  RETURN jsonb_build_object('flyer', v_flyers->0, 'days', v_days, 'sources', v_sources, 'recent', v_recent);
END;
$$;
REVOKE ALL ON FUNCTION public.get_sales_flyer_analytics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_flyer_analytics(uuid) TO authenticated;
