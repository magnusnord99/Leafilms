-- 179_dashboard_layout_columns.sql
-- Dashboardet gikk fra én enkelt rekkefølge-liste (178) til en to-kolonne
-- layout man redigerer direkte inline på siden (dra widgets rundt, slett,
-- "+ legg til") — widgets kan nå stå ved siden av hverandre, ikke bare
-- stables i én kolonne. En rad = en synlig widget; "enabled" trengs ikke
-- lenger siden fravær av rad nå betyr skjult.

ALTER TABLE dashboard_layouts ADD COLUMN IF NOT EXISTS column_index INT NOT NULL DEFAULT 0;
ALTER TABLE dashboard_layouts DROP COLUMN IF EXISTS enabled;
