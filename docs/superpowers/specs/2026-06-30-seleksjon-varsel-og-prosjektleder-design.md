# Seleksjon — varsler, pipeline-fremgang og prosjektleder

**Dato:** 2026-06-30

## Mål

Når kunden sender inn sitt bildevalg skal teamet varsles, postproduksjon komme seg videre automatisk, og man skal enkelt kunne se kundens valg fra postproduksjonsfanen. I tillegg innføres begrepet "prosjektleder" som fallback for varsler.

## Endringer

### 1. Migrasjon `078_project_lead.sql`

```sql
ALTER TABLE projects ADD COLUMN project_lead_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
```

### 2. Delt varsel-hjelpefunksjon

Ny intern funksjon `notifyOnSelectionSubmit(projectId, service)` i `lib/actions/selections.ts`:

1. Hent unike `profile_id` fra `task_assignees` for alle tasks i prosjektet
2. Hvis ingen → hent `project_lead_id` fra `projects`
3. Sett inn `selection_submitted`-varsler for de(n) som ble funnet
4. Ingen treff → ingenting (stille feil)

Brukes av både `submitGallery()` og `submitAlbumPicks()`.

### 3. `submitAlbumPicks()` — full pipeline-integrasjon

Etter at albumstatus settes til `submitted`:

- Hent `gallery_id` fra `selection_albums` → `gallery.project_id` fra `selection_galleries`
- Kall `notifyOnSelectionSubmit(projectId, service)`
- Finn task med `pipeline_stage = 'post_prod'` og `title ILIKE 'Seleksjon til kunde'`, sett `status = 'done'`

Speil av eksisterende logikk i `submitGallery()`.

### 4. Server action `setProjectLead(projectId, profileId | null)`

Ny action i `lib/actions/pipeline.ts`:

```ts
UPDATE projects SET project_lead_id = $profileId, updated_at = now() WHERE id = $projectId
```

Returnerer `{ ok: boolean, error?: string }`.

### 5. Prosjektleder-widget i prosjektheadere

Felles inline-komponent (ikke egen fil — inline i hver side siden det ikke er shared layout):

- Viser profilinitialer + navn hvis satt, ellers "Legg til leder"
- Klikk åpner dropdown med alle profiler fra `getAllProfiles()`
- Kan nullstilles (X-knapp)
- Samme stil og mønster som eksisterende assignee-dropdown i `postprod/[id]/page.tsx`

**Plassering — i headeren på:**
- `app/admin/projects/[id]/page.tsx`
- `app/admin/postprod/[id]/page.tsx`
- `app/admin/preprod/[id]/page.tsx`

`ProjectWithPipeline`-typen i `lib/types.ts` utvides med `project_lead_id: string | null` og `project_lead: { id: string; name: string | null; email: string } | null`.

Queries som henter prosjekt-data oppdateres til å inkludere `project_lead:profiles(id, name, email)`.

### 6. Postprod — kundevalg alltid synlig

I `app/admin/postprod/[id]/page.tsx`:

- Fjern `selectedTask.title === 'Redigering' || selectedTask.title === 'Redigering bilder'`-betingelsen
- Panelet vises på **alle steg** når `selectionImages.length > 0`
- Tittel endres til "Kundens bildevalg (N)" for å fungere i alle kontekster

## Ikke i scope

- Push-notifikasjoner / e-post
- Prosjektleder-felt på listesiden (kun detaljsider)
- Endring av varslingslogikk for andre hendelser enn seleksjon
