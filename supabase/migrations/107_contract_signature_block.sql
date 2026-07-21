-- 107_contract_signature_block.sql
-- Malen avsluttet med et gammelt fysisk-signatur-oppsett: blanke stiplede linjer og et
-- hardkodet navn ("Magnus Nordmo"/"LEAFILMS") i stedet for et merge-felt — feil for
-- hvem som helst som faktisk publiserer/signerer på vegne av Leafilms, og uansett
-- overflødig nå. Det nye signerings-systemet (app/api/contracts/pdf-generator.ts,
-- generateContractPDF) tegner allerede en fullstendig signaturseksjon med ekte navn,
-- dato og signaturbilde for begge parter etter selve avtaleteksten — brukt i både
-- admin-forhåndsvisning (download-pdf/route.ts) og kunde-signering (sign/route.ts).
-- Blir denne gamle blokken stående i avtaleteksten, vises signering derfor to ganger:
-- én gang som tom plassholdertekst, én gang som den ekte signaturseksjonen.
-- Jf. feedback 8be83bef. Sted/dato-linjen beholdes etter ønske.
--
-- Kutter alt etter "{{signerings_sted}}, {{signerings_dato}}"-linjen i stedet for å
-- matche resten av teksten ord for ord — mer robust mot små whitespace-avvik.

UPDATE contract_templates
SET content = left(
  content,
  position($m${{signerings_sted}}, {{signerings_dato}}$m$ in content) + length($m${{signerings_sted}}, {{signerings_dato}}$m$)
) || E'\n'
WHERE content LIKE '%Magnus Nordmo%{{kunde_kontakt}}%';
