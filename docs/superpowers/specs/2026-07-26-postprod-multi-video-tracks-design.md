# Flere videoer samtidig i post-produksjon — analyse og forslag

**Dato:** 2026-07-26
**Status:** SUPERSEDERT av [2026-07-27-signed-deliverables-postprod-design.md](2026-07-27-signed-deliverables-postprod-design.md) — Magnus ønsket en større omskrivning (kontrakt-signering som frys-punkt for en strukturert leveranseliste, faner i post-prod) enn forslag C her. Research-delen (seksjon 1-2, de tre frakoblede leveranse-kildene) er fortsatt gyldig og gjenbrukt i det nye dokumentet.

Magnus sitt oppdrag (natt til 2026-07-26): *"Vi må legge til funksjon i postprod at man kan ha flere videoer i gang — noen prosjekter krever logging, farger osv på flere videoer samtidig. Dette burde hentes fra informasjon om levering i preprod. Levering skal settes når kontrakt skrives, så skal postprod-blokken endre seg til å passe dette."*

Bygger videre på [2026-07-22-post-prod-board-design.md](2026-07-22-post-prod-board-design.md) (post-prod-brettet v2 — dra-og-slipp, egendefinerte lanes).

## 1. Problemet

Post-prod-brettet (`PostProdBoard.tsx` / `getPostProdBoard` i `lib/actions/pipeline.ts`) er bygget rundt `projects.project_type` (`video` | `photo` | `mixed`). Det gir **maks to innebygde spor**: én Video-lane og/eller én Foto-lane, seedet fra `task_templates`. `tasks.sub_type` er en binær diskriminator (`'video' | 'photo' | null`) — det finnes ingen måte å representere «2 separate videoer» på i dagens modell. Et prosjekt som leverer f.eks. en hovedfilm *og* en egen highlightsreel/sosiale medier-kutt, må i dag håndtere begge i samme Video-lane, med samme sekvens av Logging→Grovklipp→Klipp→Farger→Lyd→Ferdig-kort — man kan ikke se eller styre fremdriften på de to videoene hver for seg.

Dagens delvise løsning: man *kan* opprette en egendefinert lane (`post_prod_lanes`, «+ Ny lane») og manuelt dra inn Logging/Klipp/Farger-kort én etter én. Det funker, men er tungvint og lett å glemme — ingenting kobler det til hva som faktisk ble avtalt med kunden.

## 2. Dagens leveranse-informasjon — tre frakoblede kilder

Jeg gikk gjennom hele kodebasen for å finne alt som beskriver «hva leverer vi». Det finnes **tre ulike, ikke-koblede representasjoner**:

1. **Pitch-siden** (`sections.content.deliverableItems`, redigert i `/admin/projects/[id]/edit`): en liste med `{ title, quantity, format, aspectRatio }` — markedsføringstekst til kunden *før* de har signert. Ikke bundet til video/foto som type, brukes ikke noe sted utenfor selve pitchen.
2. **Tilbudsbyggeren** (`QuoteBuilderData.deliveryDescription`, fritekst): «Hva leveres til kunden» — skrives når tilbudet lages. Lagres på `projects.delivery_description`.
3. **Kontrakten** (`lib/actions/contracts.ts:147`): `leveranse: proj.delivery_description || '___'` — samme fritekst fra (2), limt rett inn som juridisk leveransebeskrivelse i kontrakt-PDF-en.
4. **Post-prod** (`projects.project_type`): styrer utelukkende *om* det finnes en Video- og/eller Foto-lane — ett hakk, ingen sammenheng med (2)/(3) i det hele tatt.

Samme `delivery_description`-felt er forresten **allerede** det jeg nylig gjorde redigerbart to steder: i tilbudsbyggeren og i board-sidepanelet («Leveranse», `BoardInfoPanel.tsx` — lagt til i forrige økt). Det er trolig nettopp dette Magnus mener med at informasjonen «burde hentes fra levering i preprod» — det er allerede ett og samme felt to steder, bare at post-prod-brettet ikke lytter til det ennå.

Konklusjon: det finnes ingen strukturert kilde i dag som sier *«dette prosjektet har 2 separate videoleveranser, kalt X og Y»* — bare fritekst ment for mennesker å lese, ikke for koden å telle på.

## 3. Foreslått løsning

### Kjerneidé: en liten, eksplisitt liste — «videospor» — separat fra fritekst-leveransen

Ikke rør `delivery_description` (den fortsetter å styre kontraktens juridiske tekst akkurat som i dag — null risiko der). Legg til et **nytt, minimalt felt**: `projects.video_tracks` (JSONB-liste, default `[]`), der hvert element er `{ id: string, name: string }` — f.eks. `[{ id: "t1", name: "Hovedfilm" }, { id: "t2", name: "Highlightsreel" }]`.

- **Tom liste (default)** = «én video» = **nøyaktig dagens oppførsel**. Ingen eksisterende prosjekter påvirkes, ingen migrering av gamle `tasks`-rader trengs.
- **2+ elementer** = post-prod-brettet lager én navngitt lane per element i stedet for den ene generiske Video-lanen.

Foto rammes ikke — Magnus sitt eksempel («logging, farger på flere videoer») er video-spesifikt, og foto-arbeidsflyten (Selektering→Redigering→Ferdig) er allerede én samlet batch uansett antall bilder. Photo-lanen forblir som i dag.

### Hvor det settes

Samme to steder som `delivery_description` allerede redigeres i dag, som en liten liste rett ved siden av fritekstfeltet:

- **Tilbudsbyggeren** (`QuoteBuilder.tsx`, ved siden av «Hva leveres til kunden»): en enkel rad-for-rad-liste — navn + fjern-knapp + «+ Legg til video». Naturlig sted siden dette er nettopp der Magnus sier leveransen «settes når kontrakt skrives».
- **Board-sidepanelet** (`BoardInfoPanel.tsx`, ved siden av «Leveranse»): samme mini-editor, som en fallback/justering hvis omfanget endrer seg etter at kontrakten er signert (speiler at `delivery_description` selv allerede er redigerbar begge steder).

### Post-prod-brettets endring

I `getPostProdBoard`: hvis `video_tracks.length >= 2`, undertrykk den ene innebygde Video-lanen og lag i stedet én `post_prod_lanes`-rad *per spor* — men **gjenbruk den eksisterende custom-lane-mekanismen** fra v2-brettet i stedet for å finne opp noe nytt. Hver slik lane seedes automatisk med nøyaktig de samme `task_templates`-stegene som Video-lanen bruker i dag (Logging/Grovklipp/Klipp/Farger/Lyd/Venter på tilbakemelding/Ferdig), navngitt etter sporet («Hovedfilm», «Highlightsreel»).

For å kjenne igjen «dette er en autogenerert spor-lane, ikke en fritt opprettet egendefinert lane» og kunne synke navneendringer, trengs én ny, nullable kolonne: `post_prod_lanes.video_track_id TEXT`. Seeding skjer lat og inkrementelt — akkurat som dagens `shouldMaterializeDefaults`/`materializeDefaultLane` (som kun seeder hvis prosjektet ikke har noen maloppgaver ennå): hver gang brettet lastes, sjekk om hvert spor i `video_tracks` har en tilhørende lane (matchet på `video_track_id`); mangler den, opprett + seed den. Det betyr at å legge til et 3. videospor midt i prosjektet «bare virker» neste gang noen åpner brettet — ingen «reseed alt»-knapp, ingen risiko for å slette arbeid på spor som allerede er i gang.

### Migrering / bakoverkompatibilitet

Ingen. `video_tracks` defaulter til `[]` for alle eksisterende prosjekter, som er ekvivalent med dagens oppførsel (én Video-lane, styrt av `project_type` som før). Ingen eksisterende `tasks`-rader flyttes eller endres.

## 4. Alternativer jeg vurderte og forkastet

**A) Full omskriving til en `project_deliverables`-tabell** (type video/photo + antall + rekkefølge), som fullstendig erstatter `project_type`/`sub_type` som eneste kilde til sannhet for post-prod-strukturen. Mer «riktig» arkitektonisk på papiret, men krever å migrere *alle* eksisterende prosjekters `tasks.sub_type`-rader til en ny fremmednøkkel, og risikerer å forstyrre post-prod-brett som er midt i aktivt arbeid akkurat nå. Forkastet — for stor blast radius for gevinsten, i strid med «ikke bygg for hypotetisk fremtid».

**B) Gjenbruk pitch-sidens `deliverableItems`** som eneste kilde, og la den drive både pitch, kontrakt og post-prod. Fristende (strukturen finnes jo allerede!), men den er skrevet tidlig i salgsprosessen (før kunden har sagt ja) og har ingen `type: video|photo`-diskriminator — bare fritekst-`format`/`aspectRatio`. Å binde post-prod-strukturen til noe som redigeres av selgere før kontrakt er signert føles skjørt, og ville krevd å legge til en type-kolonne der uansett. Forkastet for nå — kan revurderes senere som en egen, separat forenklingsjobb hvis det viser seg ønskelig å samle alle tre kildene i én.

**C) (Anbefalt — beskrevet over)** Et lite, eksplisitt `video_tracks`-felt, atskilt fra både pitch og fritekst-leveransen, som kun styrer post-prod-lanestrukturen. Minst kode, null migreringsrisiko, og løser akkurat det konkrete problemet Magnus beskriver.

## 5. Foreslått rekkefølge (faser)

1. **Datamodell + tilbudsbygger:** migrasjon (`projects.video_tracks jsonb default '[]'`, `post_prod_lanes.video_track_id text`), server actions (`updateProjectVideoTracks`), UI i `QuoteBuilder.tsx` og `BoardInfoPanel.tsx`.
2. **Post-prod-brettet:** utvid `getPostProdBoard`/`materializeDefaultLane` til å seede én lane per spor, undertrykk den generiske Video-lanen når `video_tracks.length >= 2`, håndter rename-sync når et spornavn endres.
3. **(Mindre, kan tas sammen med 2 eller senere):** en «slett lane»-handling — finnes ikke i dag i det hele tatt (heller ikke for manuelt opprettede egendefinerte lanes), og blir mer synlig som et hull når spor kan fjernes fra listen igjen.

Jeg vurderer dette som passe stort for ett samlet spec + implementasjonsplan (ikke noe som må splittes videre) — det er i praksis fase 1+2 i én sammenhengende endring, med fase 3 som en liten opsjonell tilleggsbit.

## 6. Åpne spørsmål til Magnus

Siden du sover mens jeg skriver dette, kunne jeg ikke stille disse underveis slik jeg normalt ville gjort — men jeg trenger svar på dem før jeg skriver en konkret implementasjonsplan:

1. **Navngiving:** er et fritt tekstfelt per spor nok («Hovedfilm», «Highlightsreel», …), eller ønsker du en fast liste å velge fra (f.eks. «Hovedfilm / Reel / Sosiale medier-kutt / Annet»)?
2. **Retroaktiv bruk:** skal dette kun gjelde nye prosjekter fremover, eller vil du kunne legge til et 2. videospor på et prosjekt som *allerede* er i post-produksjon med kort i gang på den vanlige Video-lanen? (Med forslaget over: ja, det er trygt — de eksisterende kortene på Video-lanen rører vi ikke, det nye sporet blir en frisk, tom lane ved siden av.)
3. **Sletting av spor:** hvis et spor fjernes fra listen etter at lanen og kortene allerede er opprettet — skal lanen/kortene slettes automatisk, eller bli liggende (og du rydder manuelt)? Jeg anbefaler sistnevnte (ingen automatisk datatap), men vil ha det bekreftet.
4. **Foto:** bekrefter du at dette kun gjelder video (ikke foto), slik jeg har lagt til grunn?
5. Er `video_tracks` (norsk: «videospor») et greit navn internt, eller foretrekker du noe annet — dette er kun kode-/kolonnenavn, ikke noe kunden ser.

Når du har svart på disse, skriver jeg om denne til en godkjent spec og går videre til en konkret implementasjonsplan (writing-plans).
