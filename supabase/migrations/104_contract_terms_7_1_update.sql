-- Oppdater 7.1-avsnittet i den norske kontraktmalen (contract_templates) til mer
-- juridisk korrekt bruksrett-tekst, jf. feedback 4e821db4-0c12-4e2a-b657-cb4c4d6a0757.
-- Landvalg og tidsbegrensning er bevisst generelt ("verdensspennende og tidsubegrenset") —
-- den som lager tilbudet justerer dette manuelt per prosjekt ved behov, som før.

UPDATE contract_templates
SET content = replace(
  content,
  $old$Oppdragsgiver kan bruke produsert innhold til web, betalte annonser, hjemmeside og sosiale medier til det avtalte formålet og prosjektet. Visning på fysiske flater, for eksempel TV-reklame og all form for printing, kan gjøres mot et ekstra honorar. Avtale etter bruk. Videresalg eller distribusjon er ikke tillatt uten skriftlig samtykke fra Oppdragstaker.$old$,
  $new$Oppdragsgiver gis en ikke-eksklusiv, verdensspennende og tidsubegrenset bruksrett til levert materiale for bruk på web, sosiale medier, print og øvrige digitale og fysiske flater, herunder både organiske og betalte kanaler. Bruk av materialet i TV-reklame forutsetter særskilt skriftlig avtale og kan medføre tilleggshonorar.$new$
)
WHERE language = 'no'
  AND content LIKE '%Oppdragsgiver kan bruke produsert innhold til web, betalte annonser%';
