-- 178_dashboard_layouts.sql
-- Lar hver ansatt tilpasse sitt eget dashboard (/admin): hvilke widgets som vises
-- og i hvilken rekkefølge. Ingen rad for en bruker = bruk registerets standardrekkefølge
-- med alle widgets aktivert (se WIDGET_REGISTRY i components/admin/dashboard/registry.tsx).

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  widget_key  TEXT NOT NULL,
  position    INT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, widget_key)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_profile ON dashboard_layouts(profile_id);

ALTER TABLE dashboard_layouts ENABLE ROW LEVEL SECURITY;

-- Rent personlig innstilling — ingen andre enn eieren skal lese eller skrive den.
CREATE POLICY "Users manage own dashboard layout"
  ON dashboard_layouts FOR ALL TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());
