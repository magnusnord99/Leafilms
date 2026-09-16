-- Contract system: add columns to contracts, create templates table, seed default template, RLS

-- 1. Legg til nye kolonner på eksisterende contracts-tabell
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS contract_text TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 2. Opprett contract_templates-tabell
CREATE TABLE IF NOT EXISTS contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Pre-seed standard kontraktmal
INSERT INTO contract_templates (content)
VALUES ($$Produksjonsavtale mellom
LEAFILMS & {{bedrift}}

1. Innledning

Denne avtalen er ment å definere detaljene i samarbeidet mellom Leafilms og {{bedrift}}, org.nummer {{org_nummer}}.

2. Avtaleparter

Avtalen inngås mellom Leafilms ("Oppdragstakeren") og {{bedrift}} ("Oppdragsgiver").

3. Gjennomføring

Produksjonen skal gjennomføres i {{produksjons_periode}}.

Oppstartsdato: {{oppstart_dato}}
Dager for opptak:

{{opptak_datoer}}

Det skal tilstrebes å kun ha én revisjon per film og bilder, og Oppdragsgiver skal gi en samlet, skriftlig tilbakemelding på eventuelle endringer.

Oppdragsgiver sender nødvendig fakturainfo til Oppdragstaker innen én uke før første opptak, og samarbeidsavtale må være signert før produksjonen starter.

Endelig leveranse overleveres senest innen to uker etter siste opptaksdag, med mindre annet er skriftlig avtalt mellom partene.

4. Hva produksjonsavtalen omfatter

Det er enighet om at følgende skal leveres av Oppdragstakeren:

{{leveranse}}

5. Økonomi

5.1
Utbetalt kompensasjon for aktivitetene slik definert under punkt 4 og i prisoverslag sendt på email, skal være på til sammen:

{{totalpris}} eks. mva.

Ekstra levering av bilder og video kan gjøres mot ekstra honorar.

Utover kompensasjonen dekker Oppdragsgiver kostnader knyttet til reise, kost og losji for produksjonen for crew på 4 personer fra Oppdragstaker.

Fakturaen deles opp i to like betalinger. Den første halvparten faktureres ved signering av produksjonsavtalen, og den andre halvparten faktureres etter siste produksjonsdag. Vær oppmerksom på at forsinkede betalinger kan medføre ekstra gebyrer. Betalingsbetingelsene for fakturaen er 14 dager.

5.2
Ekstra kostnader kan påløpe avhengig av bruk av produsert innhold, se 7.1.

6. Teknisk

Oppdragstakeren stiller med nødvendig utstyr og personell for videoproduksjonen
Oppdragstaker setter opp interaktiv produksjonsmappe med moodboard etc.
Oppdragstaker er ansvarlig for statister/talenter/modeller
Oppdragsgiver er ansvarlig for bekledning og rekvisitter
Oppdragstaker er ansvarlig for lokasjon, reise og bookinger

7. Bruksrett av innhold

7.1 - Oppdragsgivers rett til bruk av innhold
Oppdragsgiver kan bruke produsert innhold til web, betalte annonser, hjemmeside og sosiale medier til det avtalte formålet og prosjektet. Visning på fysiske flater, for eksempel TV-reklame og all form for printing, kan gjøres mot et ekstra honorar. Avtale etter bruk. Videresalg eller distribusjon er ikke tillatt uten skriftlig samtykke fra Oppdragstaker.

Om ikke avklart på forhånd må Oppdragsgivers bruk av innhold på fysiske flater avklares med modeller, musikere, talenter, statister og eventuelt andre som har bidratt til produksjonen. Avtale om ekstra kompensasjon til disse aktørene kan gjøres via Oppdragstakeren.

Oppdragtaker beholder full opphavsrett til alt produsert materiale. Oppdragsgiver gis bruksrettigheter til det avtalte formålet og prosjektet. Videre salg eller distribusjon er ikke tillatt uten skriftlig forhåndssamtykke fra Oppdragstaker.

Oppdragstaker tar ikke ansvar for å lagre råmaterialet (video/bilde/lyd) i mer enn to uker etter at bearbeidet materiale er overlevert.

Ved eventuell overføring av råmateriale, må en harddisk (SSD) leveres av Oppdragsgiver til Oppdragstaker.

Musikk og videoklipp kan kun brukes til dette prosjektet. Ytterligere bruk til andre prosjekter kan gjøres mot et ekstra honorar.

7.2 - Oppdragstakers rett til bruk av innhold

Oppdragstakeren står fritt til å bruke produsert innhold som markedsføring for sitt virke som Innholdsprodusent.

Oppdragsgiver gir med dette Oppdragstaker rett til å filme, gjøre lydopptak og avbilde Oppdragsgiver i forbindelse med arbeidet med produksjonen ("Behind the Scenes"). Samtykket til filming har ingen begrensninger verken i media, tid eller sted og kan ikke trekkes tilbake. Alle opptak, bilder og andre immaterielle rettigheter av ethvert slag som oppstår gjennom Oppdragstaker filmande og/eller fotografernade eies av Oppdragstaker. Oppdragsgiver er innforstått med at opptakene kan bli vist på TV eller i andre media, og at Oppdragsgiver ikke mottar vederlag for dette. Oppdragsgiver kan be om å godkjenne eventuelle "behind the scenes" innhold.

7.3 - Kreditering
Oppdragstakeren skal krediteres i henhold til bransjestandarder der materialet brukes, så langt det er praktisk mulig. @leafilms.mov på sosiale medier.

8. Uforutsette hendelser

Om Oppdragstakeren av uforutsette årsaker må kansellere oppdrag, så er Oppdragstakeren ansvarlig, etter beste evne, å finne en erstatter som kan steppe inn til samme pris og kvalitet.
Hvis uforutsette omstendigheter (f.eks. ekstremvær eller andre faktorer utenfor oppdragstakers kontroll) hindrer gjennomføringen av produksjonen som planlagt, vil alternative løsninger bli avtalt i samråd med kunden. Eventuelle forsinkelser eller omplanlegging kan medføre ekstra kostnader.
Dersom Oppdragsgiver kansellerer av uforutsette årsaker innen 14 dager før oppstartsdato, skal 50 % av kompensasjonen som spesifisert i punkt 5 faktureres. Ved kansellering innen 48 timer før oppstartsdato, faktureres 100 % av kompensasjonen.

9. Oppsigelse

Hver av Partene har rett til å si opp Avtalen med umiddelbar virkning dersom det foreligger vesentlig mislighold på den annen Part og kan kreve erstatning etter de alminnelige erstatningsrettslige regler. Hevingserklæringen skal være skriftlig.

10. Endringer
Alle tillegg og endringer til Avtalen skal gjøres skriftlig og skal være undertegnet av begge Parter.


{{signerings_sted}}, {{signerings_dato}}


____________________                         ____________________
Magnus Nordmo                            {{kunde_kontakt}}
LEAFILMS                                {{bedrift}}$$);

-- 4. RLS på contract_templates
-- Staff-only: customer JWTs must not overwrite legal contract templates
-- via PostgREST. 054 runs before is_staff() (097), so the role check is inline.
ALTER TABLE contract_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users manage templates" ON contract_templates;

CREATE POLICY "Auth users manage templates"
  ON contract_templates FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'sales', 'production')
    )
  );

-- 5. RLS på contracts — policy for anon INSERT (signering)
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'contracts' AND policyname = 'Public can sign contracts'
  ) THEN
    EXECUTE 'CREATE POLICY "Public can sign contracts" ON contracts FOR INSERT TO anon WITH CHECK (true)';
  END IF;
END$$;
