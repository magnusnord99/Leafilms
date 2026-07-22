# Post-produksjon-brett v2 — dra-og-slipp, egendefinerte lanes, parallelle oppgaver, bibliotek

**Dato:** 2026-07-22
**Status:** Godkjent av Magnus (design), venter på spec-review

Bygger videre på [2026-07-21-postprod-flow-planning-design.md](2026-07-21-postprod-flow-planning-design.md),
som eksplisitt la «endre rekkefølgen i etterkant (dra-og-slipp / flytte)»
utenfor scope i v1. Dette er v2.

## Mål og suksesskriterium

I dag er «Fordeling — Post-produksjon» (`PostCrewSection` i
`app/admin/preprod/[id]/page.tsx`) et hardkodet grid med faste rollenavn
(Logging, Grovklipp, Klipp, Farger, Lyd, Ferdig / Selektering, Seleksjon til
kunde, Redigering, Ferdig) og en «Tildel»-knapp per rad. Rollenavnene er
duplisert i kode og ikke koblet til de faktiske `tasks`-radene eller
`task_templates` — de kan drifte fra hverandre. «Planlagt for
post-produksjon» (`PostProdFlowPlanner`) lar deg legge til et nytt steg og
velge posisjon via en «Sett inn før»-dropdown, men du kan ikke i etterkant
dra et steg til en annen posisjon, og det finnes ingen måte å legge til noe
utenom Video/Foto-sporet (f.eks. en frittstående VFX-oppgave som går
parallelt gjennom hele post-produksjonen, eller en helt ny lane som
«Animasjon»).

Suksesskriterium: de to panelene slås sammen til ett brett drevet direkte av
`tasks`-rader (ingen hardkodede rollelister). Man kan skrive et navn (f.eks.
«VFX»), tildele en person, velge farge/ikon, og dra oppgaven inn i ønsket
lane og posisjon — inkludert på tvers av lanes. Man kan opprette nye,
fritt navngitte lanes utover Video/Foto, og merke en oppgave som
«parallell» slik at den vises i en egen rad uavhengig av rekkefølgen i de
andre lanene. Man kan merke en oppgave som «gjenbrukbar» og senere dra den
inn i et hvilket som helst prosjekt fra et bibliotekspanel.

## Omfang (v2)

- Fjerner `PostCrewSection`, `POST_ROLES_VIDEO`, `POST_ROLES_PHOTO`,
  `resolveGroups` og hardkodet rollegrid fullstendig.
- Ny samlet klientkomponent (`PostProdBoard.tsx`) som erstatter både
  `PostCrewSection` og `PostProdFlowPlanner` på pre-prod-siden.
- Video- og Foto-lanes rendres fra faktiske `tasks`-rader (som i dag i
  `PostProdFlowPlanner`s `tracks`), ikke fra en hardkodet liste.
- Egendefinerte lanes: fritt navngitt, opprettet per prosjekt, med egen
  sekvens/rekkefølge uavhengig av Video/Foto.
- Parallell-oppgaver: egen full-bredde rad, ingen `sort_order`-sekvens —
  representerer arbeid som løper gjennom hele post-produksjonen.
- Dra-og-slipp for å plassere en ny oppgave (erstatter «Sett inn
  før»-dropdown) og for å flytte en eksisterende oppgave — både omplassering
  innad i en lane og flytting til en annen lane/parallell-raden.
- Tildel (assignee), farge og ikon settes direkte i «legg til»-skjemaet og
  kan endres per kort i etterkant.
- «Gjenbrukbar oppgave»-avkrysning lagrer oppgaven i et nytt,
  prosjekt-uavhengig bibliotek. Eget bibliotekspanel man drar oppgaver fra
  inn i et hvilket som helst prosjekts brett (kopierer felter — ingen
  vedvarende kobling til biblioteket etterpå).

Utenfor scope i v2: å oppdatere `task_templates`/malene når man drar en
oppgave til ny posisjon (jf. avklart med Magnus — drag-and-drop endrer kun
det aktuelle prosjektet), redigering/sletting av lanes etter opprettelse
utover det som trengs for v2 (rename/farge på en lane kan komme senere ved
behov), og varsling ved endringer.

## Datamodell

### Migrasjon `121_post_prod_board.sql`

**`tasks`** — nye kolonner:

```sql
ALTER TABLE tasks
  ADD COLUMN custom_lane_id UUID REFERENCES post_prod_lanes(id) ON DELETE SET NULL,
  ADD COLUMN is_parallel   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN color         TEXT,
  ADD COLUMN icon          TEXT;

ALTER TABLE tasks ADD CONSTRAINT tasks_lane_exclusive CHECK (
  NOT is_parallel OR (custom_lane_id IS NULL AND sub_type IS NULL)
);
```

En oppgave er enten i video/foto-laen (`sub_type`), i en egendefinert lane
(`custom_lane_id`), eller parallell (`is_parallel = true`) — aldri flere
samtidig. `color`/`icon` er separate fra det eksisterende `task_data` JSONB-
feltet (som brukes til lenkedata per steg, jf.
`lib/actions/pipeline.ts:1209`) — ingen kollisjon.

**Ny tabell `post_prod_lanes`** — én rad per egendefinert lane:

```sql
CREATE TABLE post_prod_lanes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Video/Foto forblir implisitte (styrt av `sub_type`, som i dag) — ikke rader
her. RLS følger samme mønster som `tasks`/`projects` (medlemmer av
prosjektet har tilgang).

**Ny tabell `post_prod_task_library`** — prosjekt-uavhengig bibliotek:

```sql
CREATE TABLE post_prod_task_library (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title              TEXT NOT NULL,
  description        TEXT,
  color              TEXT,
  icon               TEXT,
  lane_type          TEXT NOT NULL CHECK (lane_type IN ('video','photo','custom','parallel')),
  custom_lane_name   TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Innhold her er kun en mal for å fylle ut «legg til»-skjemaet raskt — å dra
en biblioteksrad inn i et prosjekt oppretter en vanlig ny `tasks`-rad med
kopierte felter, ingen fremmednøkkel tilbake til biblioteket.

### Kompatibilitet med eksisterende logikk

- `reseedPostProdTasks` (`lib/actions/pipeline.ts:464`) sletter og
  regenererer kun rader med `created_by IS NULL` (maloppgaver fra
  `task_templates`). Alle rader med `custom_lane_id` eller `is_parallel`
  er alltid menneske-opprettet (`created_by` satt), så de bevares
  automatisk av eksisterende logikk — ingen endring nødvendig der.
- `deleteTask` (`lib/actions/pipeline.ts:708`) sperrer kun på
  `created_by IS NULL`, så sletting av oppgaver i egendefinerte lanes og
  parallell-raden fungerer uendret.
- `task_templates`-seeding ved prosjektopprettelse er uendret — kun
  Video/Foto-lanene seedes derfra, som i dag.

## Server actions (`lib/actions/pipeline.ts`)

- **`getPostProdBoard(projectId)`** erstatter `getPostProdFlowOptions`.
  Returnerer: Video/Foto-lanes (tittel, id, farge, ikon, assignee per
  oppgave — bygget fra `tasks`, ikke hardkodet), prosjektets
  `post_prod_lanes` med sine oppgaver, og listen over `is_parallel = true`-
  oppgaver.
- **`addPostProdBoardTask(input)`** erstatter `addPlannedPostProdStep`.
  Input: `projectId, title, description?, assigneeId?, color?, icon?,
  destination` (`{ type: 'video' | 'photo' } | { type: 'custom', laneId }
  | { type: 'parallel' }`), `insertBeforeTaskId?`, `isReusable`. Gjenbruker
  `computeInsertionOrder`/`assignSortOrder` fra `lib/postprod-flow.ts` for
  Video/Foto/egendefinert-lane-innsetting (ankeret blir titelen på raden
  ved `insertBeforeTaskId` slått opp i sekvensen — samme mekanikk som i
  dag, kun UI-kilden til `insertBeforeTitle` endres fra dropdown til
  drop-posisjon). Parallell-oppgaver har ingen sekvens å sette inn i.
  Hvis `isReusable`, settes det også inn en rad i `post_prod_task_library`.
- **`moveBoardTask(taskId, destination, insertBeforeTaskId?)`** — ny.
  Flytter et eksisterende kort: omplassering innad i lane, eller til en
  annen lane/parallell-raden. Regner om `sort_order` for berørt(e)
  lane(r) via samme `assignSortOrder`-mønster.
- **`createCustomLane(projectId, name, color?)`** — ny.
- **`addTaskToLibrary(taskId)`** — ny, for å legge en allerede eksisterende
  oppgave i biblioteket i etterkant (ikke bare ved opprettelse).
- **`getTaskLibrary()`** — ny, henter hele biblioteket (ikke
  prosjektfiltrert).

## UI

Ny komponent `app/admin/preprod/[id]/PostProdBoard.tsx` erstatter
`PostCrewSection` og `PostProdFlowPlanner` i sin helhet. Layout:

- Video- og Foto-lanes (for `mixed`-prosjekter begge, ellers én) vist som
  vertikale kort-lister, drevet av `getPostProdBoard`.
- Egendefinerte lanes vist på samme måte, med en «+ Ny lane»-knapp som
  åpner et lite navn+farge-skjema.
- En egen full-bredde parallell-rad (over eller under lanene) for
  `is_parallel = true`-oppgaver.
- Hvert kort: tittel, ikon, fargekant, tildelt person (klikkbar for å
  endre), dra-håndtak.
- «Legg til oppgave»-skjema: tittel, beskrivelse, lane-valg
  (Video/Foto/egendefinert/Parallell), tildel-velger (gjenbruker samme
  profil-søk/-liste som dagens `PostCrewSection.assignRole`), farge- og
  ikonvelger, «Gjenbrukbar oppgave»-avkrysning. Ny oppgave legges til sist
  i valgt lane (eller i parallell-raden); man drar den til riktig plass
  etterpå.
- Bibliotekspanel: kompakt liste over `post_prod_task_library`, filtrerbar
  på lane-type, dra-kilde inn i et hvilket som helst prosjekts brett.

## Drag-and-drop

`@dnd-kit/core` + `@dnd-kit/utilities` er allerede avhengigheter (brukt i
`app/admin/pipeline/page.tsx` for kolonne-til-kolonne-dra av prosjektkort).
Dette brettet bruker samme `DndContext`/`PointerSensor`-oppsett, men legger
til `@dnd-kit/sortable` (`SortableContext`, `arrayMove`) per lane — ny bruk
i kodebasen, standard dnd-kit-mønster.

- Hver lane (Video, Foto, hver egendefinert lane) er en egen
  `SortableContext`.
- `onDragEnd`: hvis kortet slippes i samme lane, kall `moveBoardTask` med
  ny nabo-posisjon. Hvis det slippes i en annen lane/parallell-raden, kall
  `moveBoardTask` med ny `destination`.
- Biblioteksrader er egne draggable elementer (id prefikset `lib:`, skilt
  fra ekte task-id-er i `onDragEnd`-logikken) som kan slippes i enhver
  lane eller parallell-raden — utløser `addPostProdBoardTask` med
  bibliotekradens felter forhåndsutfylt, ikke `moveBoardTask`.

## Testing/verifisering

Ingen automatisert testsuite for dette området i dag. `tsc --noEmit` og
targeted `eslint` på endrede filer, deretter manuell verifisering
(midlertidig testbruker/testprosjekt, ryddes opp etterpå):

- Åpne et `mixed`-prosjekt i pre-prod: Video- og Foto-lanes viser de
  faktiske stegene (ingen hardkoding, ingen drift fra `task_templates`).
- Legg til en ny oppgave med tildeling, farge og ikon → dukker opp sist i
  valgt lane → dra den til ny posisjon mellom to eksisterende steg.
- Dra en oppgave fra Video-lanen over til en nyopprettet egendefinert lane
  («Animasjon») → verifiser at `sub_type` nullstilles og `custom_lane_id`
  settes, og at `sort_order` er riktig i begge lanes etterpå.
- Opprett en parallell-oppgave → verifiser at den vises i parallell-raden
  uavhengig av øvrige lanes, og ikke påvirkes av «↺ Nullstill»/reseed.
- Merk en oppgave som gjenbrukbar → åpne et annet prosjekt → dra den fra
  biblioteket inn i en lane der → verifiser at feltene kopieres og at
  originaloppgaven i biblioteket ikke endres.
- Trykk «↺ Nullstill» i post-produksjon → verifiser at egendefinerte lanes
  og parallell-oppgaver overlever uendret (kun maloppgaver regenereres),
  som i dag.
- Slett en oppgave i en egendefinert lane / parallell-raden via
  `deleteTask` → verifiser at sletting fungerer som for andre
  menneske-lagde steg.
