# Tapte prosjekter — Design spec

**Dato:** 2026-06-05
**Status:** Godkjent av Magnus

## Oversikt

Leafilms trenger å registrere prosjekter som ikke ender i salg — med årsak, notat og pipeline-steg ved tap. Dataen brukes til statistikk og læring over tid.

## Datamodell

### Endringer på `projects`-tabellen

Fire nye kolonner:

| Kolonne | Type | Nullable | Beskrivelse |
|---|---|---|---|
| `lost_reason` | text (enum-verdi) | ja | Forhåndsdefinert årsak |
| `lost_notes` | text | ja | Valgfritt fritekst-tillegg |
| `lost_at` | timestamptz | ja | Tidsstempel for når det ble registrert |
| `lost_stage` | text (pipeline_stage) | ja | Pipeline-steg prosjektet var i ved tap |

`status`-kolonnen settes til `'lost'` for å filtrere prosjektet ut av pipeline.

### Tapte årsaker (enum-verdier)

```
pris           — Pris for høy
konkurrent     — Valgte konkurrent
utsatt         — Prosjekt utsatt
budsjett_kuttet — Budsjett kuttet
intern         — Intern produksjon (kunden gjør det selv)
ikke_svar      — Ikke svar / ghostet
annet          — Annet
```

### Migrasjon

Én migrasjon (`048_lost_projects.sql`) som legger til de fire kolonnene på `projects`. Status-kolonnen er allerede en fritekst-kolonne — koden setter `status = 'lost'` uten skjemaendring.

## UI

### 1. Trigger — Project hub (`/admin/projects/[id]`)

En rød ghost-knapp "Marker som tapt" i headeren ved siden av "Rediger →". Åpner modal direkte på siden (ingen navigasjon).

### 2. Modal

Rendres inline i project hub-siden. Innhold:

- Overskrift: "Marker prosjekt som tapt"
- Radio-buttons for årsak (alle 7 kategorier)
- Valgfritt textarea: "Notater (valgfritt)"
- Knapper: "Marker som tapt" (rød, disabled til årsak er valgt) + "Avbryt"

Etter bekreftelse:
- Setter `status = 'lost'`, `lost_reason`, `lost_notes`, `lost_at = now()`, `lost_stage = project.pipeline_stage`
- Redirect til `/admin/pipeline`

### 3. Arkiv og statistikk — `/admin/tapte`

Ny side med to seksjoner:

**Nøkkeltall (øverst, 4 chips):**
- Totalt tapte prosjekter
- Vanligste årsak
- Gjennomsnittlig pipeline-steg ved tap
- Win/loss-ratio (fakturerte prosjekter vs tapte)

**Liste (nedre del):**
- Tabell med: prosjektnavn, kunde, årsak, pipeline-steg, dato
- Filtrerbar på årsak
- Sorterbar på dato

### 4. Navigasjon

Lenke til `/admin/tapte` legges til i admin-navigasjonen.

## Filstruktur

```
app/admin/tapte/page.tsx          — Arkiv + statistikk
supabase/migrations/048_lost_projects.sql
lib/actions/lost.ts               — Server actions: markAsLost, getLostProjects, getLostStats
```

Modal og "Marker som tapt"-knapp implementeres direkte i `/admin/projects/[id]/page.tsx`.

## Ikke inkludert (bevisst utelatt)

- Mulighet for å angre / gjenopprette et tapt prosjekt (kan legges til senere)
- E-postvarsling ved tap
- Eksport av tapte prosjekter til CSV
