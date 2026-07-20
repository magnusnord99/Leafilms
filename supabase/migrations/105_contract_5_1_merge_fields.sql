-- 105_contract_5_1_merge_fields.sql
-- §5.1 hadde to hardkodede verdier i stedet for {{merge-felt}}: hvem som dekker
-- reise/kost/losji (alltid "Oppdragsgiver") og antall crew (alltid "4 personer").
-- Begge er nå felt som fylles automatisk (fra pristilbudets opptaksmannskap for
-- antall crew, og "Oppdragsgiver" som default for reise) og kan overstyres per
-- prosjekt i kontraktskjemaet — jf. feedback d87873fa (reise/kost/losji) og
-- 3271bb54 (antall personer).

UPDATE contract_templates
SET content = replace(
  content,
  $old$Utover kompensasjonen dekker Oppdragsgiver kostnader knyttet til reise, kost og losji for produksjonen for crew på 3 personer fra Oppdragstaker.$old$,
  $new$Utover kompensasjonen dekker {{reise_dekkes_av}} kostnader knyttet til reise, kost og losji for produksjonen for crew på {{antall_crew}} personer fra Oppdragstaker.$new$
)
WHERE language = 'no'
  AND content LIKE '%dekker Oppdragsgiver kostnader knyttet til reise, kost og losji%';

-- Samme fiks i den engelske malen — merk at den hardkodede "3 people" der allerede
-- avvek fra den norske malens "4 personer", noe som underbygger at dette burde vært
-- et felt hele tiden.
UPDATE contract_templates
SET content = replace(
  content,
  $old$In addition to the compensation, the Client covers costs related to travel, meals and accommodation for the production for a crew of 3 people from the Contractor.$old$,
  $new$In addition to the compensation, {{reise_dekkes_av}} covers costs related to travel, meals and accommodation for the production for a crew of {{antall_crew}} people from the Contractor.$new$
)
WHERE language = 'en'
  AND content LIKE '%covers costs related to travel, meals and accommodation%';
