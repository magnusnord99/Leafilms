# Seed tasks ved prosjektopprettelse

**Dato:** 2026-06-12
**Status:** Godkjent av Magnus

## Problem

Nye prosjekter opprettet via `/admin/projects/new` får ingen oppgaver. `task_templates`-systemet (migrasjon 040) seeder kun tasks ved pipeline-stegbytte (`updatePipelineStage`), ved kontraktsignering og ved lead-opprettelse. Skjemaet lar brukeren velge hvilket pipeline-steg prosjektet starter i, men steget får ingen oppgaver før prosjektet *flyttes* til et nytt steg. Resultatet er at et nystartet prosjekt står uten meningsfulle tasks.

## Løsning

I `app/admin/projects/new/page.tsx`, i `handleSubmit` rett etter at prosjektet er opprettet, kalles den eksisterende server-actionen `seedTasksFromTemplates(project.id, formData.pipeline_stage)` fra `lib/actions/pipeline.ts`.

### Hvorfor dette holder

- `seedTasksFromTemplates` er idempotent (seeder ikke dobbelt for samme prosjekt + steg).
- Den feiler stille med logging og blokkerer aldri prosjektopprettelsen.
- post_prod-spesialtilfellet håndteres: `project_type` (video/photo/mixed) lagres på prosjektet før kallet, så riktige flyter seedes.
- Oppførselen blir konsistent: prosjekter fra lead-konvertering, stegbytte og new-skjemaet får alle tasks for steget de står i.
- Ingen migrasjon, ingen nye tabeller, ingen UI-endring — prosjektsiden (`getProjectHub`) viser allerede tasks for gjeldende steg.

### Avgrensning (YAGNI)

- Tidligere stegs tasks seedes ikke når man starter midt i pipelinen — de er per definisjon allerede gjort.
- `api/projects/[id]/duplicate` endres ikke.
- Ingen AI-genererte tasks i denne omgang (kan bygges oppå senere som AI-forslag i tillegg til malene).

## Testing

1. Opprett prosjekt med steg «lead» → verifiser at de to lead-taskene («Logg første kontakt», «Kvalifiser lead») finnes på prosjektet.
2. Opprett prosjekt med steg «pre_prod» → verifiser de tre pre_prod-taskene.
3. Opprett prosjekt og flytt det til et nytt steg → verifiser at stegbytte-seedingen fortsatt fungerer og ikke dupliserer.
