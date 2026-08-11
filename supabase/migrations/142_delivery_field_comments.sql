-- Migration 142: Dokumenter leveringsfeltene for AI-boten
--
-- 141 sin kommentar på projects.delivery_description sier leveringsinfo "ligger i
-- sections der type = 'deliverables'" — det stemmer for den kundevendte, strukturerte
-- leveranselisten, men prosjektsiden (app/admin/projects/[id]/page.tsx) skriver også
-- til delivery_video/delivery_photo (migrasjon 050, aldri dokumentert i introspeksjonen).
-- Uten disse kommentarene ville boten fortsatt kunne overse ekte leveringsinfo hvis en
-- admin bare fylte ut video/foto-feltene og lot delivery_description stå tom — nøyaktig
-- samme klasse feil 141 selv ble skrevet for å rette opp.

COMMENT ON COLUMN projects.delivery_description IS
  'Fritekst-oppsummering av leveransen, satt av admin. Kan stå tom selv om delivery_video/delivery_photo er fylt ut (de tre feltene fylles uavhengig av hverandre) — sjekk alle tre. Den kundevendte, strukturerte leveranselisten som faktisk styrer post-produksjonspipelinen ligger i sections der type = ''deliverables'', i content->''deliverableItems''.';

COMMENT ON COLUMN projects.delivery_video IS
  'Fritekst om hva som leveres av film/video, satt av admin uavhengig av delivery_description. Kan være det eneste utfylte leveringsfeltet.';

COMMENT ON COLUMN projects.delivery_photo IS
  'Fritekst om hva som leveres av bilder, satt av admin uavhengig av delivery_description. Kan være det eneste utfylte leveringsfeltet.';
