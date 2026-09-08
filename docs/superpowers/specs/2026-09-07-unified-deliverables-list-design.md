# Én samlet leveranseliste — fra pitch til tilbud til postprod

**Dato:** 2026-09-07
**Status:** Godkjent av Magnus (design), klar for implementasjonsplan.

## 1. Bakgrunn

Feedback ae748caf (postprod fulgte ikke kontraktens reelle leveranser) avdekket at systemet
i dag har **to frakoblede leveranselister**:

1. **`sections.content.deliverableItems`** (typen `SectionContent['deliverableItems']`,
   `lib/types.ts`) — `{id, title?, quantity?, format?, aspectRatio?, description?}`. Dette er
   den rike, kundevendte listen ("Info om levering") som vises på den publiserte pitch-siden
   (`app/p/[token]` via `components/sections/DeliverablesSection.tsx` →
   `components/project/DeliverableGrid.tsx`), redigerbar når som helst — både inline i
   pitch-editoren (`/admin/projects/[id]/edit`) og via en egen modal på postprod-siden
   (`getProjectDeliverablesSection`/`updateProjectDeliverablesSection`,
   `lib/actions/pipeline.ts`). Ingen `type`-kolonne — "4 Hovedfilm" er én rad med `quantity: 4`.
   Skrives også av AI-generering (`app/api/generate-project/route.ts`),
   oversettelse (`app/api/translate-project/route.ts`) og prosjekt-duplisering
   (`lib/actions/transfers.ts`).

2. **`DeliverableItem[]`** (`lib/types.ts`, se
   `docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md`) —
   `{id, type: 'video'|'photo', name}`. Enkel, strukturert, redigert i tilbudsbyggeren
   (`components/quote/QuoteBuilder.tsx`), fryst til `contracts.deliverables` ved signering og
   kopiert til `projects.deliverables` (den "levende" kopien postprod-brettet og
   stepper-siden faktisk leser fra, se addendum §7 i spec-en over).

Ingen automatisk kobling mellom de to (bevisst valg i forrige spec, §6 "Utenfor scope"). I
praksis betyr det at noen må huske å fylle ut liste nr. 2 separat fra liste nr. 1 for at
postprod skal få riktige video-faner — noe som feiler stille (som i ae748caf) fordi listene
ser ut som de burde være samme data.

Avklart med Magnus (denne økten): **én liste**, med navn, type, format og lengde, som flyter
gjennom hele systemet — pitch, tilbud, kontrakt, postprod.

## 2. Datamodell

`lib/types.ts` — utvidet `DeliverableItem`:

```ts
export type DeliverableItem = {
  id: string
  type: 'video' | 'photo' | 'annet'
  name: string
  /** Fritekst, dekker både format og lengde sammen — f.eks. "16:9, 20 sek", "1:1", "2 min". Ikke strukturert i separate felt (se §2.1). */
  format?: string
  description?: string
  /** Kun meningsfullt for 'photo'/'annet' — video er alltid én rad = ett navngitt element, se §3. */
  quantity?: number
}
```

### 2.1 Hvorfor `format` som fritekst, ikke separate `aspectRatio`/`length`-felt

Dagens `deliverableItems` har allerede separate `format`/`aspectRatio`-felt, men i praksis
(se skjermbildet fra feedback ae748caf) skriver teamet lengde og format sammen som fritekst i
ett felt ("16:9, 20 sek"). Å tvinge et strukturert lengde-felt ville kreve å parse/validere
tidsformater teamet ikke bruker konsistent i dag. `format` beholdes som fritekst; kan
revurderes senere hvis behovet for strukturert filtrering/sortering på lengde dukker opp.

## 3. Video: alltid individuelt navngitte rader

Postprod-fanene (allerede bygget, se forrige spec) krever én navngitt `DeliverableItem` per
video for å gi den en egen fane. `quantity` gir derfor ikke mening for `type: 'video'` — UI-et
skal ikke tilby et antall-felt når typen er video.

**Bulk-tillegg for video:** siden pitcher ofte kun vet "4 reels" uten navn ennå, får
leveranse-editoren en snarvei — "+ Legg til flere videoer" ber om et antall N og oppretter N
rader med placeholder-navn ("Reel 1"..."Reel N"), hver individuelt omdøpbar etterpå. Dette er
UI-sukker over vanlig rad-tillegg, ingen egen datastruktur.

**Foto/annet:** beholder `quantity` som i dag (f.eks. "10 produktbilder" = én rad,
`quantity: 10`) — disse splittes aldri i postprod-faner uansett (uendret fra forrige spec §3).

## 4. Hvor listen lever og redigeres

**Ett datafelt, tre redigeringsflater**, alle mot samme `projects.deliverables`:

1. **Pitch-editoren** (`/admin/projects/[id]/edit`) — `DeliverablesSection`/`DeliverableGrid`
   (`components/sections/DeliverablesSection.tsx`, `components/project/DeliverableGrid.tsx`).
   Rendrer i dag `section.content.deliverableItems` — endres til å lese/skrive
   `project.deliverables` i stedet. `DeliverableGrid`s radskjema utvides med `type`-velger.
   Dette er den kundevendte visningen (også lest av `app/p/[token]`), og fungerer under selve
   pitch-byggingen, før noe tilbud/kontrakt eksisterer.
2. **Postprod-siden** ("Info om levering"-modalen, `app/admin/postprod/[id]/page.tsx`) —
   samme data, egen enklere modal for rask tilgang uten å gå via pitch-editoren.
   `getProjectDeliverablesSection`/`updateProjectDeliverablesSection` (`lib/actions/pipeline.ts`)
   pekes om til å lese/skrive `projects.deliverables` i stedet for `sections`-tabellen.
3. **Tilbudsbyggeren** (`components/quote/QuoteBuilder.tsx`, `DeliverablesSection`
   der — merk navnekollisjon med komponenten i pitch-editoren, se §7 for aliasering) —
   forhåndsutfylt fra `project.deliverables` når et nytt tilbud opprettes (hvis pitchen allerede
   har satt noe), redigeres videre der. Endringer lagres som et utkast på
   `quotes.quote_data.deliverables`, per tilbudsversjon (samme mønster som resten av
   tilbudsdata i dag — hver versjon har sin egen snapshot).

**De tre editorene forblir visuelt/teknisk separate komponenter** (ulik stil, ulik kontekst) —
det er datafeltet som samles, ikke UI-en. Ingen grunn til å slå sammen tre ulikt utformede
redigeringsflater til én delt komponent; det er en større, urelatert jobb.

## 5. Livssyklus

- **Under pitch-bygging** (før tilbud): `projects.deliverables` redigeres direkte via
  pitch-editoren eller postprod-modalen (samme felt).
- **Ved opprettelse av nytt tilbud:** `QuoteBuilder` forhåndsutfyller `data.deliverables` fra
  `project.deliverables` (tomt om ingenting er satt ennå). Videre redigering i tilbudsbyggeren
  påvirker kun utkastet (`quote_data.deliverables`) — ikke `projects.deliverables` — helt til
  signering.
- **Ved signering** (`app/api/contracts/sign/route.ts`, uendret mekanisme fra forrige spec):
  `quoteData.deliverables` skrives til `contracts.deliverables` (fryst, historisk, aldri
  oppdatert igjen) **og** overskriver `projects.deliverables` (den levende kopien). Signering er
  det ene tidspunktet tilbudets versjon vinner over noe som er redigert direkte på
  pitch-/postprod-siden i mellomtiden — signering er autoritativ.
- **Etter signering:** `projects.deliverables` forblir fritt redigerbart via pitch-editoren
  eller postprod-modalen (samme fleksibilitet som dagens `deliverableItems`) — endrer ikke det
  fryste `contracts.deliverables`. Postprod-brettet/stepper-siden reagerer på endringer i
  `projects.deliverables` akkurat som i dag (allerede idempotent seeding, se forrige spec §3).

## 6. Migrering av eksisterende data

Alle prosjekter med `sections.content.deliverableItems` satt, men `projects.deliverables`
tom/null, får en engangs-kopiering: samme `id`/`title→name`/`quantity`/`format`/`description`,
**`type` satt til `'annet'`** for alt (gammel data har ingen type — en nøytral default hindrer
at noe prosjekt utilsiktet får video-faner det ikke ba om). Magnus kan siden manuelt sette
`type: 'video'` på spesifikke rader (som gjort manuelt for ae748caf) for å aktivere faner.

Selve `sections`-raden (`type='deliverables'`) røres ikke/slettes ikke — den blir bare ikke
lest fra lenger etter migreringen. Ingen grunn til å rydde den bort nå.

Migreringen er et engangs Node-skript mot service-role-klienten (samme mønster som
`/tmp/verify-*.js` i forrige plan), ikke en SQL-migrasjon — dette er en databerikelse, ikke en
skjemaendring (skjemaet, `projects.deliverables`-kolonnen, finnes allerede fra migrasjon 128).

## 7. Berørte filer (oversikt til implementasjonsplanen)

- `lib/types.ts` — utvid `DeliverableItem` (§2), fjern/behold gammel
  `SectionContent['deliverableItems']`-type til migreringsskriptet er kjørt (kan fjernes i en
  senere opprydding).
- `components/quote/QuoteBuilder.tsx` — `DeliverablesSection` der får `format`/`description`/
  `quantity`-felt (for foto/annet), forhåndsutfylling fra `project.deliverables` ved nytt
  tilbud, bulk-video-tillegg (§3).
- `components/sections/DeliverablesSection.tsx`, `components/project/DeliverableGrid.tsx`,
  `components/project/DeliverableCard.tsx`/`DeliverableListItem.tsx` — les/skriv
  `project.deliverables` i stedet for `section.content.deliverableItems`; legg til
  `type`-velger i redigeringsmodus; bulk-video-tillegg (§3). Krever å plumbe `project`
  (eller i det minste `project.deliverables` + en oppdateringsfunksjon) ned dit
  `SectionRenderer.tsx` bygger denne seksjonen.
- `components/project/SectionRenderer.tsx` — send `project.deliverables`/oppdateringsfunksjon
  videre til `DeliverablesSection` i stedet for kun `section.content`.
- `app/admin/postprod/[id]/page.tsx` + `lib/actions/pipeline.ts`
  (`getProjectDeliverablesSection`/`updateProjectDeliverablesSection`) — pek om til
  `projects.deliverables`; behold samme enkle modal-UI, men legg til type-velger.
- `app/api/generate-project/route.ts`, `app/api/translate-project/route.ts`,
  `lib/actions/transfers.ts` — oppdater til å lese/skrive `projects.deliverables` i stedet for
  `sections.content.deliverableItems`.
- `app/admin/projects/new/ProjectForm.tsx` — sjekk hva feltet brukes til der (sannsynligvis kun
  AI-generert startdata) og oppdater tilsvarende.
- Nytt engangsskript (ikke en `supabase/migrations/*.sql`-fil) for databerikelse (§6).
- `app/api/contracts/sign/route.ts` — ingen endring i selve fryse-mekanismen, kun at kilden
  (`quoteData.deliverables`) nå kommer fra en forhåndsutfylt-fra-prosjekt liste i stedet for en
  alltid-tom en.

## 8. Utenfor scope

- Å slå sammen de tre redigerings-UI-ene til én delt komponent (§4) — bevisst utelatt, egen
  jobb hvis det senere viser seg ønskelig.
- Strukturert lengde-felt separat fra `format` (§2.1) — kan revurderes senere.
- Opprydding/sletting av gamle `sections`-rader etter migrering (§6).
