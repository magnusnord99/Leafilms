# Valgfrie tillegg i pristilbudet (interaktiv konfigurator)

## Bakgrunn

Kunden ser i dag et statisk pristilbud på den publiserte prosjektsiden (`QuoteSection.tsx`) — gruppert i 4 kategorier, med rabatt og totalsum, men uten mulighet til å påvirke innholdet selv. Magnus ønsker at kunden skal kunne hake av valgfrie tillegg (f.eks. "+1 ekstra opptaksdag", "Tillegg: Stillbilder", "Tillegg: VFX-pakke") og se totalprisen oppdatere seg live i nettleseren, uten at noe lagres før de faktisk signerer kontrakten.

Avklart under brainstorming:
- Tilleggene er **frittstående, faste priser satt av admin per tilbud** (ikke beregnet fra mannskaps-dagsrater, ikke en gjenbrukbar katalog på tvers av prosjekter).
- Kundens hakede valg lever kun som klientstate helt til de signerer kontrakten — signering er den eneste eksisterende "aksept"-mekanismen i appen (den separate `/api/accept-quote`-ruten er ubrukt/ukoblet kode og røres ikke).
- Ved signering skal både `quotes.quote_data` (for admin-innsyn) og selve kontraktteksten oppdateres til å reflektere valgte tillegg — via et tillegsavsnitt rett før signaturfeltet, ikke ved å søke-og-erstatte tall i brødteksten (skjørt hvis prisen forekommer flere steder eller er formatert ulikt).

## Endringer

### 1. Datamodell

Nytt felt på `QuoteBuilderData` (`lib/types.ts`):
```ts
optionalAddons: { id: string; description: string; price: number }[]
```
Samme enkle form som eksisterende linjeposter, men uten `quantity`/`unitPrice`-splitting siden dette er faste kronebeløp, ikke antall × enhetspris.

Rabatt (`discountFactor`) gjelder **ikke** valgfrie tillegg — samme regel som i dag for utstyr/lisens/andre kostnader (kun opptak inkl. oppstart + post-produksjon rabatteres). MVA (`vatRate`) gjelder som for resten av tilbudet.

`lib/quote-builder-utils.ts` **røres ikke i det hele tatt.** `calculateQuoteTotals()` regner ut grunnprisen uavhengig av hvilke tillegg som er valgt, og brukes av admin sitt `TotalsPanel` i tilbudsbyggeren, som skal vise grunnprisen (ingen tillegg er "valgt" i byggeren, de er bare definert som muligheter). `QuoteSection.tsx` henter allerede hele den rå `QuoteBuilderData` (inkl. det nye `optionalAddons`-feltet) i `dbBuilderData`-state — samme state som i dag brukes til PDF-nedlastingsknappen — så ingen ny henting eller gjennomsendt felt trengs. Selve regnestykket "grunnpris + valgte tillegg, med MVA, uten rabatt" gjøres separat de to stedene det trengs: klientside i `QuoteSection.tsx` (kun visning) og server-side i `/api/contracts/sign` (autoritativ, se punkt 5) — samme formel, uavhengige implementasjoner siden den ene kun er til visning og den andre er det som faktisk lagres.

### 2. Admin — tilbudsbyggeren

Ny seksjon "Valgfrie tillegg" i `QuoteBuilder.tsx`, plassert etter "Andre kostnader". Samme mønster som eksisterende linjelister: `+ Legg til tillegg`-knapp, felt for tittel + pris, søppelbøtte-ikon for å slette raden. Ingen ny UI-oppfinnelse — kopi av eksisterende radmønster.

### 3. Kundevisning — `QuoteSection.tsx`

Ny seksjon mellom linjeposter og totalsum, kun i visningsmodus (ikke redigeringsmodus): hvert element i `optionalAddons` vises som en avkrysningsboks med tittel og "+X kr". Ny lokal state `selectedAddonIds: Set<string>` i `QuoteSection`. Totalsum (eks./inkl. MVA) beregnes på nytt i klienten hver gang et hak endres — rent additivt på toppen av eksisterende `finalPriceExclVat`/`finalPriceInclVat`, ingen server-runde.

Ingenting lagres i denne seksjonen — forsvinner (tilbake til usjekket) ved sideoppdatering, som avtalt.

### 4. Dele valg med kontraktsignering

`QuoteSection` og `ContractSigningSection` er søskenkomponenter under `PublicProjectClient.tsx`, ikke forelder/barn. `QuoteSection` er også eneste sted som i dag henter tilbudsdata (via `/api/quotes/current`), så både selve tillegg-listen og hvilke som er valgt må løftes:

- `PublicProjectClient.tsx` holder to nye state-verdier: `optionalAddons` (tom liste til den er lastet) og `selectedAddonIds`.
- `QuoteSection` rapporterer `optionalAddons` opp via en `onAddonsLoaded(addons)`-callback idet den henter tilbudsdata (samme sted den i dag setter `dbBuilderData`), og mottar `selectedAddonIds` + `onToggleAddon` ned som props for å style avkrysningsboksene og regne ut løpende totalsum.
- `ContractSigningSection` mottar `optionalAddons` + `selectedAddonIds` ned som props — nok til å vise et sammendrag ("Du har valgt: VFX-pakke, +12 000 kr") rett over signeringsknappen — og sender `selectedAddonIds` i body til `/api/contracts/sign`. Den endelige, autoritative summeringen skjer uansett server-side i signerings-ruten (punkt 5), som henter `quote_data` på nytt fra databasen — klientens tall er kun til visning.

### 5. `/api/contracts/sign` — lagring og kontrakttekst-oppdatering

Ruten utvides til å ta imot `selectedAddonIds: string[]` i tillegg til eksisterende felter. Ved signering:
- Henter `optionalAddons` fra prosjektets gjeldende `quotes.quote_data`, filtrerer til de valgte id-ene, summerer pris.
- Beregner ny totalsum: eksisterende `finalPriceInclVat`/`finalPriceExclVat` (fra `calculateQuoteTotals`) + valgte tillegg (med MVA, uten rabatt).
- Oppdaterer `quotes.quote_data` med `selectedAddonIds` + de nye totalsummene, slik at admin ser nøyaktig hva som ble valgt og hva den reelle avtalte prisen ble.
- Legger til et eget avsnitt i kontraktteksten (`contracts.contract_text`), satt inn rett før signaturseksjonen, i stil med:
  > **Tillegg valgt av kunde ved signering:**
  > VFX-pakke — 12 000 kr
  >
  > Ny totalsum inkl. tillegg: 57 000 kr eks. MVA
  
  Avsnittet utelates helt hvis kunden ikke haket av noen tillegg — kontrakten forblir da uendret som i dag.

## Berørte filer

- `lib/types.ts` — `optionalAddons`-felt på `QuoteBuilderData`
- `components/quote/QuoteBuilder.tsx` — admin-seksjon for å definere tillegg
- `components/sections/QuoteSection.tsx` — avkrysningsbokser + live totalsum, `selectedAddonIds`-prop
- `app/p/[token]/PublicProjectClient.tsx` — løfter `selectedAddonIds`-state, sender til begge søskenkomponenter
- `app/p/[token]/ContractSigningSection.tsx` — mottar valg, viser sammendrag, sender med ved signering
- `app/api/contracts/sign/route.ts` — mottar `selectedAddonIds`, oppdaterer `quote_data` og kontraktteksten

## Utenfor scope

- Ingen gjenbrukbar tillegg-katalog på tvers av prosjekter (kan vurderes senere hvis samme tillegg går igjen ofte).
- Ingen egen "Aksepter tilbud"-knapp — den eksisterende ubrukte `/api/accept-quote`-flyten røres ikke.
- Ingen mulighet til å endre valgte tillegg *etter* signering (kontrakten er da signert og bør ikke kunne endres via denne flyten — evt. behov for det håndteres som en ny tilbudsversjon, som allerede støttes).
- Ingen automatisk gjenkjenning/erstatning av tall i brødteksten — tillegg vises alltid som eget avsnitt, aldri ved å endre eksisterende setninger.
