# Signert leveranse som fasit — flere video-/foto-leveranser med egne faner i post-prod

**Dato:** 2026-07-27
**Status:** Godkjent av Magnus (design), venter på spec-review før implementasjonsplan.

Erstatter [2026-07-26-postprod-multi-video-tracks-design.md](2026-07-26-postprod-multi-video-tracks-design.md) — Magnus ville heller ha en større omskrivning der selve kontraktsigneringen fryser en strukturert leveranseliste som resten av systemet leser fra, i stedet for ett enkelt mutable felt.

## 1. Bakgrunn

Se research-delen i det forrige dokumentet (seksjon 1-2) for full gjennomgang — kort oppsummert: i dag finnes det tre frakoblede steder som beskriver «hva leverer vi» (pitch-siden, tilbudsbyggerens fritekst, `project_type`), og ingen av dem er strukturerte nok til at koden kan telle på dem. Post-prod-brettet håndterer derfor maks én Video- og én Foto-lane totalt, uansett hvor mange separate videoer/bildesett prosjektet faktisk skal levere.

Avklart med Magnus (denne økten):

1. Leveranselisten skal **fryses** i det kontrakten signeres — en egen, uforanderlig kopi, ikke bare ett felt som kan endres i etterkant.
2. Leveranselisten som datastruktur støtter både video- og foto-elementer (til beskrivelse/
   fremtidig bruk), men selve **fane-/Delt-mekanikken i post-prod gjelder kun video** — foto
   holder seg til én samlet leveranse, siden bilder alltid leveres og jobbes med samtidig
   (avklart 2026-07-27, se §3).
3. **Egen, separat liste** i tilbudsbyggeren — ikke gjenbruk av pitch-sidens `deliverableItems`.
4. Post-prod-video får **faner**, én per video. Hver video har sin egen fullstendige pipeline (Grovklipp→Klipp→Farger→Lyd) — helt uavhengig fremdrift per video.
5. Logging og Ferdig er **delt på tvers** av videoene som default (logges/leveres ofte samlet), men skal kunne **splittes opp per video** hvis prosjektet krever det — via samme dra-og-slipp som resten av brettet.
6. Eksisterende prosjekter skal ikke påvirkes — dette gjelder kun kontrakter signert fremover.

## 2. Datamodell

### Ny type: `DeliverableItem`

```ts
export type DeliverableItem = {
  id: string              // stabil, klient-generert (f.eks. kort ULID) — ikke DB-fremmednøkkel
  type: 'video' | 'photo'
  name: string             // fritekst, f.eks. "Hovedfilm", "Reel", "Produktbilder"
}
```

Lever inne i JSONB-kolonner (som `meeting_summary`/`board_summary` allerede gjør i dette
kodebasen) — ingen egen tabell med RLS trengs for selve listen, siden den alltid leses/skrives
sammen med raden den bor på.

### Utkast-steget: `QuoteBuilderData.deliverables`

`lib/types.ts` — `QuoteBuilderData` får `deliverables: DeliverableItem[]`. Redigeres fritt i
`QuoteBuilder.tsx` gjennom hele tilbudsprosessen, lagret i `quotes.quote_data` som i dag.
`deliveryDescription` (fritekst) beholdes uendret ved siden av — den styrer fortsatt
kontraktens juridiske «leveranse»-tekst (`lib/actions/contracts.ts:147`). Ingen kobling mellom
de to feltene; strukturlisten er kun for å drive post-prod-strukturen.

### Frys-steget: signering

`app/api/contracts/sign/route.ts` — når signeringen lykkes, kopier `deliverables` fra den
signerte quotens `quote_data` til to steder i samme transaksjon:

- **`contracts.deliverables JSONB`** (ny kolonne) — skrives kun her, aldri oppdatert igjen.
  Historisk, uforanderlig fasit for akkurat den signeringen. Gir et revisjonsspor hvis
  kontrakten noen gang signeres på nytt (`unsignContract` finnes allerede) med en endret liste.
- **`projects.deliverables JSONB`** (ny kolonne) — en levende kopi av *siste signerte*
  leveranseliste. Dette er det post-prod og alt annet i systemet faktisk leser fra, slik at
  ingen andre steder trenger å joine mot `contracts`. Oppdateres på nytt hvis prosjektet
  signeres på nytt med en endret liste.

Prosjekter uten signert kontrakt (eller signert før denne endringen) har
`projects.deliverables = NULL`/tom liste — se bakoverkompatibilitet under.

### Post-prod: hvilket steg er delt vs. per leveranse (kun video)

Avklart med Magnus: foto holder seg til **én leveranse** — alle bilder leveres og jobbes med
samtidig, uansett hvor mange foto-elementer som måtte stå i leveranselisten (f.eks. «20
produktbilder» + «10 eventbilder» kan begge stå i listen for beskrivelsens skyld, men de
smelter sammen i det samme Selektering→Redigering→...→Ferdig-brettet som i dag). Foto får derfor
**ingen** Delt-seksjon, **ingen** faner, og **ingen** `default_scope`-forgrening — den koden
røres ikke i det hele tatt. Kun video-typen får splitten under.

Ny kolonne `task_templates.default_scope TEXT CHECK (default_scope IN ('shared', 'per_deliverable')) DEFAULT 'per_deliverable'` — settes kun på `project_type='video'`-maler:

| title | default_scope |
|---|---|
| Logging | `shared` |
| Grovklipp, Klipp, Farger, Lyd, Venter på tilbakemelding | `per_deliverable` |
| Ferdig | `shared` |

Photo-malene får ikke `default_scope` satt (evt. la kolonnen stå `NULL`/ubrukt for dem) —
irrelevant siden foto aldri splittes.

### `tasks`: hvilken leveranse et kort tilhører

Ny kolonne `tasks.deliverable_id TEXT` (nullable) — matcher `DeliverableItem.id` fra
`projects.deliverables`. `NULL` betyr «delt» (vises i Delt-seksjonen) **eller** «prosjektet har
0-1 leveranser av denne typen» (vises i den vanlige flate lanen, som i dag — se under).
`sub_type` (`'video' | 'photo' | null`) beholdes uendret som i dag.

`post_prod_lanes` (egendefinerte laner som «Animasjon») røres ikke — helt uavhengig konsept,
fortsatt delt på tvers av alt.

## 3. Post-prod-brettets oppførsel

**Foto er uendret** — alltid én flat lane (Selektering→Redigering→...→Ferdig), uansett hvor
mange foto-elementer som står i `projects.deliverables`. Ingen Delt-seksjon, ingen faner.

**Video** — basert på antall video-elementer i `projects.deliverables`:

- **0** (kontrakt ikke signert med denne funksjonen, eller ingen video i listen): dagens
  oppførsel uendret — `project_type` styrer om Video-lanen finnes i det hele tatt, akkurat som nå.
- **1**: én flat lane, akkurat som i dag — alle maler (delt og per-leveranse) seedes inn i
  samme lane, siden det ikke er noe å dele mellom. Ingen visuell endring for det store
  flertallet av prosjekter som kun har én video.
- **2+**: én **Delt**-seksjon øverst (seedet fra `default_scope='shared'`-malene,
  `deliverable_id = NULL`), og **faner** under — én per video, hver seedet fra
  `default_scope='per_deliverable'`-malene med `deliverable_id` satt til den videoen.
  Kort kan dras mellom Delt-seksjonen og en hvilken som helst fane (og mellom faner), slik at et
  prosjekt kan bryte fra default-oppsettet.

«Parallelt gjennom hele post-produksjonen»-raden (frie oppgaver som musikk/VFX, ikke bundet til
et bestemt steg i sekvensen) er et **eget, uendret konsept** — fortsatt delt på tvers av alt,
uavhengig av Delt-seksjonen over.

### Overgangen fra 1 → 2+ leveranser midt i et prosjekt

Hvis kontrakten signeres på nytt med et ekstra videospor lagt til *etter* at post-prod allerede
er i gang på den opprinnelige, flate lanen (med `deliverable_id = NULL` på alle kort): de
eksisterende kortene beholder all fremdrift/tildeling/kommentarer, og tolkes som å tilhøre den
**første** leveransen i den nye listen — de får `deliverable_id` satt til dens id automatisk,
og forblir slik for kort som matcher en `per_deliverable`-mal. Kort som matcher en
`shared`-mal (Logging, Ferdig) blir liggende med `deliverable_id = NULL` og havner i den nye
Delt-seksjonen — ingen endring for dem. Kun den/de **nye** leveransen(e) får friskt seedede
kort. Ingen eksisterende kort slettes eller nullstilles.

### Sletting av en leveranse fra en re-signert kontrakt

Hvis en leveranse fjernes fra listen ved re-signering, slettes ikke lanen/kortene dens
automatisk — de blir liggende (samme resonnement som i forrige dokument: ingen automatisk
datatap). Rydding skjer manuelt. Kan revurderes senere hvis det viser seg upraktisk.

## 4. Bakoverkompatibilitet

Ingen migrering av eksisterende data. `projects.deliverables`/`contracts.deliverables` er nye,
nullable kolonner — alle eksisterende prosjekter har `NULL`, som gir nøyaktig dagens oppførsel
(§3, «0 leveranser»-tilfellet). Dette gjelder kun kontrakter som signeres *etter* at denne
funksjonen er driftsatt.

## 5. Berørte filer (oversikt til implementasjonsplanen)

- `lib/types.ts` — `DeliverableItem`, `QuoteBuilderData.deliverables`, `Project.deliverables`,
  ny `Contract`-type/felt for `deliverables`.
- `components/quote/QuoteBuilder.tsx` — liten liste-editor (type-velger + navn + fjern-knapp +
  «legg til») ved siden av eksisterende «Hva leveres til kunden»-felt.
- `app/api/contracts/sign/route.ts` — kopier `deliverables` til `contracts` og `projects` ved
  vellykket signering.
- Ny migrasjon (`128_...sql`): `contracts.deliverables`, `projects.deliverables`,
  `tasks.deliverable_id`, `task_templates.default_scope` + backfill av eksisterende maler.
- `lib/actions/pipeline.ts` — `getPostProdBoard` (ny returform med Delt+faner per type),
  `materializeDefaultLane`/`shouldMaterializeDefaults` (generaliseres til delt/per-leveranse og
  inkrementell seeding av nye leveranser), ny logikk for 1→2+-overgangen i §3.
- `app/admin/preprod/[id]/PostProdBoard.tsx` — fanevisning, Delt-seksjon, dra-og-slipp utvidet
  til å gjelde på tvers av Delt/faner.

## 6. Utenfor scope (bevisst, kan bli egne oppgaver senere)

- Kontrakt-PDF-ens juridiske leveransetekst genereres **ikke** automatisk fra den nye listen —
  `delivery_description`-fritekst styrer fortsatt ordlyden, uendret.
- Pitch-sidens `deliverableItems` samles **ikke** med denne listen.
- Board-sidepanelet (den publiserte kundesiden) viser fortsatt kun fritekst-leveransen — å liste
  opp de enkelte leveransene der kan vurderes senere.
- Foto splittes aldri i egne faner (avklart med Magnus 2026-07-27) — kun video-typen har
  Delt+faner-logikken i §3.

## 7. Addendum (2026-07-28) — `/admin/postprod/[id]` stepper-siden

Oppdaget under egen-verifisering av Task 9: det finnes **to** sider som viser post-prod-oppgaver,
og kun én (`PostProdBoard.tsx`, §3) ble oppdatert. Den andre, `app/admin/postprod/[id]/page.tsx` —
en låst, lineær stepper («Steg 2 av 12») som brukes til å jobbe gjennom oppgavene i rekkefølge —
leser oppgaver via `getTasksForProject` og har ingen kjennskap til `deliverable_id`. Med 2+
video-leveranser viser den i dag en ødelagt, duplisert sekvens (Logging, Grovklipp, Grovklipp,
Klipp, Klipp, Farger, Farger, Lyd, Lyd, Venter på tilbakemelding, Venter på tilbakemelding, Ferdig)
— bekreftet med skjermbilde. Dette sto ikke i den opprinnelige spec-en fordi denne siden ikke ble
oppdaget under research-fasen.

Avklart med Magnus: stepper-siden skal få **samme fane-inndeling som brettet** — faner øverst
(én per video), Logging/Ferdig vist én gang uansett hvilken fane som er valgt, og en egen lineær
stepper (Grovklipp→Klipp→Farger→Lyd→Venter på tilbakemelding) per valgt fane.

### 7.1 Sort_order-bug i `ensureVideoDeliverablesSeeded` (§2) — må fikses først

`ensureVideoDeliverablesSeeded` seeder i dag med `sort_order: i + 1` beregnet **separat** for
`sharedTemplates` og for hver leveranses `perDeliverableTemplates` — dvs. Logging=1, Ferdig=2
(delt-settet har 2 rader), mens Grovklipp=1, Klipp=2, Farger=3, Lyd=4, Venter=5 (per-leveranse-
settet har 5 rader) — **for hver leveranse uavhengig**. Dette gir overlappende `sort_order`-verdier
på tvers av delt/per-leveranse (Ferdig=2 kolliderer med Klipp=2, osv.). Brettet (§3) rammes ikke —
det sammenligner aldri `sort_order` på tvers av bøtter (Delt-lane og hver fane bygges hver for seg
fra samme forhåndssorterte rekke). Stepper-siden derimot MÅ kunne slå sammen delt+valgt-leveranse
til én virtuell sekvens sortert på `sort_order` (§7.2) — det krever at `sort_order` gjenspeiler den
opprinnelige malrekkefølgen (Logging=1, Grovklipp=2, Klipp=3, Farger=4, Lyd=5,
Venter på tilbakemelding=6, Ferdig=7) **likt for alle leveranser**, ikke gjenstartet per bøtte.

**Fix:** bruk malens egen `sort_order`-verdi direkte (`t.sort_order`, allerede hentet i
`scopedTemplates`-spørringen) i stedet for indeksbasert `i + 1`, i begge insert-blokkene.

### 7.2 Stepper-siden: video-leveranse-faner

`app/admin/postprod/[id]/page.tsx` har allerede et fane-konsept for `mixed`-prosjekter
(`activeTab: 'video' | 'photo'`, filtrerer `stepperTasks` på `sub_type`). Video-leveranse-fanene
er et **eget, nøstet** lag under dette — en `mixed`-prosjekt kan i prinsippet også ha 2+
video-leveranser, og skal da vise video-leveranse-faner når «Film»-fanen er valgt.

- Ny state: `activeVideoDeliverableId: string | null`, default til første leveranse (samme
  mønster som `activeVideoTabId` i `PostProdBoard.tsx`).
- `videoDeliverables = (currentProject?.deliverables ?? []).filter(d => d.type === 'video')`,
  `hasVideoTabs = videoDeliverables.length >= 2`.
- `displayTasks` (i dag: `isMixed ? stepperTasks.filter(sub_type===activeTab) : stepperTasks`)
  filtreres i tillegg, når `hasVideoTabs`, til
  `t.deliverable_id === null || t.deliverable_id === activeVideoDeliverableId` — og siden §7.1
  retter opp `sort_order` til å være globalt konsistent, gir den vanlige
  `.order('sort_order')`-sorteringen fra `getTasksForProject` automatisk riktig virtuell rekkefølge
  (Logging→Grovklipp→Klipp→Farger→Lyd→Venter→Ferdig) uten egen sammenflettingslogikk.
- Ny fane-rad (samme visuelle mønster som eksisterende Film/Bilder-faner, inkl. per-fane
  fullført-telling) rendres når `hasVideoTabs` — under Film/Bilder-faner hvis `isMixed`, ellers på
  samme sted disse ville stått.
- `handleSwitchTab` får en søsterfunksjon `handleSwitchVideoTab(deliverableId)` med identisk
  mønster (lagre notater/task_data for gjeldende valgt oppgave, sette ny aktiv fane, sette
  `selectedIdx` via `getInitialIdx` på den nye `displayTasks`-listen).
- `getInitialIdx`/`resolveDeepLinkIdx` utvides til også å sette `activeVideoDeliverableId` når en
  deep-linket oppgave har en `deliverable_id`.
- `StepItem`/selve stepper-rendringen (sirklene) trenger **ingen endring** — den er allerede
  rent indeks-/listebasert og bryr seg ikke om hvor listen kommer fra.

### 7.3 «Gå tilbake» / «Ikke godkjent» må skoperes på `deliverable_id`

`resetTaskAndSubsequent` og `rejectFeedbackAndReset` (`lib/actions/pipeline.ts`) nullstiller i dag
kun basert på `sub_type` + `sort_order >=/<=`. For et rent video-prosjekt med 2+ leveranser er
`sub_type` `NULL` for **alle** video-oppgaver uansett leveranse — uten en tilleggsskopering ville
«Gå tilbake» på ett steg i én fane feilaktig nullstille samme steg (og alt etter) i **alle** faner.

**Fix (begge funksjoner):** hent også `deliverable_id` på oppgaven som nullstilles. Hvis den er
`NULL` (en delt oppgave som Logging), nullstill alle oppgaver med `sort_order >=/<=` grensen,
uavhengig av `deliverable_id` (delt-steg gjelder alle leveranser). Hvis den er satt (en
per-leveranse-oppgave), nullstill kun oppgaver der `deliverable_id` er lik DENNE leveransen
**eller** er `NULL` (delte steg som Ferdig skal fortsatt nullstilles — leveransen er ikke lenger
ferdig hvis ett steg i den går tilbake), aldri andre leveransers oppgaver.

Klientens optimistiske oppdatering i `handleGoBack` (samme fil, `page.tsx`) speiler i dag kun
`sub_type`-filteret og må oppdateres identisk, ellers vil den optimistiske UI-oppdateringen vise
feil resultat inntil neste refetch.

### 7.4 Andre mindre ting

- `Task`-typen (`lib/types.ts`) mangler `deliverable_id: string | null` — rådataene har den
  allerede (kolonnen finnes, `getTasksForProject` bruker `select('*')`), men TypeScript kjenner
  den ikke uten dette feltet.
- `page.tsx` har allerede en **lokal** type kalt `DeliverableItem` (linje ~222, urelatert —
  pitch-sidens gamle leveranse-liste, `{id?, title?, description?, quantity?, format?}`, brukt av
  «Info om levering»-modalen). Importen av det nye `DeliverableItem` fra `lib/types.ts` MÅ
  aliaseres (f.eks. `SignedDeliverableItem`) for å unngå navnekollisjon — de to er helt urelaterte
  konsepter som tilfeldigvis heter det samme.
