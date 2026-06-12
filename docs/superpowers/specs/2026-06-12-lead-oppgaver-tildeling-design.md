# Design: Oppgavetildeling på leads + tildelingsvarsler

**Dato:** 2026-06-12
**Status:** Godkjent av Magnus (natt-kjøring autorisert). Revidert under planlegging —
se «Arkitektur-funn» under.

## Bakgrunn

Prosjekt-oppgaver kan allerede tildeles flere personer via `task_assignees`
(pipeline-kortene, prosjekt-hub, pre-/postprod). Men:

1. **Lead-arbeidsflaten mangler oppgaver** — kontaktsiden
   (`/admin/projects/[id]/contact`), som leads-listen lenker til, viser
   lead-info og chat, men ingen oppgaver og ingen mulighet til å opprette/
   tildele f.eks. «Send tilbud», «Følg opp lead» eller «Book møte».
2. **Leads har ingen ansvarlig i UI** — kolonnen `leads.assigned_to` finnes
   i databasen (migrasjon 040), men brukes ingen steder.
3. **Ingen varsler ved tildeling** — `notifications.type` tillater kun
   `project_message`, `task_message` og `selection_submitted`.

## Arkitektur-funn (endrer opprinnelig idé)

`createLead` oppretter **alltid** et koblet prosjekt i `lead`-steget og seeder
oppgavemaler på det. Lead-oppgaver *er* altså prosjekt-oppgaver på det koblede
prosjektet (`leads.converted_to_project_id`). Den opprinnelige planen om en
`tasks.lead_id`-kolonne er derfor unødvendig — vi gjenbruker eksisterende
oppgavemodell og legger UI-et der leadene faktisk jobbes med.

## Avklarte valg (Magnus, 2026-06-12)

- Omfang: oppgaver på leads + ansvarlig på lead. Prosjekt-tildeling beholdes urørt.
- Varsler: ja, ved tildeling av oppgave og lead.
- Hurtigknapper for vanlige oppgavetyper: ja.

## 1. Database — migrasjon `061_assignment_notifications.sql`

Kun `notifications`-endringer (tasks og leads trenger ingen endring):

- `project_id` gjøres nullable (`DROP NOT NULL`) — lead-varsler for leads uten
  prosjektkobling (legacy) skal ikke knekke.
- Ny kolonne `lead_id UUID REFERENCES leads(id) ON DELETE CASCADE`, nullable,
  med indeks.
- `type`-CHECK utvides til `('project_message', 'task_message',
  'selection_submitted', 'task_assigned', 'lead_assigned')`.

Kjøres mot Supabase via `scripts/migrate-single.sh` (DATABASE_URL i `.env.local`).

## 2. Server-side

### Ny delt hjelper `lib/notify-assignment.ts`
`notifyAssignment(...)` — slår opp innlogget brukers profil, hopper over ved
selv-tildeling, og inserter varsel via service-client (samme mønster som
`selections.ts`). Feil logges og svelges — varsling skal aldri blokkere
hovedhandlingen.

### `lib/actions/pipeline.ts`
- `toggleTaskAssignee` — ved *tillegg* (ikke fjerning): hent oppgavetittel +
  prosjekttittel og send `task_assigned`-varsel til den tildelte.
- Ny `getProjectStageTasks(projectId)` — returnerer prosjektets nåværende
  `pipeline_stage` + oppgaver for det steget (gjenbruker `getTasksForProject`).
  Brukes av oppgavepanelet på lead-sidene.

### `lib/actions/leads.ts`
- Ny `assignLead(leadId, profileId | null)` — setter `leads.assigned_to`,
  sender `lead_assigned`-varsel ved tildeling til andre.
- Ny `getLeadsWithMeta()` — som `getAllLeads`, men joiner ansvarlig-profil og
  teller åpne oppgaver på det koblede prosjektet (til leads-listen).

### `lib/actions/notifications.ts`
- `Notification`-typen utvides: nye typer, `project_id: string | null`,
  `lead_id`, og `leads: { name, company } | null`-join i `getNotifications`.

## 3. UI (admin-paletten fra `lib/admin-theme.ts`)

### Ny komponent `components/admin/LeadTaskPanel.tsx`
Selvstendig klientkomponent med props `{ projectId, leadId, assignedTo, canCreate }`:
- **Ansvarlig-kort:** dropdown med teammedlemmer (`getAllProfiles`), initialer +
  navn, «Ingen ansvarlig» som nullvalg → `assignLead`.
- **Oppgaver-kort:** oppgaveliste for prosjektets nåværende steg — status-pill
  som sykler todo → pågår → ferdig (`updateTaskStatus`, beholder eksisterende
  auto-advance til neste steg), frist og assignee-velger per oppgave (samme
  interaksjonsmønster som `MiniAssigneePicker` på pipeline-kortene).
- **Opprett-rad** (kun når `canCreate`): hurtigknapper *Send tilbud* ·
  *Følg opp lead* · *Book møte* · *Ring tilbake* som fyller tittel-feltet,
  pluss fritekst, valgfri frist (date-input) og tildelings-chips — «Opprett»
  kaller `createTask` + `toggleTaskAssignee` per valgt person (gir varsler).
- `canCreate` er false når lead er `converted` eller `lost` — listen vises
  fortsatt, men opprett-raden skjules.

### Kontaktside `app/admin/projects/[id]/contact/page.tsx` (primær lead-flate)
Panelet monteres i høyre kolonne over «Snarvei til prosjektsiden».

### Lead-detaljside `app/admin/leads/[id]/page.tsx` (legacy-flate)
Samme panel i høyre kolonne — kun når leaden har `converted_to_project_id`.

### Leads-liste `app/admin/leads/page.tsx`
Bytter til `getLeadsWithMeta`; viser ansvarliges initialer (tooltip med navn)
og «N oppgaver» (åpne) per rad når > 0.

### Varselsenter `app/admin/varsler/VarslerClient.tsx`
- `task_assigned`: «{sender} tildelte deg en oppgave» + tittel, lenker til
  `/admin/projects/[id]`.
- `lead_assigned`: «{sender} satte deg som ansvarlig for en lead» + leadnavn,
  lenker til `/admin/projects/[id]/contact` (fallback `/admin/leads/[id]`).
- `NotificationBell` trenger ingen endring (teller generisk).

## 4. Feilhåndtering

- Varsel-insert skal aldri blokkere hovedhandlingen: feil logges
  (`console.error`) og svelges.
- Selv-tildeling gir ikke varsel.
- Lead uten koblet prosjekt (legacy): oppgavepanelet skjules helt.

## 5. Testing/verifisering

Prosjektet har ingen testrigg — verifisering skjer via:
- `npx tsc --noEmit` og `npm run lint` grønt.
- `npm run build` grønt.
- Migrasjonen kjøres mot Supabase og verifiseres med spørring mot
  `information_schema` (constraint + kolonner).
- Manuell flyt-sjekk mot dev-server der mulig: opprett lead-oppgave med
  hurtigknapp, tildel, sjekk «Mine oppgaver» og varsel.

## Utenfor scope

- E-post/push ved tildeling (kun varselsenteret).
- Frittstående oppgaver uten lead/prosjekt.
- Endringer i offentlige `/p/*`-sider.
- «Mine oppgaver»-siden — viser allerede alle tildelte oppgaver uavhengig av steg.
