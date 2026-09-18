-- Migration 158: "Vår retning"-siden (app/admin/retning) — redigerbart innhold
--
-- Innholdet lå hardkodet i page.tsx. Flyttes til en singleton-rad slik at
-- staff kan redigere teksten i appen (RichNotesEditor/TipTap, samme mønster
-- som notes-feltet på leads) uten kodeendring+deploy for hver justering.
--
-- Staff-only RLS fra dag én (jf. 152-156-hardeningen) — is_staff() dekker
-- admin/sales/production.

CREATE TABLE IF NOT EXISTS company_direction (
  id text PRIMARY KEY,
  content_html text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES profiles(id)
);

ALTER TABLE company_direction ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_company_direction"
  ON company_direction FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_insert_company_direction"
  ON company_direction FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY "authenticated_update_company_direction"
  ON company_direction FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

INSERT INTO company_direction (id, content_html)
VALUES ('main', $html$<h2>Visjon & identitet</h2>
<p><strong>Å være det beste tilbudet på kvalitetsinnhold i Norge. Ikke størst. Ikke billigst. Best.</strong></p>
<p>Vi startet selskapet fordi film og foto er mer enn et yrke — det er en livslang lidenskap. Vi liker å lage ting som faktisk betyr noe, og som ser like bra ut om fem år som i dag. Bedriften skal være passion-drevet, ikke en «fabrikk».</p>
<h3>Kjerneverdier</h3>
<ul>
<li><strong>Ståpåvilje</strong> — Vi gir oss ikke før resultatet er riktig</li>
<li><strong>Nytenkende</strong> — Vi utfordrer format, uttrykk og forventninger</li>
<li><strong>Grundighet</strong> — Kvalitet skapes i detaljene</li>
<li><strong>Morsomt</strong> — Gode prosjekter blir bedre når samarbeidet er gøy</li>
</ul>
<h2>Hva vi tilbyr</h2>
<h3>Tjenester</h3>
<ul><li>Film</li><li>Foto</li><li>Drone</li><li>Sosiale medier-innhold</li><li>Reklamefilm</li><li>Foto & print</li></ul>
<h3>Problemet vi løser</h3>
<ul>
<li>Forstå kundens reelle behov for innhold</li>
<li>Velge riktige formater og uttrykk</li>
<li>Levere et gjennomført prosjekt med én ansvarlig aktør</li>
</ul>
<p>Vi tar eierskap til idé, gjennomføring og sluttresultat, slik at kunden kan være trygg hele veien.</p>
<h3>Entry-produkt</h3>
<p>Branding reel — rask inngang til samarbeid, tydelig verdi.</p>
<h3>Premium-leveranse</h3>
<p>Fullverdig brandingvideo som forteller en historie og kobler selskapet til riktige verdier, mennesker og miljøer.</p>
<h3>Mest etterspurte leveranser</h3>
<ul><li>Én hovedvideo</li><li>Nedklippsversjoner til SoMe</li><li>Stillbilder til kampanje og bruk over tid</li></ul>
<h2>Kunden vår</h2>
<h3>Idealkunde</h3>
<p>Nike Global — referanse for nivå, ikke en begrensning på hvem vi tar som kunde.</p>
<h3>Bransjer</h3>
<ul><li>Sport</li><li>Reklame</li><li>Merkevarebygging</li></ul>
<h3>Beslutningstakere</h3>
<ul><li>Markedsavdeling</li><li>Brand / communication</li><li>Campaign / content-roller</li></ul>
<h3>Persona (fra kickoff-notatene)</h3>
<ul>
<li>Seksjonsleder i en større bedrift, ca. 40–50 år, sitter med beslutningsmyndighet</li>
<li>Liker jobben sin, men en liten del av dem vil gjøre noe annet — liker fart og spenning</li>
<li>«Nå bruker vi litt mer, men da får vi noe ekstra bra»</li>
<li>Eksempler: Breitling, Dressmann, Porsche, Asics, Statkraft, Vitamin Well</li>
</ul>
<h3>Typiske behov</h3>
<ul><li>De trenger innhold</li><li>De trenger hjelp til å velge riktig løsning</li><li>De trenger noen som tar ansvar</li></ul>
<h3>Typiske innvendinger</h3>
<ul><li>Pris</li><li>Omfang</li><li>Usikkerhet rundt hva de faktisk trenger</li></ul>
<h2>Hva skiller oss fra andre</h2>
<p>Vi er et lite, ekstremt samkjørt team som leverer på nivå med langt større produksjoner. Hvert teammedlem er spesialist innen sitt felt, og teamet er bygget med vilje — ikke tilfeldighet.</p>
<h3>Hvorfor kunder velger oss</h3>
<ul><li>High-end kvalitet uten tungt byråapparat</li><li>Kreative, unge og innovative</li><li>Morsomme og profesjonelle å jobbe med</li></ul>
<h3>Vi er</h3>
<ul><li>Kreative, men disiplinerte</li><li>Gjør det lille ekstra — hver gang</li><li>Leverer aldri noe vi ikke selv mener er perfekt</li></ul>
<h3>Hva vi aldri gjør</h3>
<p>Vi leverer aldri halvveis løsninger, selv om budsjettet ikke strekker til. Hvis kvaliteten ikke kan opprettholdes, reduserer vi heller omfanget.</p>
<p><em>Stil og holdning: kreativt, cinematisk og emosjonelt.</em></p>
<h2>Hvordan vi jobber</h2>
<ol>
<li>Forstå behov</li>
<li>Møter og dialog</li>
<li>Forslag til løsning</li>
<li>Produksjon</li>
<li>Etterarbeid</li>
<li>Feedback</li>
<li>Ferdig leveranse</li>
</ol>
<p>Kunden er involvert gjennom hele prosessen for å sikre at forventninger og leveranse samsvarer. Kunden gir strukturert feedback, vi gjør justeringer — men utfordrer feedback hvis vi mener det gir et bedre sluttresultat. Målet er alltid at kunden får det de faktisk trenger, ikke bare det de tror de vil ha.</p>
<h2>Tone of voice & personlighet</h2>
<h3>Personlighet</h3>
<p>Morsom. Energisk. Kreativ. Kunnskapsrik. Profesjonell.</p>
<h3>Språk</h3>
<ul><li>Profesjonelt, men ikke stivt</li><li>Selvsikkert, ikke arrogant</li></ul>
<h3>Posisjonering</h3>
<ul><li>Eksklusive</li><li>Kreative</li><li>Lekne, men seriøse på kvalitet</li></ul>
<h2>Salgs-playbook</h2>
<h3>Hvordan selge oss i én setning</h3>
<p><em>«Vi er et high-end film- og fotoselskap som lager emosjonelt, cinematisk innhold for merkevarer som bryr seg om kvalitet.»</em></p>
<h3>Salgsfokus — selg dette</h3>
<ul><li>Resultatet, ikke bare leveransen</li><li>Trygghet og eierskap</li><li>Kvalitet og kreativitet — ikke pris</li></ul>
<h3>Hvordan snakke om pris</h3>
<ul>
<li>Vi konkurrerer på kvalitet og verdi, ikke lav pris</li>
<li>Vi forklarer hva som inngår, ikke hvorfor vi «er dyre»</li>
<li>Hvis kunden presser på pris → reduser omfang, aldri kvalitet</li>
<li>Ikke unnskyld prisen, ikke diskuter timepris — snakk om helhet, prosess og sluttresultat</li>
</ul>
<h3>Typiske innvendinger — anbefalte svar</h3>
<p><strong>«Vi har ikke budsjett»</strong><br>«Da kan vi se på omfanget og finne en løsning som fortsatt holder kvalitet.»</p>
<p><strong>«Vi kan få dette billigere»</strong><br>«Det finnes alltid billigere alternativer. Vi leverer på et annet nivå.»</p>
<p><strong>«Vi vet ikke helt hva vi vil ha»</strong><br>Still spørsmål, vis eksempler, foreslå tydelige løsninger.</p>
<p><strong>«Kan dere bare filme litt raskt?»</strong><br>«Enten gjør vi dette ordentlig, eller så gjør vi det ikke.»</p>
<h3>Når skal selger involvere produksjonsteamet</h3>
<p>Tidlig i prosessen, spesielt ved tekniske spørsmål, tidsrammer og hva som er realistisk å få til.</p>
<h3>Bevis og trygghet — bruk aktivt</h3>
<ul><li>Case-bibliotek</li><li>Referanser: Breitling, Porsche, Nike, Asics, Statkraft, Vitamin Well</li><li>Tidligere resultater og gjenkjøp</li></ul>
<h2>Markedet & strategi 2026</h2>
<h3>Hvordan markedet er i dag</h3>
<ul>
<li>AI påvirker hele markedet og utviklingen går ekstremt raskt — produksjon blir billigere, raskere og mer tilgjengelig</li>
<li>Færre «gatekeepers»: terskelen for å skape innhold er lavere enn før</li>
<li>Høyt tempo, stort fokus på viralitet — enkelt og autentisk innhold fungerer ofte best på sosiale medier</li>
<li>Større selskaper, strømmetjenester og NRK/Hollywood prioriterer fortsatt budskap og kvalitet i historien</li>
</ul>
<h3>Hvor vi tror markedet beveger seg</h3>
<ul>
<li>Mer mot «slow» og ekte innhold igjen — AI-innhold kan bli mindre spennende når alt begynner å ligne på hverandre</li>
<li>Det autentiske og menneskelige vil skille seg ut mer</li>
<li>Store selskaper blir mindre og mer effektive; små selskaper kan vokse raskere og jobbe smartere</li>
</ul>
<h3>Hvordan vi posisjonerer oss</h3>
<ul>
<li>Bygge videre på sterkt nettverk og gode relasjoner</li>
<li>Fokusere på det ektefølte, menneskelige og autentiske — sterk historiefortelling og følelser</li>
<li>Vurdere eventproduksjon (bryllup, firmaeventer) og dokumentarisk innhold med dybde</li>
<li>Ikke bare volum og viralitet — innhold med verdi og mening</li>
<li>Kombinere det personlige med høy kvalitet</li>
</ul>
<h2>Om 3–5 år</h2>
<p><strong>Vi skal være et naturlig valg for de som ønsker det lille ekstra i prosjektene sine. Vi skal levere ting som skiller seg ut. Vi skal være et naturlig valg for utenlandske selskaper som vil gjøre noe i Norge.</strong></p>
<p>Uttad skal Leafilms virke som et selskap bestående av venner — eget stort levende studio, eierskap til brandet, og en omsetning som gjør at medlemmene kan leve godt av driften. Kjernen forblir arbeidsvilje, kvalitet i alle ledd og lidenskap.</p>$html$)
ON CONFLICT (id) DO NOTHING;
