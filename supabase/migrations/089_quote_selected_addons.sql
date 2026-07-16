-- 089_quote_selected_addons.sql
-- Lagrer kundens avhukede "valgfrie tillegg" på selve tilbudet, slik at
-- valget overlever en sideoppdatering før kontrakten er signert.
-- (Etter signering blir valget i tillegg skrevet inn i quote_data.selectedAddonIds
-- og i selve kontraktteksten — se app/api/contracts/sign/route.ts.)

alter table quotes
  add column if not exists selected_addon_ids jsonb not null default '[]'::jsonb;
