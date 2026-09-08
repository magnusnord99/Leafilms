# Ett samlet leveranseobjekt — flyter gjennom hele pipelinen

**Dato:** 2026-09-01
**Status:** Godkjent av Magnus (design), venter på spec-review før implementasjonsplan.

Bygger videre på [2026-07-27-signed-deliverables-postprod-design.md](2026-07-27-signed-deliverables-postprod-design.md)
(«C» under) — den innførte en strukturert `deliverables`-liste som fryses ved
signering og driver post-prod-faner for video. Dette dokumentet fjerner de
gjenværende tre parallelle representasjonene av «hva leverer vi», slik at
kontrakt, board, pitch-side og post-prod alle leser fra samme objekt.

## 1. Bakgrunn

Utløst av at post-prod for et prosjekt med f.eks. 15 videoer kun viste 1
arbeidsflyt i stedet for 15 — root cause: den strukturerte leveranselisten
(«C») som driver post-prod-fanene fylles ut manuelt, én rad om gangen, og er
helt frakoblet fra der en selger faktisk ville skrevet «15 reels» (et
antall-felt i en av de tre andre representasjonene).

Research avdekket **fire** frakoblede steder som i dag beskriver «hva
leverer vi»:

| | Sted | Lagring | Felter | Brukes av |
|---|---|---|---|---|
| A | Pitch-siden sin leveranse-seksjon | `sections.content.deliverableItems` (project-scoped, ikke quote-scoped) | `id, title?, quantity?, format?, aspectRatio?, description?` | Kundevendt marketing-copy på `/p/[token]`, redigert in-place via `DeliverableGrid` |
| B | Tre frie tekstfelt på prosjektet | `projects.delivery_description/delivery_video/delivery_photo` | fritekst | Board-kort, info-panel (`combinedDeliveryText()`), forhåndsutfylt inn i tilbudsbyggeren |
| C | Strukturert video/foto-liste | `QuoteBuilderData.deliverables` → frosset til `contracts.deliverables` + `projects.deliverables` ved signering | `id, type: 'video'\|'photo', name` | Post-prod-faner (§3 i forrige design) |
| D | Kontraktens juridiske leveranseavsnitt | Generert fra B (`combinedDeliveryText(proj)`, `lib/actions/contracts.ts:154`) | fritekst | Kontrakt-PDF |

Avklart med Magnus (denne økten): **ett** dataobjekt skal erstatte alle fire,
inkludert kundens pitch-side.

## 2. Datamodell

### Utvidet `DeliverableItem` (`lib/types.ts`)

```ts
export type DeliverableItem = {
  id: string                          // stabil, klientgenerert (kort ULID)
  type: 'video' | 'photo' | 'annet'
  name: string                        // "Reel", "Hovedfilm", "Produktbilder"
  quantity: number                    // default 1
  format?: string                     // f.eks. "9:16", "Instagram" — slår sammen gamle format+aspectRatio
  description?: string                // fritekst, valgfritt
}
```

Sammenslåing av A (`title→name`, `quantity`, `format`, `aspectRatio→format`,
`description`) og C (`type`). `id`/`type`/`name` beholder samme betydning som
i dag i C — ingen breaking change for eksisterende post-prod-logikk som leser
disse tre feltene.

### Eneste lagringssted: `projects.deliverables`

Fra prosjektet opprettes (tom liste som default) til det er levert og
fakturert — samme kolonne som allerede finnes fra forrige design, ingen ny
migrasjon av selve kolonnen. `QuoteBuilderData.deliverables`-feltet
**fjernes** — det finnes ikke lenger noen egen kopi i tilbudsutkastet.

### Livssyklus

1. **Før signering** — pitch-siden (`DeliverableGrid`) leser og skriver
   direkte til `projects.deliverables`, akkurat som andre prosjektfelt på
   pitch-siden redigeres i dag (ingen utkast-/versjonskonsept for denne
   listen, i likhet med resten av pitch-sidens innhold).
2. **Ved signering** — uendret mekanikk fra forrige design: kopier
   `projects.deliverables` inn i `contracts.deliverables` (uforanderlig
   historisk fasit for den signeringen). Skjer også ved re-signering med en
   endret liste.
3. **Etter signering** — `projects.deliverables` er fortsatt levende og
   redigerbar direkte (f.eks. legge til en 16. video midt i post-prod, uten
   å måtte re-signere kontrakten). `contracts.deliverables` for den signerte
   kontrakten endres aldri.

## 3. Endringer per forbruker

### Pitch-side (`components/sections/DeliverablesSection.tsx` + `DeliverableGrid`)

Leser/skriver `project.deliverables` i stedet for
`section.content.deliverableItems`. `DeliverableGrid` sitt item-skjema
utvides med `type`-velger (video/foto/annet) — eneste UI-tilføyelse der.
Visuell layout ellers uendret.

### Tilbudsbygger (`components/quote/QuoteBuilder.tsx`)

`DeliverablesSection`-komponenten (linje 662, den enkle type+navn-listen)
**fjernes** som egen editor. Erstattes av en read-only oppsummering av
`projects.deliverables` (samme sted i skjemaet) + en lenke «Rediger på
pitch-siden». Unngår to redigerings-UI-er for samme data som kan gli fra
hverandre.

### Signering (`app/api/contracts/sign/route.ts`)

Linje 180/314: `deliverables: quoteData?.deliverables ?? []` endres til å
lese `projects.deliverables` direkte (siden `quote_data` ikke lenger har
egen kopi) i stedet for fra `quoteData`.

### Board-kort / info-panel (`lib/delivery-format.ts`)

`combinedDeliveryText()` bygges om til å ta `DeliverableItem[]` i stedet for
de tre frie tekstfeltene — grupperer på `type`+`name`, produserer
`"Video: 15x Reel, 1x Hovedfilm · Foto: 30 redigerte bilder"`. De tre
frie feltene (`delivery_description/delivery_video/delivery_photo`) slutter
å bli skrevet til fra nye prosjekter, men **kolonnene beholdes** — brukes som
fallback for prosjekter som kun har gammel data (se §4).

### Kontrakt-PDF (`lib/actions/contracts.ts:154`)

`leveranse: combinedDeliveryText(proj, lang)` bytter til å kalle den
ombygde formateringsfunksjonen over `proj.deliverables` — auto-generert,
ingen manuell overstyring (som avtalt).

### Post-prod-faner (`lib/actions/pipeline.ts`, `PostProdBoard.tsx`, `postprod/[id]/page.tsx`)

Ny delt hjelpefunksjon, f.eks. `lib/deliverables.ts: expandDeliverableInstances(items: DeliverableItem[])`,
sprer hvert element med `quantity > 1` til N instanser:

```ts
{ id: 'reel', type: 'video', name: 'Reel', quantity: 15 }
// →
[
  { id: 'reel#1',  type: 'video', name: 'Reel 1',  sourceItemId: 'reel' },
  { id: 'reel#2',  type: 'video', name: 'Reel 2',  sourceItemId: 'reel' },
  ...
  { id: 'reel#15', type: 'video', name: 'Reel 15', sourceItemId: 'reel' },
]
```

`videoDeliverables`/`ensureVideoDeliverablesSeeded`/`hasVideoTabs`-logikken
(begge steder — brett og steg-side) mater fra disse utvidede instansene i
stedet for de rå elementene. `deliverable_id` på `tasks` fortsetter å
matche instans-id (`reel#3`), ikke rå element-id. Foto berøres ikke —
forblir alltid én samlet leveranse uansett `quantity`, som avtalt i forrige
design (§3 der).

Element med `quantity = 1` (default, det store flertallet) gir én instans —
ingen visuell endring fra dagens oppførsel.

## 4. Bakoverkompatibilitet

Ingen tvungen datamigrering:

- `projects.deliverables = NULL`/tom liste for eksisterende prosjekter →
  dagens 0-leveranser-oppførsel er uendret (ett flatt post-prod-spor).
- `delivery_description/delivery_video/delivery_photo`-kolonnene beholdes og
  leses fortsatt som fallback av `combinedDeliveryText()`/kontrakt-PDF-en
  når `projects.deliverables` er tom — rammer kun prosjekter som aldri får
  ny leveranseliste.
- Gammel `sections.content.deliverableItems`-data (pitch-side) blir liggende
  urørt, men leses ikke lenger av den nye pitch-side-koden. Et **frivillig,
  manuelt kjørt engangs-script** kan tilbys for å kopiere denne inn i
  `projects.deliverables` per prosjekt ved behov — ikke en automatisk
  migrasjon, siden feltene ikke er strukturelt identiske (`type` mangler i
  gammel data og må gjettes/settes manuelt).
- Gjelder kun prosjekter som redigeres/signeres etter at dette er driftsatt,
  i tråd med filosofien fra forrige design.

## 5. Utenfor scope

- Automatisk migrering av eksisterende `sections.deliverableItems`-data —
  kun frivillig script, ikke del av utrullingen.
- Fjerning av `delivery_description/delivery_video/delivery_photo`-kolonnene
  — beholdes som fallback, kan vurderes fjernet i en senere opprydding når
  ingen prosjekter lenger er avhengige av dem.
- Endringer i selve post-prod-drag-and-drop eller `default_scope`-mekanikken
  fra forrige design — kun hvordan lista *mates inn* endres (via utvidede
  instanser), ikke hvordan brettet bruker `deliverable_id` videre.
- `AI`-generering av leveranser (`generate-project`) og oversettelse
  (`translate-project`) sitt eksakte skjema — får `type`-feltet i tillegg,
  men selve genererings-/oversettelseslogikken endres ikke utover det.

## 6. Berørte filer (oversikt til implementasjonsplanen)

- `lib/types.ts` — utvidet `DeliverableItem`, fjern `QuoteBuilderData.deliverables`,
  fjern lokalt duplikat-navn i `postprod/[id]/page.tsx` (se §7.4 i forrige
  design — `SignedDeliverableItem`-aliaset kan nå droppes siden det ikke
  lenger kolliderer med noe lokalt).
- `lib/deliverables.ts` (ny) — `expandDeliverableInstances()`,
  formateringsfunksjon for board/kontrakt-tekst (erstatter
  `combinedDeliveryText`, eller bygges om i `lib/delivery-format.ts`).
- `components/sections/DeliverablesSection.tsx` + `DeliverableGrid` — les/skriv
  `project.deliverables`, legg til type-velger.
- `components/quote/QuoteBuilder.tsx` — fjern `DeliverablesSection`-editoren,
  erstatt med read-only oppsummering + lenke.
- `app/api/contracts/sign/route.ts` — les fra `projects.deliverables` i
  stedet for `quoteData.deliverables`.
- `lib/actions/contracts.ts` — `leveranse`-feltet i PDF-generatoren bruker ny
  formateringsfunksjon.
- `lib/actions/pipeline.ts` — `ensureVideoDeliverablesSeeded` og
  `getPostProdBoard` mater fra `expandDeliverableInstances()`.
- `app/admin/preprod/[id]/PostProdBoard.tsx`,
  `app/admin/postprod/[id]/page.tsx` — samme, på video-fane-siden.
- `app/api/generate-project/route.ts`, `app/api/translate-project/route.ts` —
  `type`-feltet lagt til i genererings-/oversettelsesskjemaet.
- Ingen ny SQL-migrasjon for selve kolonnen (finnes fra før) — evt. en liten
  migrasjon kun hvis `contracts.deliverables`/`projects.deliverables` sin
  JSONB-default trenger justering for det nye skjemaet (usannsynlig, JSONB
  er skjemaløs).
