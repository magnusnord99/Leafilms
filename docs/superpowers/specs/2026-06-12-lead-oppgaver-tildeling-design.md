# Design: Oppgavetildeling på leads + tildelingsvarsler

**Dato:** 2026-06-12
**Status:** Godkjent av Magnus (natt-kjøring autorisert)

## Bakgrunn

Prosjekt-oppgaver kan allerede tildeles flere personer via `task_assignees`
(pipeline-kortene, prosjekt-hub, pre-/postprod). Men:

1. **Leads** kan ikke ha oppgaver — `tasks.project_id` er NOT NULL. Oppgaver
   som «Send tilbud», «Følg opp lead» og «Book møte» hører hjemme på leaden
   før den konverteres til prosjekt.
2. **Leads har ingen ansvarlig i UI** — kolonnen `leads.assigned_to` finnes
   i databasen (migrasjon 040), men brukes ingen steder.
3. **Ingen varsler ved tildeling** — `notifications.type` tillater kun
   `project_message` og `task_message`.

## Avklarte valg (Magnus, 2026-06-12)

- Omfang: oppgaver på leads + ansvarlig på lead. Prosjekt-tildeling beholdes urørt.
- Varsler: ja, ved tildeling av oppgave og lead.
- Hurtigknapper for vanlige oppgavetyper: ja.

## 1. Database — migrasjon `061_lead_tasks_and_assignment.sql`

### tasks
- `project_id` gjøres nullable (`DROP NOT NULL`).
- Ny kolonne `lead_id UUID REFERENCES leads(id) ON DELETE CASCADE`, nullable.
- CHECK-constraint `tasks_owner_check`: nøyaktig én av `project_id` / `lead_id`
  er satt: `(project_id IS NOT NULL) <> (lead_id IS NOT NULL)`.
- Indeks `idx_tasks_lead_id ON tasks(lead_id)`.
- Lead-oppgaver bruker eksisterende `pipeline_stage = 'lead'` (gyldig i
  CHECK-constrainten fra 040) — ingen endring av stage-constraint.

### notifications
- `project_id` gjøres nullable (`DROP NOT NULL`) — tildelingsvarsler på leads
  har ikke prosjekt.
- Ny kolonne `lead_id UUID REFERENCES leads(id) ON DELETE CASCADE`, nullable.
- `type`-CHECK utvides til
  `('project_message', 'task_message', 'task_assigned', 'lead_assigned')`.
- INSERT-policy finnes ikke i dag (triggere kjører som definer; server actions
  bruker service-client, jf. `selections.ts`) — ingen RLS-endring nødvendig.

### leads
- Ingen endring; `assigned_to` finnes allerede.

## 2. Server actions

### `lib/actions/leads.ts`
- `assignLead(leadId, profileId | null)` — setter `leads.assigned_to`.
  Ved tildeling til andre enn seg selv: insert varsel
  (`type: 'lead_assigned'`, `lead_id`, `sender_name` = innlogget brukers navn,
  `message_preview` = leadens navn/firma) via service-client, samme mønster
  som `selections.ts:468`.
- `getLeadById`/`getAllLeads` utvides til å joine ansvarlig
  (`assigned_to → profiles(id, name, email)`) og antall åpne oppgaver
  (kun listen).

### `lib/actions/pipeline.ts`
- `createTask` får valgfri `lead_id` (og `project_id` blir valgfri i input);
  validerer at nøyaktig én er satt. Ved `lead_id`: `pipeline_stage: 'lead'`.
- Ny `getTasksForLead(leadId)` — samme shape som `getTasksForProject`
  (med assignees).
- `toggleTaskAssignee` — ved *tillegg* (ikke fjerning) av andre enn seg selv:
  insert varsel `type: 'task_assigned'` med `task_id` + `project_id` eller
  `lead_id` fra tasken, `message_preview` = oppgavetittel (+ kunde-/leadnavn).
- `getMyTasks` — inkluderer lead-oppgaver: join `leads(id, name, company, status)`
  i tillegg til dagens prosjekt-join. Lenke-logikken i «Mine oppgaver» peker
  lead-oppgaver til `/admin/leads/[id]`.

### `lib/actions/notifications.ts`
- `getNotifications` returnerer også `lead_id`; ingen andre endringer
  (les/merk-som-lest er generisk).

### `lib/types.ts`
- `Task` får `lead_id: string | null` (og `project_id: string | null`).
- `Notification` får `lead_id: string | null` og de to nye typene.

## 3. UI (admin-paletten fra `lib/admin-theme.ts`)

### Lead-detaljside `app/admin/leads/[id]/page.tsx`
- **Ansvarlig-velger** i info-seksjonen: dropdown med teammedlemmer
  (`getAllProfiles`), viser initialer + navn, «Ingen ansvarlig» som nullvalg.
- **Ny seksjon «Oppgaver»** under notater:
  - Hurtigknapper: `Send tilbud` · `Følg opp lead` · `Book møte` · `Ring tilbake`
    — klikk fyller tittel-feltet, deretter velges (valgfritt) frist og
    tildelte før «Opprett».
  - Fritekst-tittel for andre oppgaver.
  - Oppgaveliste med status-toggle (todo → pågår → ferdig), frist og
    assignee-velger — gjenbruk samme interaksjonsmønster som pipeline-kortene
    (`toggleTaskAssignee`, `updateTaskStatus`).
- Når lead er `converted` eller `lost`: eksisterende oppgaver vises fortsatt
  (read-only-liste med status), men opprett-raden og hurtigknappene skjules —
  nye oppgaver hører da hjemme på prosjektet (eller er uaktuelle).

### Leads-liste `app/admin/leads/page.tsx`
- Ny kolonne/badge per rad: ansvarliges initialer (tooltip med navn) og
  «N oppgaver» (åpne) når > 0.

### Mine oppgaver `app/admin/tasks/page.tsx`
- Lead-oppgaver vises med lead-navn/firma der prosjektnavn vises i dag, og
  badge «Lead». `taskHref` → `/admin/leads/[id]`.

### Varselsenter `app/admin/varsler/page.tsx`
- Render `task_assigned`: «{sender} tildelte deg: {oppgavetittel}» med lenke
  til prosjekt/lead.
- Render `lead_assigned`: «{sender} satte deg som ansvarlig for lead:
  {leadnavn}» med lenke til leaden.
- Klokke-/badge-komponenten trenger ingen endring (teller uleste generisk).

## 4. Feilhåndtering

- `createTask` med både/ingen av `project_id`/`lead_id` → feil før insert.
- Varsel-insert skal aldri blokkere hovedhandlingen: feil logges
  (`console.error`) og svelges.
- Selv-tildeling gir ikke varsel.

## 5. Testing/verifisering

- `npx tsc --noEmit` og `npm run lint` grønt.
- `npm run build` grønt.
- Migrasjonen kjøres mot Supabase etter prosedyren i `MIGRATIONS.md`;
  hvis den ikke kan kjøres uten Magnus, legges den klar og dokumenteres som
  «venter på kjøring» i morgenrapporten.
- Manuell flyt-sjekk mot dev-server der mulig: opprett lead-oppgave med
  hurtigknapp, tildel, sjekk «Mine oppgaver» og varsel.

## Utenfor scope

- E-post/push ved tildeling (kun varselsenteret).
- Frittstående oppgaver uten lead/prosjekt.
- Endringer i offentlige `/p/*`-sider.
