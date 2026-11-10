# Prosjekttråder i Meldinger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Legg til en "Prosjekttråder"-seksjon i `/admin/meldinger` som samler alle 7 prosjekt/oppgave/tilbud/lead-knyttede meldingstråder brukeren er en del av, skilt fra direktemeldinger, med lenke tilbake til der tråden faktisk bor.

**Architecture:** Bygges helt på eksisterende data (`notifications`, `conversations`) — ingen nye tabeller/migrasjoner. En ny server action grupperer brukerens relevante varsler per tråd og klassifiserer gruppe-samtaler (produksjon/lead/e-post) via sine FK-kolonner på `conversations`. Lenkelogikk for "gå til tråd" deles mellom `/admin/varsler` og den nye listen via en ekstrahert, ren funksjon.

**Tech Stack:** Next.js App Router, Supabase (ingen skjemaendring), TypeScript strict. Ingen test-rammeverk finnes i repoet (`package.json` har kun `lint`/`build`) — verifisering skjer via `npx tsc --noEmit`, `npm run lint`, og manuell gjennomgang i dev-server, i tråd med resten av kodebasen.

**Spec:** `docs/superpowers/specs/2026-11-09-project-threads-in-meldinger-design.md`

## Global Constraints

- Ingen nye databasetabeller eller migrasjoner.
- Ikke bygg inline svar/visning for de 7 trådtypene inni Meldinger — klikk navigerer bort til der tråden bor.
- Hvem som ser en tråd = hvem som allerede får varsler om den (ingen nytt medlemskapsbegrep).
- `*_message_reaction`-varsler teller **aldri** med i `lastMessage` eller `unreadCount` for en tråd, og telles heller ikke i Meldinger-badgen.
- `ProductionChat.tsx` har ingen åpen/lukket-tilstand — dyplenke betyr scroll-inn-i-syne + fokus, ikke "åpne".
- UI-tekst på norsk, følg eksisterende visuell stil (`lib/admin-theme.ts`s `C`-objekt, samme radmønster som dagens samtaleliste).
- Følg eksisterende navngivningsmønster for dyplenker (`?chat=1`, `?task=X&chat=1`).

## Review Focus

- En ren 1:1-DM (ingen `project_id`/`lead_id`/`email_discussion_project_id` på `conversations`-raden) må aldri dukke opp i Prosjekttråder, og en produksjon/lead/e-post-gruppesamtale må aldri dukke opp i Direkte-lista lenger — feil klassifisering her lekker enten private DM-er inn blant prosjekttråder eller skjuler en reell prosjekttråd blant DM-er.
- En tråd uten uleste varsler (alt lest) skal fortsatt vises i lista — Prosjekttråder er ikke en varselliste, det er en "finn tråden igjen"-liste.
- Siste aktivitet i en tråd der nyeste varsel er en `*_message_reaction` skal vise den forrige ekte meldingen som `lastMessage`, ikke reaksjons-emojien, og skal ikke øke `unreadCount`.
- Å markere én tråd som lest skal kun påvirke varsler for nøyaktig den tråd-nøkkelen (f.eks. ett `task_id`) — ikke andre tråder på samme prosjekt (f.eks. `project_message`-varsler for samme `project_id`).
- Tilbudschat-lenken peker alltid på prosjektets tilbudsside uten å skille mellom tilbudsversjoner — dette er en kjent, akseptert begrensning (samme som dagens `/admin/varsler`), ikke noe som skal "fikses" i denne planen.

---

### Task 1: Delt lenke-helper for tråd-navigasjon

**Files:**
- Create: `lib/notification-routing.ts`
- Modify: `app/admin/varsler/VarslerClient.tsx` (kun `navigateTo()`-funksjonens melding-tråd-grener, linje ~186–223)

**Interfaces:**
- Produces: `export type ThreadDescriptor` (discriminated union, se under) og `export function getThreadHref(d: ThreadDescriptor): string`, brukt av Task 2 og Task 4.

- [ ] **Step 1: Definer typen og funksjonen i `lib/notification-routing.ts`**

```ts
export type ThreadDescriptor =
  | { kind: 'project'; projectId: string }
  | { kind: 'task'; projectId: string; taskId: string; pipelineStage: 'pre_prod' | 'post_prod' | string | null }
  | { kind: 'preprod'; projectId: string }
  | { kind: 'quote'; projectId: string }
  | { kind: 'production'; projectId: string }
  | { kind: 'lead'; leadId: string }
  | { kind: 'email'; projectId: string }

export function getThreadHref(d: ThreadDescriptor): string
```

Returverdier (eksakt, hentet fra dagens `navigateTo()` + de tre nye grenene):
- `project` → `` `/admin/projects/${d.projectId}?chat=1` ``
- `task`, `pipelineStage === 'post_prod'` → `` `/admin/postprod/${d.projectId}?task=${d.taskId}&chat=1` ``
- `task`, `pipelineStage === 'pre_prod'` → `` `/admin/preprod/${d.projectId}?task=${d.taskId}` ``
- `task`, annet → `` `/admin/projects/${d.projectId}?task=${d.taskId}` ``
- `preprod` → `` `/admin/preprod/${d.projectId}?chat=1` ``
- `quote` → `` `/admin/projects/${d.projectId}/quote?chat=1` ``
- `production` (ny) → `` `/admin/produksjon/${d.projectId}?chat=1` ``
- `lead` (ny) → `` `/admin/leads/${d.leadId}?chat=1` ``
- `email` (ny) → `` `/admin/projects/${d.projectId}/email?chat=1` ``

- [ ] **Step 2: Erstatt de tilsvarende grenene i `VarslerClient.tsx`s `navigateTo()`**

Bytt ut `router.push(...)`-kallene for `project_message*`, `quote_message*`/`quote_mention`, `preprod_message*`/`preprod_mention`, og (kun task_id-present-grenen av) `task_message*` med `router.push(getThreadHref({...}))`, med felter bygget fra `n.project_id`/`n.task_id`/`n.tasks?.pipeline_stage`. La alle andre grener (`meeting_invite`, `gallery_review_*`, `board_comment_*`, `direct_message`/`conversation_message_mention` → `/admin/meldinger`, `task_message`-grenen uten `task_id`, osv.) stå helt uendret.

- [ ] **Step 3: Verifiser**

Kjør `npx tsc --noEmit` og `npm run lint`. Åpne `/admin/varsler` i dev-server og klikk gjennom et par varsler av typene som ble endret (project/task/preprod/quote-melding) — skal lande på nøyaktig samme URL som før endringen.

- [ ] **Step 4: Commit**

```bash
git add lib/notification-routing.ts app/admin/varsler/VarslerClient.tsx
git commit -m "Trekk ut delt tråd-lenke-helper fra varsler-siden"
```

---

### Task 2: `getProjectThreads()` — gruppering og klassifisering

**Files:**
- Create: `lib/actions/project-threads.ts`

**Interfaces:**
- Consumes: `getThreadHref`, `ThreadDescriptor` (Task 1).
- Produces:
```ts
export type ProjectThreadKind = 'project' | 'task' | 'preprod' | 'quote' | 'production' | 'lead' | 'email'
export type ProjectThreadListItem = {
  key: string                // f.eks. "task:<uuid>" — unik radnøkkel
  kind: ProjectThreadKind
  descriptor: ThreadDescriptor
  conversationId: string | null   // satt kun for kind 'production' | 'lead' | 'email'
  label: string
  href: string
  lastMessage: { preview: string; senderName: string; createdAt: string } | null
  unreadCount: number
}
export async function getProjectThreads(): Promise<ProjectThreadListItem[]>
export async function markProjectThreadRead(descriptor: ThreadDescriptor): Promise<void>
```
Brukes av Task 4 (UI). `markProjectThreadRead` håndterer kun `kind` i `project`/`task`/`preprod`/`quote` — for `production`/`lead`/`email` skal UI-laget i stedet kalle eksisterende `markConversationRead(conversationId)` fra `lib/actions/messages.ts` (samme mekanisme som Direkte-lista bruker i dag).

- [ ] **Step 1: Hent relevante varsler**

Spør `notifications` for innlogget bruker, `type IN (` de 10 ikke-reaksjon-typene: `project_message, project_message_mention, task_message, task_message_mention, preprod_message, preprod_mention, quote_message, quote_mention, direct_message, conversation_message_mention` `)`, `order by created_at desc, limit 300`, med samme joins som `getNotifications()` i `lib/actions/notifications.ts` bruker (`projects(title)`, `tasks(title, pipeline_stage)`). Ikke inkluder `*_reaction`-typer eller andre varseltyper (`task_assigned`, `lead_assigned`, osv.) — de er ikke trådaktivitet.

- [ ] **Step 2: Klassifiser samtale-baserte varsler**

Samle distincte `conversation_id` fra `direct_message`/`conversation_message_mention`-rader. Hent `conversations(id, project_id, lead_id, email_discussion_project_id)` for disse i ett kall. Bygg et lookup `conversationId → { kind: 'production' | 'lead' | 'email', id: string } | null` (null = ingen av de tre satt → ren DM, skal ikke bli en prosjekttråd).

- [ ] **Step 3: Grupper per tråd-nøkkel**

For hver varselrad, avled nøkkel:
- `project_message*` → `project:${project_id}`
- `task_message*` → `task:${task_id}`
- `preprod_message*`/`preprod_mention` → `preprod:${project_id}`
- `quote_message*`/`quote_mention` → `quote:${project_id}`
- `direct_message`/`conversation_message_mention` → slå opp klassifisering fra Step 2; `null` → hopp over raden (ikke en prosjekttråd); ellers `production:${id}` / `lead:${id}` / `email:${id}`

Siden radene er sortert nyeste-først, er første rad per nøkkel `lastMessage` (bygg `preview`/`senderName`/`createdAt` fra `message_preview`/`sender_name`/`created_at`). `unreadCount` = antall rader i gruppen med `read = false`. Bygg `label` fra joinet data (f.eks. prosjektittel for `project`/`preprod`/`quote`/`production`/`email`, `"${tasks.title} – ${projects.title}"` for `task`, leads-navn for `lead` — hent `leads(name)` i en egen liten query for de distincte lead-id-ene som dukker opp, samme mønster som `conversations`-oppslaget i Step 2). Bruk `getThreadHref` (Task 1) for `href`.

- [ ] **Step 4: Implementer `markProjectThreadRead`**

Oppdater `notifications` til `read = true` der `user_id = meg`, `read = false`, og — avhengig av `descriptor.kind`:
- `project` → `type IN ('project_message','project_message_mention') AND project_id = descriptor.projectId`
- `task` → `type IN ('task_message','task_message_mention') AND task_id = descriptor.taskId`
- `preprod` → `type IN ('preprod_message','preprod_mention') AND project_id = descriptor.projectId`
- `quote` → `type IN ('quote_message','quote_mention') AND project_id = descriptor.projectId`

(ingen håndtering for `production`/`lead`/`email` — kastes/no-op, UI-laget bruker `markConversationRead` for disse, se Interfaces).

- [ ] **Step 5: Verifiser**

`npx tsc --noEmit`. Kjør funksjonen manuelt (f.eks. et midlertidig debug-kall fra en server-side side, eller via `tsx`) mot en reell bruker med minst én tråd av hver type i dev/staging-databasen; bekreft at en ren DM-samtale **ikke** havner i resultatet, at `lastMessage` aldri viser en reaksjons-emoji, og at `unreadCount` matcher antall uleste rader i `notifications` for den tråden.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/project-threads.ts
git commit -m "Legg til getProjectThreads() for samlet prosjekttråd-liste i Meldinger"
```

---

### Task 3: Fjern gruppe-samtaler fra Direkte-lista

**Files:**
- Modify: `lib/actions/messages.ts` (`getConversations()`)

**Interfaces:**
- Consumes: ingen nye.
- Produces: `getConversations()` beholder sin eksisterende signatur og returtype — kun filtreringen endres.

- [ ] **Step 1: Filtrer bort klassifiserte samtaler**

I `getConversations()`, etter at `conversationIds` er hentet, slå opp `conversations(id, project_id, lead_id, email_discussion_project_id)` for disse (gjenbruk samme spørring som Task 2 Step 2, eller gjør en enkel egen — ikke del kode mellom filene for dette, det er to separate, små oppslag). Fjern enhver `conversationId` der én av de tre kolonnene er satt, før resten av funksjonen kjører videre som i dag.

- [ ] **Step 2: Verifiser**

`npx tsc --noEmit`. Åpne `/admin/meldinger` i dev-server med en bruker som har minst én produksjonschat/lead-chat/e-postdiskusjon fra før — bekreft at den nå er borte fra Direkte-lista, og at vanlige 1:1-DM-er fortsatt vises som før.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/messages.ts
git commit -m "Utelat produksjon/lead/e-post-gruppesamtaler fra Direkte-lista i Meldinger"
```

---

### Task 4: Prosjekttråder-fane i Meldinger

**Files:**
- Modify: `app/admin/meldinger/page.tsx`
- Modify: `app/admin/meldinger/MeldingerClient.tsx`

**Interfaces:**
- Consumes: `getProjectThreads`, `markProjectThreadRead`, `ProjectThreadListItem`, `ThreadDescriptor` (Task 2); `markConversationRead` (allerede eksisterende i `lib/actions/messages.ts`).
- Produces: ingen nye eksporter — ren UI-endring.

- [ ] **Step 1: Hent tråder server-side**

I `page.tsx`, kall `getProjectThreads()` parallelt med de eksisterende kallene og gi resultatet til `MeldingerClient` som ny prop `initialProjectThreads: ProjectThreadListItem[]`.

- [ ] **Step 2: Legg til fane-toggle i `MeldingerClient.tsx`**

Ny lokal state `view: 'direct' | 'threads'` (default `'direct'`). Toggle-knapper i samme stil som dagens "Siste 30 dager"-knapp, plassert over samtalelisten. Når `view === 'threads'`, render `initialProjectThreads` i stedet for `conversations` i venstre kolonne — samme radoppsett (ikon i stedet for avatar, `label` i stedet for deltakernavn, `lastMessage.preview`/`lastMessage.senderName`, `unreadCount`-badge).

- [ ] **Step 3: Klikk-håndtering**

`onClick` på en tråd-rad: hvis `item.conversationId` er satt, kall `markConversationRead(item.conversationId)`; ellers kall `markProjectThreadRead(item.descriptor)`. Deretter `router.push(item.href)` (krever `useRouter` fra `next/navigation` — importeres i filen hvis ikke allerede til stede). Oppdater lokal state optimistisk til `unreadCount: 0` for raden før navigering, samme mønster som `setConversations` gjør i dag for DM-er.

- [ ] **Step 4: Verifiser**

`npx tsc --noEmit`, `npm run lint`. I dev-server: bytt mellom fanene, bekreft at tråder med `unreadCount > 0` viser badge, at et klikk fjerner badgen og navigerer til riktig side, og at en tråd uten uleste varsler fortsatt er synlig i lista.

- [ ] **Step 5: Commit**

```bash
git add app/admin/meldinger/page.tsx app/admin/meldinger/MeldingerClient.tsx
git commit -m "Legg til Prosjekttråder-fane i Meldinger"
```

---

### Task 5: Utvid Meldinger-badgen i navigasjonen

**Files:**
- Modify: `components/admin/MeldingerBadge.tsx`

**Interfaces:**
- Consumes: ingen.
- Produces: ingen nye eksporter.

- [ ] **Step 1: Utvid type-listen på to steder**

I `fetchCount()`s `.in('type', [...])` og i `postgres_changes`-lytterens `if (type === ... )`-sjekk, legg til: `'project_message'`, `'project_message_mention'`, `'task_message'`, `'task_message_mention'`, `'preprod_message'`, `'preprod_mention'`, `'quote_message'`, `'quote_mention'` (samme liste begge steder — **ikke** `*_reaction`-variantene, jf. Global Constraints).

- [ ] **Step 2: Verifiser**

`npx tsc --noEmit`. Trigger en ny `task_message`-rad (f.eks. skriv i en postprod-oppgavechat fra en annen bruker/fane) og bekreft at Meldinger-badgen i navigasjonsmenyen øker i realtid, og igjen når tråden markeres lest via Task 4.

- [ ] **Step 3: Commit**

```bash
git add components/admin/MeldingerBadge.tsx
git commit -m "Tell uleste prosjekttråder i Meldinger-badgen"
```

---

### Task 6: Dyplenke til gruppe B — scroll og fokus i `ProductionChat`

**Files:**
- Modify: `components/production/ProductionChat.tsx`
- Modify: `app/admin/produksjon/[id]/page.tsx`
- Modify: `app/admin/leads/[id]/page.tsx`
- Modify: `app/admin/projects/[id]/email/page.tsx`

**Interfaces:**
- Consumes: ingen nye.
- Produces: `ProductionChat` får en ny valgfri prop `scrollToOnLoad?: boolean` (default `false`) — udokumentert utenfor denne komponenten, kun brukt av de tre sidene.

- [ ] **Step 1: Legg til scroll+fokus-adferd i `ProductionChat.tsx`**

Legg en `ref` på panelets rot-element og en `ref` på meldingsfeltet (`<textarea>`/`MentionTextInput`). Ny `useEffect(() => { if (scrollToOnLoad) { rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); inputRef.current?.focus() } }, [scrollToOnLoad])`. Ingen endring i `open`/lukket-logikk — komponenten har ingen slik state, jf. design-doc.

- [ ] **Step 2: Koble på `?chat=1` i de tre sidene**

I hver av de tre sidene, der `ProductionChat` allerede rendres: les `searchParams.get('chat') === '1'` (samme mønster som `forceOpenChat` i `app/admin/projects/[id]/page.tsx` m.fl.) og gi videre som `scrollToOnLoad={chatParam}`.

- [ ] **Step 3: Sjekk at worktree-kopien ikke er i aktivt bruk**

Kjør `git log -1 --format='%ad %s' --date=short` i `.claude/worktrees/produksjon-page-team-board-deliverables/` — forventet uendret siden 2026-09-08 (allerede bekreftet forlatt i design-doc). Hvis den har fått nye commits siden: stopp og avklar med Magnus før denne oppgaven rører `app/admin/produksjon/[id]/page.tsx`.

- [ ] **Step 4: Verifiser**

`npx tsc --noEmit`, `npm run lint`. I dev-server, åpne hver av de tre sidene med `?chat=1` i URL-en og bekreft at panelet scrolles inn i syne og meldingsfeltet får fokus; åpne uten parameteren og bekreft uendret oppførsel.

- [ ] **Step 5: Commit**

```bash
git add components/production/ProductionChat.tsx app/admin/produksjon/[id]/page.tsx app/admin/leads/[id]/page.tsx app/admin/projects/[id]/email/page.tsx
git commit -m "Dyplenke til produksjon/lead/e-post-chat via ?chat=1 (scroll + fokus)"
```
