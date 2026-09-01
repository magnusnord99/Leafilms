# Se og lås opp tidligere pipeline-steg — Design spec

**Dato:** 2026-09-01
**Status:** Godkjent av Magnus (retning), venter på gjennomlesning av dette dokumentet

## Bakgrunn

I dag blokkerer to av stegsidene helt så snart prosjektet har gått videre til neste steg:

- `/admin/preprod/[id]` sjekker `project.pipeline_stage !== 'pre_prod'` ved render og viser en full blokkeringsskjerm ("Prosjektet er ikke lenger i pre-produksjon") uten mulighet til å se innholdet.
- `/admin/postprod/[id]` henter prosjektet via `getPostProdProjects()` i `lib/actions/pipeline.ts`, som filtrerer hardt på `.eq('pipeline_stage', 'post_prod')` — prosjektet finnes rett og slett ikke i resultatet lenger, samme type blokkeringsskjerm.

Magnus ønsker å kunne klikke seg inn på et steg prosjektet har passert og se det — og ved behov låse opp og redigere, men med en bekreftelse først siden det er lett å gjøre utilsiktet på et steg som regnes som ferdig.

**Research avdekket at bare 5 av de 10 pipeline-stegene faktisk har en side med noe meningsfullt å vise/låse per steg** — kontakt (lead), pre-prod, produksjon, post-prod og faktura (fakturert) har hver sin dedikerte side som representerer nettopp det steget. De resterende 5 (møte, tilbud_sendt, kontrakt, levering, videresalg) ruter til delte, ikke-stegspesifikke sider:
- E-post-siden (`/admin/projects/[id]/email`, brukt av møte/levering/videresalg) henter `emailType` og alt innhold live fra prosjektets *nåværende* steg — det finnes ingen lagret "slik så det ut da prosjektet var i møte"-tilstand å vise skrivebeskyttet.
- Prosjekt-hubens `?tab=pitch`/`?tab=kontrakt`-faner (`app/admin/projects/[id]/page.tsx`) er i praksis "alltid-på prosjektinnstillinger" (frister, kontrakt-signert-bryter osv.), ikke stegspesifikt innhold.

**Scope for denne runden er derfor begrenset til de 5 stegsidene** som faktisk representerer ett steg hver. De 5 delte sidene røres ikke.

## Mål

- Klikke inn på et av de 5 stegsidene for et prosjekt som har gått forbi det steget → siden laster og viser innholdet skrivebeskyttet, i stedet for å blokkere helt.
- En synlig "Lås opp for redigering"-handling, med en bekreftelsesdialog før den slår inn.
- Opplåsing er midlertidig (kun for gjeldende sidevisning) — ikke lagret noe sted, låser seg igjen ved reload/ny navigering.
- Ingen varsling til andre brukere — bekreftelsesdialogen er kun til personen som låser opp selv.
- Samme rollesperre som i dag avgjør hvem som i det hele tatt når siden (`lib/permissions.ts`); opplåsing krever ingen ekstra rettighet utover det.
- Et steg prosjektet *ikke har nådd ennå* skal fortsatt blokkere helt, som i dag — dette endres ikke.

## Scope

- **Kun disse 5 sidene:** `/admin/projects/[id]/contact` (lead), `/admin/preprod/[id]` (pre_prod), `/admin/produksjon/[id]` (produksjon), `/admin/postprod/[id]` (post_prod), `/admin/faktura/[id]` (fakturert).
- **Ingen endring** på e-post-siden eller prosjekt-hub-fanene (pitch/kontrakt) — de har ingen egen historikk per steg å vise, og å "låse" dem ville kun blokkert skjemaet uten noen ekstra gevinst.
- **Ingen endring** i rollesperren (`isPathAllowedForRole` i `lib/permissions.ts`) — den fortsetter å blokkere hele stier per rolle, uavhengig av dette.
- **Ingen ny databasetilstand** — opplåsing er ren klient-tilstand (React state), ikke persistert.
- **Ingen varsling** til andre ved opplåsing/redigering av et passert steg i denne runden.

## Arkitektur

### Felles hjelper: `lib/pipeline-stage-lock.ts` (ny)

```ts
import { PIPELINE_STAGES, PipelineStage } from './types'

const STAGE_ORDER = PIPELINE_STAGES.map(s => s.value)

export type StageAccess = 'not_yet_reached' | 'current' | 'past'

export function getStageAccess(pageStage: PipelineStage, projectStage: PipelineStage): StageAccess {
  const pageIdx = STAGE_ORDER.indexOf(pageStage)
  const projectIdx = STAGE_ORDER.indexOf(projectStage)
  if (projectIdx < pageIdx) return 'not_yet_reached'
  if (projectIdx > pageIdx) return 'past'
  return 'current'
}
```

Bruker den eksisterende rekkefølgen i `PIPELINE_STAGES` (lead → møte → tilbud_sendt → kontrakt → pre_prod → produksjon → post_prod → levering → fakturert → videresalg) som eneste kilde til "før/etter".

### Delt UI-komponent: `components/admin/PastStageBanner.tsx` (ny)

Gjenbrukes identisk på alle 5 sider i stedet for å duplisere markup:

- `access === 'past' && !unlocked` → banner: "Skrivebeskyttet · steget er fullført" + knapp "Lås opp for redigering".
- Klikk → `confirm()`: *"Dette steget er fullført og prosjektet har gått videre til [nåværende steg]. Er du sikker på at du vil redigere det? Endringene lagres direkte."*
- Bekreftet → `unlocked` settes til `true` i lokal komponent-state (ikke persistert). Banner bytter til "Redigerer et fullført steg" som permanent påminnelse om at man er i særmodus.
- Reload/navigering bort → tilbake til låst, som normalt.

Props: `stageLabel: string`, `currentStageLabel: string`, `unlocked: boolean`, `onUnlock: () => void`.

### Gjenbruk av eksisterende konvensjon

`readOnly`-navnet gjenbrukes for konsistens — brukes allerede i `SelectionGallery` og de offentlige `/b/[token]`-sidene. Hver side beregner `const readOnly = access === 'past' && !unlocked` og sender det ned til/gater rundt sine redigerende handlinger.

## Per-side endringer

### `/admin/projects/[id]/contact` (lead)
Henter allerede prosjektet uten stegfilter. Legg til `getStageAccess('lead', project.pipeline_stage)`-gate ved render (blokk for `not_yet_reached` — reelt sett aldri, siden lead er første steg, men konsistent). `readOnly` gater: lead-status-knappene (`updateLeadStatus`), notatfeltet (`updateLeadNotes`), chat-sendeknapp.

### `/admin/preprod/[id]` (pre_prod)
Henter allerede prosjektet uten stegfilter. Erstatt dagens harde `if (project.pipeline_stage !== 'pre_prod') { blokkskjerm }` med:
- `not_yet_reached` → samme blokkskjerm som i dag (uendret tekst/oppførsel).
- `past` → render siden normalt, men med `PastStageBanner` og `readOnly` sendt til alle redigerende handlinger (oppgaveliste, notater, filopplasting, deadline-felt m.m.).
- "→ Send til produksjon"-knappen (`handleAdvanceToProduction`) vises **kun** når `access === 'current'` — å avansere gir ikke mening fra en skrivebeskyttet fortidsvisning.

### `/admin/produksjon/[id]` (produksjon)
Ingen eksisterende sperre i noen retning i dag. Legg til samme 3-delte gate. Siden har i praksis kun `ProductionChat` som interaktivt element — chat forblir alltid aktiv (det er en løpende samtale, ikke stegdata som kan "korrumperes"), så `readOnly` her gir i praksis kun banneret, ingen ekstra disabling.

### `/admin/postprod/[id]` (post_prod)
`getPostProdProjects()` (flertall) beholdes uendret — den brukes av `/admin/postprod`-oversikten som skal vise kun *aktive* post-prod-prosjekter. Ny funksjon `getPostProdProject(id)` (entall) i `lib/actions/pipeline.ts` henter ett prosjekt uten stegfilter, til bruk i `[id]`-siden. Samme 3-delte gate som preprod: `not_yet_reached` → dagens blokkskjerm, `past` → banner + `readOnly` rundt oppgave-/notat-/status-redigering, "reseed"-handlingen m.m.

### `/admin/faktura/[id]` (fakturert)
Ingen eksisterende sperre. Legg til samme 3-delte gate. `readOnly` gater `handleAssign` og `handleMarkDone`.

## Feilhåndtering

- Alle 5 sider håndterer allerede "fant ikke prosjektet" (ugyldig id) — uendret.
- `not_yet_reached` beholder eksisterende blokkskjerm-mønster og -tekst per side (kun kontakt- og produksjon-sidene får denne sjekken for første gang — begge er praktisk talt uoppnåelige i normal navigasjon siden `getStageHref` uansett bare lenker til gjeldende steg, men dekker direkte URL-tilgang konsistent med de andre 3).
- Ingen nye feiltilstander knyttet til opplåsing selv — det er ren klient-tilstand, ingen nettverkskall.

## Testing

Manuelt for hver av de 5 sidene:
1. Åpne siden for et prosjekt i nettopp det steget → uendret, fullt redigerbar, ingen banner.
2. Åpne siden for et prosjekt som har gått videre → banner vises, redigerende kontroller er deaktivert.
3. Lås opp → bekreftelsesdialog → bekreft → kontrollene blir redigerbare, banner viser "Redigerer et fullført steg".
4. Gjør en endring i opplåst tilstand → verifiser at den faktisk lagres (samme handlers som i dag, bare ikke lenger gatet).
5. Reload siden → tilbake til låst/skrivebeskyttet.
6. Åpne siden for et prosjekt som *ikke* har nådd steget ennå → uendret blokkskjerm.
7. Verifiser at rollesperren i `lib/permissions.ts` fortsatt blokkerer hele stier for feil rolle, uavhengig av steg-tilstand.
