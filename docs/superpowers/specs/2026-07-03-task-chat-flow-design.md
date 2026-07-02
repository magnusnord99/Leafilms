# Chat-flyt: task-chat overalt + reparerte varsler

**Status:** Autonom natt-kjøring. Magnus ba eksplisitt om å legge planen selv og
kjøre den ferdig uten interaktiv avklaring ("jeg legger meg, du har godkjenning
til å gjennomføre hele planen du lager"). Denne spec-en er derfor skrevet
kompakt av meg (Team Lead) basert på kodebase-research, ikke gjennom vanlig
fram-og-tilbake-brainstorming. Ingen bruker-review-gate før implementasjon —
Magnus reviewer resultatet når han våkner.

## Bakgrunn / funn

Research av hele chat-stacken (migrasjoner, komponenter, actions, varsler)
avdekket:

1. **`task_messages` finnes allerede i databasen og er generisk** — knyttet
   til `tasks.id`, med mentions, RLS og realtime (migrasjon 045 + 081). Den
   funker for en task i *hvilket som helst* pipeline-steg.
2. **Men UI for task-chat finnes bare ett sted: postprod** (inlinet i
   `app/admin/postprod/[id]/page.tsx`, ~550 linjer blandet inn i en
   1847-linjers fil). Preprod, prosjekt-hub (`TaskChecklist`) og "Mine
   oppgaver" har tasks med assignees og kan trigge varsler — men har ingen
   måte å faktisk åpne samtalen på.
3. **Varsel-routing er ødelagt for task-chat utenfor postprod.**
   `VarslerClient.tsx` sender `task_message`/`task_message_mention` rett til
   `/admin/postprod/{project_id}` uansett hvilket steg oppgaven faktisk er i,
   og uten å velge riktig oppgave — brukeren må lete etter samtalen selv.
4. **Prosjekt-chat (`ProjectChat`) er ikke montert på prosjekt-hub-siden**
   (`app/admin/projects/[id]/page.tsx`), bare på en separat `/edit`-underside.
   Hub-siden er der folk faktisk lander.
5. **`notify_project_message`-triggeren varsler ingen** hvis prosjektet ikke
   har noen `task_assignees` ennå (typisk lead/møte-steg) — meldinger i tidlig
   fase forsvinner sporløst med mindre man eksplisitt @nevner noen.
6. **`QuoteChat.tsx` har driftet fra de andre to chat-implementasjonene** —
   egen mention-parsing (ikke `lib/mentions.ts`), ingen tastatur-navigasjon i
   mention-dropdown, og ikke realtime (poller kun etter egen sending).
7. `CLAUDE.md` sin "uapplied migrasjoner"-seksjon er utdatert — migrasjonene
   036/037/039 er kjørt for lengst, nummerering står nå ved 081.

Konklusjon: dette er **ikke et datamodell-problem**, det er et
UI-konsistens- og flyt-problem. Ingen ny task_messages-tabell trengs — jobben
er å gjøre den eksisterende kanalen tilgjengelig og riktig lenket overalt.

## Mål for denne kjøringen

- Enhver task, i ethvert pipeline-steg, skal ha en synlig, brukbar chat.
- Å klikke et varsel skal alltid lande brukeren rett i riktig samtale —
  riktig side, riktig oppgave valgt, scrollet til syne.
- Prosjekt-chat skal være nåbar fra siden folk faktisk bruker (hub).
- De tre chat-overflatene (prosjekt/task/tilbud) skal oppføre seg likt:
  samme mention-input, samme highlighting, samme realtime-oppførsel.
- Ingen regressjon i eksisterende postprod-chat.

**Eksplisitt utenfor scope** (YAGNI for denne kjøringen): lesekvittering
per bruker/task (persisted read-state), chat direkte fra kanban-kortene i
`app/admin/pipeline/page.tsx`, threading/svar-på-melding, filvedlegg i chat.

## Arkitektur

### 1. Ny delt komponent: `components/task/TaskChat.tsx`

Ekstraherer post-prod sin inline chat-UI (meldingsliste med bobler,
avsender-highlighting, mention-parsing, `MentionTextInput`) til en
frittstående klientkomponent — samme visuelle språk som i dag, ingen
visuell endring for postprod-brukere.

```
type Props = {
  taskId: string
  taskTitle: string
  currentUserId: string | null
  profiles: MentionableProfile[]
}
```

Innkapsler: henting via `getTaskMessages`, sending via `sendTaskMessage`,
realtime-subscription på `task_messages` filtrert på `task_id` (samme
mønster som i dag), auto-scroll til bunn ved nye meldinger.

`app/admin/postprod/[id]/page.tsx` refaktoreres til å bruke `<TaskChat>` i
stedet for inline-koden. Ren utskifting — ingen atferdsendring.

### 2. Ny wrapper: `components/task/TaskChatToggle.tsx`

For steder der tasks vises som flate lister (preprod, prosjekt-hub) uten en
master-detail-layout: en liten chat-ikonknapp per oppgaverad med
meldingsteller-badge. Klikk ekspanderer en inline panel med `<TaskChat>`
under raden. Lukkes ved nytt klikk. Holder `expanded`-state selv, men
aksepterer en `forceOpen`-prop for deep-linking (se under).

### 3. Meldingsteller i bulk

Ny server action `getTaskMessageCounts(taskIds: string[])` i
`lib/actions/pipeline.ts` — én gruppert spørring
(`select task_id, count(*) from task_messages where task_id = any($1) group
by task_id`), brukt av preprod- og hub-siden når de laster tasks, så
`TaskChatToggle` kan vise antall meldinger uten N+1-kall.

### 4. Preprod og prosjekt-hub kobles til task-chat

- `app/admin/preprod/[id]/page.tsx` sin `TaskList`: hver rad får
  `<TaskChatToggle>` ved siden av assignee-picker.
- `app/admin/projects/[id]/page.tsx` sin `TaskChecklist`: samme mønster.

Begge gjenbruker `getTaskMessageCounts` og `TaskChatToggle` — ingen
duplisert chat-logikk.

### 5. Prosjekt-chat på hub-siden

`<ProjectChat projectId={id} />` monteres også på
`app/admin/projects/[id]/page.tsx` (samme mønster som på `/edit`-siden).

### 6. Deep-linking via `?task=<id>`

- **Postprod**: leser `?task=` ved last, velger den oppgaven i stedet for
  `getInitialIdx`-default, scroller den til syne i oppgavelisten.
- **Preprod / hub**: leser `?task=`, sender `forceOpen` til riktig
  `TaskChatToggle`, scroller raden til syne.

Prosjekt-hub-siden leser allerede `?tab=` via `useSearchParams` — samme
mønster gjenbrukes for `?task=`.

### 7. Varsel-routing fikses (`VarslerClient.tsx`)

`handleClick` for `task_message`/`task_message_mention`: slår opp
oppgavens `pipeline_stage` (ett lite `supabase.from('tasks').select
('pipeline_stage').eq('id', n.task_id).single()`-kall — klienten har
allerede en Supabase-klient og RLS tillater lesing), ruter deretter:

- `post_prod` → `/admin/postprod/{project_id}?task={task_id}`
- `pre_prod` → `/admin/preprod/{project_id}?task={task_id}`
- alt annet → `/admin/projects/{project_id}?task={task_id}`

Fallback til dagens postprod-oppførsel hvis oppslaget feiler (nettverksfeil
e.l.), så vi aldri ender i en blindvei.

### 8. "Mine oppgaver" (`app/admin/tasks/page.tsx`)

`taskHref()` utvides til å håndtere `pre_prod` (→ preprod + `?task=`) og
alle andre steg (→ prosjekt-hub + `?task=`), i tillegg til eksisterende
post_prod-gren (som også får `?task=` for å velge riktig oppgave direkte).

### 9. Migrasjon 082: fallback-varsling for prosjekt-chat uten tasks

Ny migrasjon `supabase/migrations/082_notify_project_message_fallback.sql`:
`notify_project_message()`-funksjonen utvides — hvis ingen
`task_assignees`-rader finnes for prosjektet, varsle `project_lead_id` i
stedet (hvis satt). Additiv endring, ingen destruktiv SQL, følger samme
`CREATE OR REPLACE FUNCTION`-mønster som migrasjon 081.

### 10. QuoteChat konsolideres

`components/quote/QuoteChat.tsx` bytter til `MentionTextInput` +
`lib/mentions.ts` (samme `mentionToken`/`extractMentionIds`/
`splitMentionSegments` som de to andre chat-flatene) og får en
realtime-subscription på `quote_messages` (krever at `quote_messages`
legges til `supabase_realtime`-publikasjonen — del av migrasjon 082, samme
mønster som 081 brukte for `task_messages`/`project_messages`).

## Feilhåndtering

- Alle nye Supabase-kall følger eksisterende mønster: `try/catch` +
  `console.error` + tomt/null-resultat til UI (som `getTaskMessages` gjør i
  dag). Ingen ny feilhåndteringsstrategi introduseres.
- Varsel-routing: hvis task-oppslag feiler, fall tilbake til dagens
  postprod-lenke fremfor å kaste feil i UI.

## Testing

- Manuell verifikasjon (ikke automatiserte tester i dette repoet i dag):
  `npm run dev`, gå gjennom flyten i to nettleser-kontekster (to
  innloggede brukere) for å bekrefte realtime-levering og varsel-routing
  for: postprod-task, preprod-task, hub-task, prosjekt-chat på hub, og
  tilbud-chat.
- `npx tsc --noEmit` (eller `npm run build`) etter hver større endring for
  å fange typefeil tidlig.
- Lena (tech lead) kjører kodegjennomgang på hele diffen før commit,
  spesielt på migrasjon 082 (SQL) og at postprod-refaktoreringen ikke endrer
  synlig atferd.

## Ikke i denne kjøringen

- Oppdatering av `CLAUDE.md` sin utdaterte "uapplied migrasjoner"-seksjon —
  nevnes til Magnus som en separat, rask fiks, gjøres ikke som del av denne
  chat-jobben.
- Branch/merge: arbeidet gjøres på en egen branch
  (`feat/task-chat-everywhere`), committes lokalt, **pushes ikke og merges
  ikke til main** uten eksplisitt godkjenning — Magnus reviewer og bestemmer
  ved oppvåkning.
