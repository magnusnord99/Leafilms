# Post-produksjon-brett v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erstatt det hardkodede «Fordeling — Post-produksjon»-gridet og «Planlagt for post-produksjon»-skjemaet på pre-prod-siden med ett dynamisk brett: lanes drevet av faktiske `tasks`-rader, dra-og-slipp for å plassere/flytte oppgaver, egendefinerte lanes, en parallell-rad, multi-tildeling, farge/ikon per kort, og et gjenbrukbart oppgavebibliotek.

**Architecture:** `tasks`-tabellen får fire nye kolonner (`custom_lane_id`, `is_parallel`, `color`, `icon`) og en ny tabell `post_prod_lanes` for egendefinerte lanes. Et gjenbrukbart bibliotek lever i en helt ny, prosjekt-uavhengig tabell `post_prod_task_library`. Serverhandlinger i `lib/actions/pipeline.ts` gjenbruker eksisterende sekvenslogikk (`computeInsertionOrder`/`assignSortOrder` fra `lib/postprod-flow.ts`) og eksisterende tildelingsmekanikk (`task_assignees` via `toggleTaskAssignee`/`getAllProfiles`, `updateTaskDueDate`). Klientsiden er tre nye komponenter i `app/admin/preprod/[id]/` som erstatter `PostCrewSection` (fjernes fra `page.tsx`) og `PostProdFlowPlanner.tsx` (slettes) i sin helhet.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), `@dnd-kit/core` + ny avhengighet `@dnd-kit/sortable`, TypeScript strict.

## Global Constraints

- Migrasjonsfil får prefix `121_` (`ls supabase/migrations | tail` viser `120_daily_plan_items.sql` som siste før dette arbeidet — sjekk på nytt før du kjører migrasjonen i tilfelle noe annet har blitt lagt til i mellomtiden).
- RLS på nye tabeller følger mønsteret i `supabase/migrations/120_daily_plan_items.sql`: fire separate `authenticated`-policyer (select/insert/update/delete), alle `USING (true)`/`WITH CHECK (true)` — dette er et internt team-verktøy uten radnivå-tilgangsbegrensning i dag.
- Drag-and-drop endrer kun det aktuelle prosjektets `tasks`-rader — aldri `task_templates` (avklart med Magnus).
- Ingen automatisert testsuite i dette området (`package.json` har ingen `jest`/`vitest`). Verifisering er `npx tsc --noEmit`, targeted `eslint`, og manuell sjekk i dev-server mot et midlertidig testprosjekt.
- Norsk i UI-tekst og kommentarer, i tråd med resten av kodebasen.
- Server actions returnerer `{ ok: boolean; error?: string }`-mønsteret som brukes gjennomgående i `lib/actions/pipeline.ts` (unntak: rene GET-actions som returnerer data direkte med tomme fallbacks ved feil, som `getPostProdFlowOptions` gjorde).

---

## Fil-oversikt

**Nye filer:**
- `supabase/migrations/121_post_prod_board.sql`
- `app/admin/preprod/[id]/PostProdBoard.tsx` — hovedbrett: henting, lanes, kort, DnD, egendefinert-lane, parallell-rad, frist-auto-forslag.
- `app/admin/preprod/[id]/PostProdTaskForm.tsx` — «legg til oppgave»-skjema.
- `app/admin/preprod/[id]/PostProdLibraryPanel.tsx` — bibliotekspanel, dra-kilde.

**Endrede filer:**
- `lib/types.ts` — `Task`-typen får 4 nye felt.
- `lib/postprod-flow.ts` — ny ren funksjon `reorderExistingIds`.
- `lib/actions/pipeline.ts` — fjerner `getPostProdFlowOptions`/`addPlannedPostProdStep`/`PostProdFlowTrack`/`PlannedPostProdStep`, legger til `getPostProdBoard`, `addPostProdBoardTask`, `moveBoardTask`, `createCustomLane`, `updateLaneDeadline`, `addTaskToLibrary`, `getTaskLibrary`; herder `reseedPostProdTasks` mot custom-lane/parallell-rader.
- `lib/actions/preprod.ts` — fjerner `syncPostCrewToTask`, `PostProdTaskLite`, `post_crew`-feltet; legger til `postProdAssignedCount` på `getPreprodProjects`.
- `app/admin/preprod/[id]/page.tsx` — fjerner `PostCrewSection`/`POST_ROLES_*`/`resolveGroups`, kobler inn `PostProdBoard`, oppdaterer «Tildel oppgaver til teamet»-status-logikken.
- `app/admin/preprod/page.tsx` — bruker `postProdAssignedCount` i stedet for `preprod.post_crew.length`.
- `package.json` — ny avhengighet `@dnd-kit/sortable`.

**Slettede filer:**
- `app/admin/preprod/[id]/PostProdFlowPlanner.tsx`
- `lib/postprod-role-map.ts`

---

### Task 1: Legg til `@dnd-kit/sortable`

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `@dnd-kit/sortable` tilgjengelig for `SortableContext`, `useSortable`, `arrayMove` i senere tasks.

- [ ] **Step 1: Installer pakken**

```bash
npm install @dnd-kit/sortable
```

- [ ] **Step 2: Verifiser at den havnet i `package.json`**

```bash
grep '"@dnd-kit/sortable"' package.json
```

Expected: en linje med versjonsstrengen (f.eks. `"@dnd-kit/sortable": "^10.x.x"`), samme major-serie som er kompatibel med den allerede installerte `@dnd-kit/core@^6.3.1` (dnd-kit sin egen semver — installer bare siste versjon, `npm` løser kompatibiliteten).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: legg til @dnd-kit/sortable for post-produksjon-brettet"
```

---

### Task 2: Migrasjon `121_post_prod_board.sql`

**Files:**
- Create: `supabase/migrations/121_post_prod_board.sql`

**Interfaces:**
- Produces: kolonnene `tasks.custom_lane_id`, `tasks.is_parallel`, `tasks.color`, `tasks.icon`; tabellene `post_prod_lanes` og `post_prod_task_library` — brukt av alle senere server-action-tasks.

- [ ] **Step 1: Sjekk at 121 fortsatt er neste ledige nummer**

```bash
ls supabase/migrations | tail -5
```

Expected: siste fil er `120_daily_plan_items.sql` (eller høyere — juster filnavnet i Step 2 til `+1` av det du faktisk ser).

- [ ] **Step 2: Skriv migrasjonen**

```sql
-- 121_post_prod_board.sql
-- Post-produksjon-brett v2: dra-og-slipp, egendefinerte lanes, parallelle
-- oppgaver og et gjenbrukbart oppgavebibliotek. Se
-- docs/superpowers/specs/2026-07-22-post-prod-board-design.md.

CREATE TABLE IF NOT EXISTS post_prod_lanes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  color       TEXT,
  deadline    DATE,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_prod_lanes_project ON post_prod_lanes(project_id);

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS custom_lane_id UUID REFERENCES post_prod_lanes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_parallel    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS color          TEXT,
  ADD COLUMN IF NOT EXISTS icon           TEXT;

-- En oppgave er enten i video/foto-laen (sub_type), i en egendefinert lane
-- (custom_lane_id), eller parallell (is_parallel) — aldri flere samtidig.
ALTER TABLE tasks
  ADD CONSTRAINT tasks_lane_exclusive CHECK (
    (CASE WHEN sub_type IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN custom_lane_id IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN is_parallel THEN 1 ELSE 0 END) <= 1
  );

CREATE INDEX IF NOT EXISTS idx_tasks_custom_lane ON tasks(custom_lane_id) WHERE custom_lane_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS post_prod_task_library (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  title             TEXT        NOT NULL,
  description       TEXT,
  color             TEXT,
  icon              TEXT,
  lane_type         TEXT        NOT NULL CHECK (lane_type IN ('video','photo','custom','parallel')),
  custom_lane_name  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE post_prod_lanes IS 'Egendefinerte post-produksjon-lanes per prosjekt (utover innebygde Video/Foto), for post-produksjon-brettet på pre-prod-siden';
COMMENT ON TABLE post_prod_task_library IS 'Gjenbrukbart bibliotek av post-produksjon-oppgaver, prosjekt-uavhengig — mal for "legg til oppgave"-skjemaet';

ALTER TABLE post_prod_lanes ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_prod_task_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_post_prod_lanes"   ON post_prod_lanes;
DROP POLICY IF EXISTS "authenticated_insert_post_prod_lanes" ON post_prod_lanes;
DROP POLICY IF EXISTS "authenticated_update_post_prod_lanes" ON post_prod_lanes;
DROP POLICY IF EXISTS "authenticated_delete_post_prod_lanes" ON post_prod_lanes;

CREATE POLICY "authenticated_read_post_prod_lanes"
  ON post_prod_lanes FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_post_prod_lanes"
  ON post_prod_lanes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_post_prod_lanes"
  ON post_prod_lanes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_post_prod_lanes"
  ON post_prod_lanes FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_read_post_prod_task_library"   ON post_prod_task_library;
DROP POLICY IF EXISTS "authenticated_insert_post_prod_task_library" ON post_prod_task_library;
DROP POLICY IF EXISTS "authenticated_update_post_prod_task_library" ON post_prod_task_library;
DROP POLICY IF EXISTS "authenticated_delete_post_prod_task_library" ON post_prod_task_library;

CREATE POLICY "authenticated_read_post_prod_task_library"
  ON post_prod_task_library FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_insert_post_prod_task_library"
  ON post_prod_task_library FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated_update_post_prod_task_library"
  ON post_prod_task_library FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_delete_post_prod_task_library"
  ON post_prod_task_library FOR DELETE TO authenticated USING (true);
```

- [ ] **Step 3: Kjør migrasjonen mot Supabase**

Bruk samme fremgangsmåte som brukes for øvrige migrasjoner i dette prosjektet (Supabase CLI eller SQL-editor i Supabase-dashbordet — sjekk `README.md`/tidligere commit-historikk for `supabase/migrations/` hvis usikker på hvilken).

- [ ] **Step 4: Verifiser i Supabase at tabellene og kolonnene finnes**

Kjør i SQL-editoren:

```sql
select column_name from information_schema.columns where table_name = 'tasks' and column_name in ('custom_lane_id','is_parallel','color','icon');
select table_name from information_schema.tables where table_name in ('post_prod_lanes','post_prod_task_library');
```

Expected: 4 rader fra første spørring, 2 rader fra andre.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/121_post_prod_board.sql
git commit -m "feat: datamodell for post-produksjon-brett v2 (lanes, parallell, bibliotek)"
```

---

### Task 3: Utvid `Task`-typen

**Files:**
- Modify: `lib/types.ts:531-545` (feltene i `Task`-typen)

**Interfaces:**
- Consumes: ingen.
- Produces: `Task.customLaneId`, `Task.isParallel`, `Task.color`, `Task.icon` — brukt av `PostProdBoard.tsx`, `PostProdTaskForm.tsx`, og alle nye server actions som returnerer/mapper `tasks`-rader.

- [ ] **Step 1: Legg til feltene**

I `lib/types.ts`, i `Task`-typen (linje ~531), legg til de fire nye kolonnene rett under `sub_type`:

```typescript
export type Task = {
  id: string
  project_id: string
  pipeline_stage: PipelineStage
  title: string
  description: string | null
  notes: string | null
  task_data: Record<string, string> | null
  sub_type: 'video' | 'photo' | null
  custom_lane_id: string | null
  is_parallel: boolean
  color: string | null
  icon: string | null
  due_date: string | null
  status: 'todo' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high' | null
  sort_order: number
  is_custom: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  assignees: { id: string; name: string | null; email: string }[]
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: ingen nye feil relatert til `lib/types.ts` (eksisterende feil andre steder i kodebasen, hvis noen, er ikke din sak å fikse her).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: utvid Task-typen med lane/parallell/utseende-felt"
```

---

### Task 4: `reorderExistingIds` i `lib/postprod-flow.ts`

**Files:**
- Modify: `lib/postprod-flow.ts`

**Interfaces:**
- Consumes: ingen (ren funksjon, ingen avhengigheter).
- Produces: `reorderExistingIds(ids: string[], subjectId: string, beforeId: string | null): string[]` — brukt av `moveBoardTask` i Task 7 for å flytte en allerede lagret oppgave til ny posisjon (i motsetning til `computeInsertionOrder`, som setter inn en helt ny, ulagret rad).

- [ ] **Step 1: Legg til funksjonen**

Nederst i `lib/postprod-flow.ts`, etter `assignSortOrder`:

```typescript
/**
 * Flytter subjectId til rett før raden med id beforeId i en liste av
 * eksisterende, allerede lagrede id-er (i motsetning til
 * computeInsertionOrder, som setter inn en ny, ulagret rad). Hvis beforeId
 * er null, eller ikke finnes i listen, havner subjectId sist.
 */
export function reorderExistingIds(
  ids: string[],
  subjectId: string,
  beforeId: string | null
): string[] {
  const rest = ids.filter(id => id !== subjectId)
  const insertAt = beforeId === null
    ? rest.length
    : (() => {
        const idx = rest.indexOf(beforeId)
        return idx === -1 ? rest.length : idx
      })()

  return [...rest.slice(0, insertAt), subjectId, ...rest.slice(insertAt)]
}
```

- [ ] **Step 2: Verifiser manuelt med et engangsskript**

```bash
node -e "
const { reorderExistingIds } = require('./lib/postprod-flow.ts')
" 2>&1 | head -1
```

Dette feiler fordi `node` ikke forstår TypeScript direkte — bruk i stedet en rask `tsx`-sjekk (prosjektet har `next`/`typescript` installert, men ikke nødvendigvis `tsx` globalt). Skriv i stedet en midlertidig testfil og kjør den med `npx tsx`:

```bash
cat > /tmp/reorder-check.ts <<'EOF'
import { reorderExistingIds } from './lib/postprod-flow'

console.log(reorderExistingIds(['a', 'b', 'c'], 'a', 'c'))
// forventet: ['b', 'a', 'c']
console.log(reorderExistingIds(['a', 'b', 'c'], 'c', null))
// forventet: ['a', 'b', 'c']
console.log(reorderExistingIds(['a', 'b', 'c'], 'b', 'a'))
// forventet: ['b', 'a', 'c']
EOF
npx tsx /tmp/reorder-check.ts
rm /tmp/reorder-check.ts
```

Expected: de tre kommenterte forventede verdiene, i rekkefølge.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/postprod-flow.ts
git commit -m "feat: reorderExistingIds for å flytte lagrede post-prod-oppgaver"
```

---

### Task 5: `getPostProdBoard` — erstatt `getPostProdFlowOptions`

**Files:**
- Modify: `lib/actions/pipeline.ts:2072-2305` (fjern `PostProdFlowTrack`, `PlannedPostProdStep`, `StepperRow`, `getPostProdFlowOptions`, `addPlannedPostProdStep` — flyttes/erstattes av denne og Task 6)
- Modify: `lib/actions/pipeline.ts:464-591` (`reseedPostProdTasks` — herding mot custom-lane/parallell-rader)

**Interfaces:**
- Consumes: `computeInsertionOrder`, `assignSortOrder` (uendret, fra `lib/postprod-flow.ts`), `createClient` fra `@/lib/supabase-server`.
- Produces: `PostProdBoardCard`, `PostProdBoardLane`, `PostProdBoard`-typene og `getPostProdBoard(projectId: string): Promise<PostProdBoard>` — konsumeres av `PostProdBoard.tsx` (Task 13) og av `moveBoardTask`/`addPostProdBoardTask` sin forståelse av datastrukturen.

**Viktig funn fra research:** dagens `PostCrewSection` viser Video/Foto-lanene selv om post_prod-tasks ikke er seedet ennå (ved å falle tilbake til `task_templates`-titler). Det nye brettet trenger ekte task-id-er for å kunne tildele/farge/dra kort — derfor materialiserer `getPostProdBoard` nå de innebygde Video/Foto-lanene fra `task_templates` med én gang de er tomme, i stedet for å vise "preview-rader" uten id. Dette er en bevisst forenkling: brukeren ser nøyaktig samme steg med en gang uansett, men implementasjonen slipper en egen "ikke-interaktivt preview-kort"-tilstand i fire forskjellige mutasjons-handlinger.

- [ ] **Step 1: Fjern det gamle flow-options-blokken**

I `lib/actions/pipeline.ts`, slett hele blokken fra `export type PostProdFlowTrack = {` (linje 2072) til slutten av `addPlannedPostProdStep` (linje 2305) — denne erstattes av Step 2 og Task 6.

- [ ] **Step 2: Skriv `getPostProdBoard`**

Sett inn der den gamle blokken lå:

```typescript
export type PostProdBoardCard = {
  id: string
  title: string
  description: string | null
  color: string | null
  icon: string | null
  dueDate: string | null
  assignees: { id: string; name: string | null; email: string }[]
}

export type PostProdBoardLane = {
  kind: 'video' | 'photo' | 'custom'
  laneId: string | null
  name: string
  color: string | null
  deadline: string | null
  cards: PostProdBoardCard[]
}

export type PostProdBoard = {
  projectType: ProjectType | null
  lanes: PostProdBoardLane[]
  parallel: PostProdBoardCard[]
}

type BoardTaskRow = {
  id: string
  title: string
  description: string | null
  sub_type: 'video' | 'photo' | null
  custom_lane_id: string | null
  is_parallel: boolean
  color: string | null
  icon: string | null
  due_date: string | null
  task_assignees: { profile: { id: string; name: string | null; email: string } | null }[]
}

async function materializeDefaultLane(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  subType: 'video' | 'photo',
  templateProjectType: ProjectType
): Promise<void> {
  const { count } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('pipeline_stage', 'post_prod')
    .eq('sub_type', subType)
    .eq('is_parallel', false)
    .is('custom_lane_id', null)

  if ((count ?? 0) > 0) return

  const { data: templates } = await supabase
    .from('task_templates')
    .select('title, description')
    .eq('pipeline_stage', 'post_prod')
    .eq('project_type', templateProjectType)
    .order('sort_order', { ascending: true })

  if (!templates?.length) return

  await supabase.from('tasks').insert(
    templates.map((t: { title: string; description: string | null }, i: number) => ({
      project_id: projectId,
      pipeline_stage: 'post_prod',
      title: t.title,
      description: t.description,
      status: 'todo' as const,
      sort_order: i + 1,
      sub_type: subType,
      custom_lane_id: null,
      is_parallel: false,
      is_custom: false,
      created_by: null,
      due_date: null,
      priority: null,
    }))
  )
}

/**
 * Henter alt post-produksjon-brettet trenger: Video/Foto-lanes (materialisert
 * fra task_templates hvis de ikke er seedet ennå), prosjektets egendefinerte
 * lanes, og parallell-oppgaver — alt bygget fra ekte tasks-rader, ingen
 * hardkodede rollelister.
 */
export async function getPostProdBoard(projectId: string): Promise<PostProdBoard> {
  try {
    const supabase = await createClient()

    const { data: proj } = await supabase
      .from('projects')
      .select('project_type')
      .eq('id', projectId)
      .single()

    const projectType = (proj?.project_type ?? null) as ProjectType | null
    if (!projectType) return { projectType: null, lanes: [], parallel: [] }

    const subTypes: ('video' | 'photo')[] =
      projectType === 'photo' ? ['photo'] : projectType === 'mixed' ? ['video', 'photo'] : ['video']

    await Promise.all(
      subTypes.map(subType =>
        materializeDefaultLane(supabase, projectId, subType, projectType === 'mixed' ? subType : projectType)
      )
    )

    const [{ data: taskRows }, { data: laneRows }] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, description, sub_type, custom_lane_id, is_parallel, color, icon, due_date, task_assignees(profile:profiles(id, name, email))')
        .eq('project_id', projectId)
        .eq('pipeline_stage', 'post_prod')
        .eq('is_custom', false)
        .order('sort_order', { ascending: true }),
      supabase
        .from('post_prod_lanes')
        .select('id, name, color, deadline, sort_order')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true }),
    ])

    const rows = (taskRows ?? []) as BoardTaskRow[]

    const toCard = (t: BoardTaskRow): PostProdBoardCard => ({
      id: t.id,
      title: t.title,
      description: t.description,
      color: t.color,
      icon: t.icon,
      dueDate: t.due_date,
      assignees: (t.task_assignees ?? [])
        .map(ta => ta.profile)
        .filter((p): p is NonNullable<typeof p> => p !== null),
    })

    const parallel = rows.filter(t => t.is_parallel).map(toCard)

    const builtinLanes: PostProdBoardLane[] = subTypes.map(subType => ({
      kind: subType,
      laneId: null,
      name: subType === 'video' ? 'Video' : 'Foto',
      color: subType === 'video' ? '#C49434' : '#4A9EFF',
      deadline: null,
      cards: rows
        .filter(t => t.sub_type === subType && !t.is_parallel && !t.custom_lane_id)
        .map(toCard),
    }))

    const customLanes: PostProdBoardLane[] = (laneRows ?? []).map(
      (lane: { id: string; name: string; color: string | null; deadline: string | null }) => ({
        kind: 'custom' as const,
        laneId: lane.id,
        name: lane.name,
        color: lane.color,
        deadline: lane.deadline,
        cards: rows.filter(t => t.custom_lane_id === lane.id && !t.is_parallel).map(toCard),
      })
    )

    return { projectType, lanes: [...builtinLanes, ...customLanes], parallel }
  } catch (err) {
    console.error('getPostProdBoard error:', err)
    return { projectType: null, lanes: [], parallel: [] }
  }
}
```

Merk: video/foto-lanenes `deadline`-felt returneres alltid `null` herfra med vilje — den leveringsfristen bor fortsatt i `pipeline_data.preprod.post_deadlines` (uendret fra i dag, lest av `page.tsx` direkte). Kun egendefinerte lanes sin frist kommer fra `post_prod_lanes.deadline`. `PostProdBoard.tsx` (Task 13) slår sammen begge kildene ved rendering.

- [ ] **Step 3: Hard reseedPostProdTasks mot custom-lane/parallell-rader**

Dette er en reell bug som research avdekket: `reseedPostProdTasks` sin `preserved`-liste matcher bevarte rader kun på `sub_type`. For et **ikke-mixed** prosjekt itererer `subTypeTracks` over `[null]`, og siden nye custom-lane/parallell-oppgaver også har `sub_type = null`, ville de feilaktig blitt trukket inn i video/foto-malens sammenslåing og fått `sort_order` overskrevet ved neste «↺ Nullstill». Fiks:

I `lib/actions/pipeline.ts`, i `reseedPostProdTasks` (rundt linje 484), utvid select til å inkludere de nye kolonnene:

```typescript
const { data: existingTasks, error: existingError } = await supabase
  .from('tasks')
  .select('id, title, description, sub_type, custom_lane_id, is_parallel, created_by')
  .eq('project_id', projectId)
  .eq('pipeline_stage', 'post_prod')
  .order('sort_order', { ascending: true })
```

Og oppdater `preserved`-filteret (rundt linje 503) til å utelate custom-lane/parallell-rader helt — de skal aldri inn i video/foto-sammenslåingen, uansett prosjekttype:

```typescript
const preserved: (SequenceRow & { subType: 'video' | 'photo' | null })[] = (existingTasks ?? [])
  .filter((t: { created_by: string | null; custom_lane_id: string | null; is_parallel: boolean }) =>
    t.created_by !== null && !t.custom_lane_id && !t.is_parallel
  )
  .map((t: { id: string; title: string; description: string | null; sub_type: 'video' | 'photo' | null }) => ({
    id: t.id, title: t.title, description: t.description, origin: 'existing' as const, subType: t.sub_type,
  }))
```

`toDeleteIds` (rundt linje 499-501) trenger ingen endring — den filtrerer allerede kun på `created_by === null` (maloppgaver), og custom-lane/parallell-rader er alltid menneske-opprettet.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: ingen feil i `lib/actions/pipeline.ts`. Feil om at `PostProdFlowTrack`/`PlannedPostProdStep`/`addPlannedPostProdStep`/`getPostProdFlowOptions` mangler er forventet her — de fikses i Task 12 når importene i `page.tsx` og `PostProdFlowPlanner.tsx` oppdateres/fjernes. Ignorer disse for nå.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: getPostProdBoard erstatter getPostProdFlowOptions, herder reseed mot custom/parallell"
```

---

### Task 6: `addPostProdBoardTask`

**Files:**
- Modify: `lib/actions/pipeline.ts` (legg til rett etter `getPostProdBoard`)

**Interfaces:**
- Consumes: `PostProdBoardCard`/`PostProdBoard` (Task 5), `SequenceRow`/`computeInsertionOrder`/`assignSortOrder` (uendret).
- Produces: `PostProdDestination`-typen og `addPostProdBoardTask(input): Promise<{ ok: boolean; error?: string; taskId?: string }>` — konsumeres av `PostProdTaskForm.tsx` (Task 12) og `PostProdLibraryPanel.tsx` (Task 15, når man drar inn et bibliotekselement).

- [ ] **Step 1: Skriv funksjonen**

```typescript
export type PostProdDestination =
  | { kind: 'video' }
  | { kind: 'photo' }
  | { kind: 'custom'; laneId: string }
  | { kind: 'parallel' }

/**
 * Legger til en ny post-prod-oppgave: i Video/Foto-sekvensen (samme
 * innsettingslogikk som addPlannedPostProdStep hadde), i en egendefinert
 * lanes egen sekvens, eller i parallell-raden (ingen sekvens der).
 */
export async function addPostProdBoardTask(input: {
  projectId: string
  title: string
  description?: string
  assigneeId?: string
  color?: string
  icon?: string
  destination: PostProdDestination
  insertBeforeTaskId?: string | null
  isReusable?: boolean
}): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    let newTaskId: string

    if (input.destination.kind === 'parallel') {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          project_id: input.projectId,
          pipeline_stage: 'post_prod',
          title: input.title,
          description: input.description ?? null,
          status: 'todo' as const,
          sort_order: 0,
          sub_type: null,
          custom_lane_id: null,
          is_parallel: true,
          color: input.color ?? null,
          icon: input.icon ?? null,
          is_custom: false,
          created_by: user.id,
          due_date: null,
          priority: null,
        })
        .select('id')
        .single()

      if (error || !data) return { ok: false, error: 'Kunne ikke opprette oppgaven' }
      newTaskId = data.id
    } else {
      const subType = input.destination.kind === 'custom' ? null : input.destination.kind
      const customLaneId = input.destination.kind === 'custom' ? input.destination.laneId : null

      let existingQuery = supabase
        .from('tasks')
        .select('id, title, description')
        .eq('project_id', input.projectId)
        .eq('pipeline_stage', 'post_prod')
        .eq('is_custom', false)
        .eq('is_parallel', false)
        .order('sort_order', { ascending: true })

      existingQuery = input.destination.kind === 'custom'
        ? existingQuery.eq('custom_lane_id', customLaneId as string)
        : existingQuery.eq('sub_type', subType as string).is('custom_lane_id', null)

      const { data: existingRows, error: existingError } = await existingQuery
      if (existingError) return { ok: false, error: 'Kunne ikke hente eksisterende steg' }

      const currentSequence: SequenceRow[] = (existingRows ?? []).map(
        (r: { id: string; title: string; description: string | null }) => ({
          id: r.id, title: r.title, description: r.description, origin: 'existing' as const,
        })
      )

      const insertBeforeTitle = input.insertBeforeTaskId
        ? currentSequence.find(r => r.id === input.insertBeforeTaskId)?.title ?? null
        : null

      const newStep: SequenceRow = { id: null, title: input.title, description: input.description ?? null, origin: 'new' }
      const merged = assignSortOrder(computeInsertionOrder(currentSequence, newStep, insertBeforeTitle))

      newTaskId = ''
      for (const row of merged) {
        if (row.origin === 'existing') {
          const { error } = await supabase.from('tasks').update({ sort_order: row.sortOrder }).eq('id', row.id as string)
          if (error) return { ok: false, error: 'Kunne ikke oppdatere rekkefølgen' }
        } else {
          const { data, error } = await supabase
            .from('tasks')
            .insert({
              project_id: input.projectId,
              pipeline_stage: 'post_prod',
              title: row.title,
              description: row.description,
              status: 'todo' as const,
              sort_order: row.sortOrder,
              sub_type: subType,
              custom_lane_id: customLaneId,
              is_parallel: false,
              color: input.color ?? null,
              icon: input.icon ?? null,
              is_custom: false,
              created_by: user.id,
              due_date: null,
              priority: null,
            })
            .select('id')
            .single()

          if (error || !data) return { ok: false, error: 'Kunne ikke opprette steget' }
          newTaskId = data.id
        }
      }
    }

    if (input.assigneeId) {
      await supabase.from('task_assignees').insert({ task_id: newTaskId, profile_id: input.assigneeId })
    }

    if (input.isReusable) {
      let customLaneName: string | null = null
      if (input.destination.kind === 'custom') {
        const { data: lane } = await supabase
          .from('post_prod_lanes')
          .select('name')
          .eq('id', input.destination.laneId)
          .single()
        customLaneName = lane?.name ?? null
      }

      await supabase.from('post_prod_task_library').insert({
        created_by: user.id,
        title: input.title,
        description: input.description ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        lane_type: input.destination.kind,
        custom_lane_name: customLaneName,
      })
    }

    revalidatePath('/admin/preprod')
    revalidatePath('/admin/postprod')
    revalidatePath('/admin/pipeline')
    revalidatePath('/admin/projects')

    return { ok: true, taskId: newTaskId }
  } catch (err) {
    console.error('addPostProdBoardTask unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: addPostProdBoardTask med lane/parallell/tildeling/bibliotek-støtte"
```

---

### Task 7: `moveBoardTask`

**Files:**
- Modify: `lib/actions/pipeline.ts` (legg til rett etter `addPostProdBoardTask`)

**Interfaces:**
- Consumes: `reorderExistingIds` (Task 4), `PostProdDestination` (Task 6).
- Produces: `moveBoardTask(taskId, destination, beforeTaskId): Promise<{ ok: boolean; error?: string }>` — konsumeres av dra-og-slipp-logikken i `PostProdBoard.tsx` (Task 14).

- [ ] **Step 1: Skriv funksjonen**

```typescript
import { reorderExistingIds } from '@/lib/postprod-flow'
```

(legg til i den eksisterende importen fra `@/lib/postprod-flow` på linje 9, ikke som en ny import-linje)

```typescript
/**
 * Flytter en eksisterende post-prod-oppgave: omplassering innad i samme
 * lane, eller til en annen lane/parallell-raden. I motsetning til
 * addPostProdBoardTask jobber denne på allerede lagrede rader, derfor
 * reorderExistingIds (id-basert) i stedet for computeInsertionOrder
 * (tittel-basert, for ulagrede rader).
 */
export async function moveBoardTask(
  taskId: string,
  destination: PostProdDestination,
  beforeTaskId: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, project_id')
      .eq('id', taskId)
      .single()

    if (taskError || !task) return { ok: false, error: 'Fant ikke oppgaven' }

    if (destination.kind === 'parallel') {
      const { error } = await supabase
        .from('tasks')
        .update({ is_parallel: true, sub_type: null, custom_lane_id: null, sort_order: 0 })
        .eq('id', taskId)

      if (error) return { ok: false, error: 'Kunne ikke flytte oppgaven' }
      revalidatePath('/admin/preprod')
      revalidatePath('/admin/postprod')
      return { ok: true }
    }

    let destQuery = supabase
      .from('tasks')
      .select('id')
      .eq('project_id', task.project_id)
      .eq('pipeline_stage', 'post_prod')
      .eq('is_custom', false)
      .eq('is_parallel', false)
      .order('sort_order', { ascending: true })

    destQuery = destination.kind === 'custom'
      ? destQuery.eq('custom_lane_id', destination.laneId)
      : destQuery.eq('sub_type', destination.kind).is('custom_lane_id', null)

    const { data: destRows, error: destError } = await destQuery
    if (destError) return { ok: false, error: 'Kunne ikke hente mållanen' }

    const destIds = (destRows ?? []).map((r: { id: string }) => r.id)
    const idsIncludingSubject = destIds.includes(taskId) ? destIds : [...destIds, taskId]
    const finalIds = reorderExistingIds(idsIncludingSubject, taskId, beforeTaskId)

    // Kilde-lanen (hvis annerledes) trenger ingen renummerering — gap i
    // sort_order er harmløst siden ordering alltid leses med ORDER BY.
    for (let i = 0; i < finalIds.length; i++) {
      const patch: Record<string, unknown> = { sort_order: i + 1 }
      if (finalIds[i] === taskId) {
        patch.is_parallel = false
        patch.custom_lane_id = destination.kind === 'custom' ? destination.laneId : null
        patch.sub_type = destination.kind === 'custom' ? null : destination.kind
      }
      const { error } = await supabase.from('tasks').update(patch).eq('id', finalIds[i])
      if (error) return { ok: false, error: 'Kunne ikke oppdatere rekkefølgen' }
    }

    revalidatePath('/admin/preprod')
    revalidatePath('/admin/postprod')
    return { ok: true }
  } catch (err) {
    console.error('moveBoardTask unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: moveBoardTask for dra-og-slipp mellom og innad i lanes"
```

---

### Task 8: `createCustomLane` og `updateLaneDeadline`

**Files:**
- Modify: `lib/actions/pipeline.ts` (legg til rett etter `moveBoardTask`)

**Interfaces:**
- Produces: `createCustomLane(projectId, name, color?): Promise<{ ok: boolean; error?: string; laneId?: string }>`, `updateLaneDeadline(laneId, deadline): Promise<void>` — konsumeres av `PostProdBoard.tsx` (Task 13/14).

- [ ] **Step 1: Skriv funksjonene**

```typescript
export async function createCustomLane(
  projectId: string,
  name: string,
  color?: string
): Promise<{ ok: boolean; error?: string; laneId?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'Lane trenger et navn' }

    const { count } = await supabase
      .from('post_prod_lanes')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)

    const { data, error } = await supabase
      .from('post_prod_lanes')
      .insert({
        project_id: projectId,
        name: trimmed,
        color: color ?? null,
        sort_order: count ?? 0,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: 'Kunne ikke opprette lane' }

    revalidatePath('/admin/preprod')
    return { ok: true, laneId: data.id }
  } catch (err) {
    console.error('createCustomLane unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function updateLaneDeadline(laneId: string, deadline: string | null): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('post_prod_lanes').update({ deadline }).eq('id', laneId)
    revalidatePath('/admin/preprod')
  } catch (err) {
    console.error('updateLaneDeadline unexpected error:', err)
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: createCustomLane og updateLaneDeadline"
```

---

### Task 9: `addTaskToLibrary` og `getTaskLibrary`

**Files:**
- Modify: `lib/actions/pipeline.ts` (legg til rett etter `updateLaneDeadline`)

**Interfaces:**
- Produces: `PostProdLibraryItem`-typen, `getTaskLibrary(): Promise<PostProdLibraryItem[]>`, `addTaskToLibrary(taskId): Promise<{ ok: boolean; error?: string }>` — konsumeres av `PostProdLibraryPanel.tsx` (Task 15) og et «Lagre i bibliotek»-valg på eksisterende kort i `PostProdBoard.tsx` (Task 13).

- [ ] **Step 1: Skriv funksjonene**

```typescript
export type PostProdLibraryItem = {
  id: string
  title: string
  description: string | null
  color: string | null
  icon: string | null
  laneType: 'video' | 'photo' | 'custom' | 'parallel'
  customLaneName: string | null
}

export async function getTaskLibrary(): Promise<PostProdLibraryItem[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('post_prod_task_library')
      .select('id, title, description, color, icon, lane_type, custom_lane_name')
      .order('created_at', { ascending: false })

    return (data ?? []).map(
      (r: { id: string; title: string; description: string | null; color: string | null; icon: string | null; lane_type: 'video' | 'photo' | 'custom' | 'parallel'; custom_lane_name: string | null }) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        color: r.color,
        icon: r.icon,
        laneType: r.lane_type,
        customLaneName: r.custom_lane_name,
      })
    )
  } catch (err) {
    console.error('getTaskLibrary error:', err)
    return []
  }
}

/** Lagrer en allerede eksisterende oppgave i biblioteket (kopi av felter, ingen videre kobling). */
export async function addTaskToLibrary(taskId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('title, description, color, icon, sub_type, custom_lane_id, is_parallel')
      .eq('id', taskId)
      .single()

    if (taskError || !task) return { ok: false, error: 'Fant ikke oppgaven' }

    let laneType: 'video' | 'photo' | 'custom' | 'parallel'
    let customLaneName: string | null = null

    if (task.is_parallel) {
      laneType = 'parallel'
    } else if (task.custom_lane_id) {
      laneType = 'custom'
      const { data: lane } = await supabase.from('post_prod_lanes').select('name').eq('id', task.custom_lane_id).single()
      customLaneName = lane?.name ?? null
    } else {
      laneType = task.sub_type === 'photo' ? 'photo' : 'video'
    }

    const { error } = await supabase.from('post_prod_task_library').insert({
      created_by: user.id,
      title: task.title,
      description: task.description,
      color: task.color,
      icon: task.icon,
      lane_type: laneType,
      custom_lane_name: customLaneName,
    })

    if (error) return { ok: false, error: 'Kunne ikke lagre i biblioteket' }
    return { ok: true }
  } catch (err) {
    console.error('addTaskToLibrary unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: ingen feil i `lib/actions/pipeline.ts` selv (feil i `page.tsx`/`PostProdFlowPlanner.tsx` pga. fjernede exports er fortsatt forventet og fikses i Task 12).

- [ ] **Step 3: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: post-prod-oppgavebibliotek (addTaskToLibrary, getTaskLibrary)"
```

---

### Task 10: `getPreprodProjects` — `postProdAssignedCount` erstatter `post_crew`

**Files:**
- Modify: `lib/actions/preprod.ts`

**Interfaces:**
- Consumes: ingen nye.
- Produces: `PreprodProject.postProdAssignedCount: number` — konsumeres av `app/admin/preprod/page.tsx` (Task 11). Fjerner `post_crew`-feltet fra `PreprodData`, `syncPostCrewToTask`, `PostProdTaskLite`-typen og `postProdTasks`-feltet fra `PreprodDetail`.

**Viktig funn fra research:** dagens «X tildelt»-tall på pre-prod-listen (`app/admin/preprod/page.tsx:36`) er `project.preprod.post_crew.length` — antall rollenøkler som er tildelt i det hardkodede Fordeling-gridet. Siden `post_crew` forsvinner med `PostCrewSection`, erstattes tallet med antall post-prod-oppgaver som faktisk har minst én reell tildeling i `task_assignees` — nærmeste reelle ekvivalent.

- [ ] **Step 1: Fjern `post_crew` fra `PreprodData` og `DEFAULT_PREPROD`**

I `lib/actions/preprod.ts` (rundt linje 25-42):

```typescript
export type PreprodData = {
  millanote_url: string
  millanote_done: boolean
  prod_crew: PreprodCrewMember[]
  packing_list: PackingItem[]
  post_deadlines: { video: string | null; photo: string | null }
}

const DEFAULT_PREPROD: PreprodData = {
  millanote_url: '',
  millanote_done: false,
  prod_crew: [],
  packing_list: [],
  post_deadlines: { video: null, photo: null },
}
```

(`post_crew: PreprodCrewMember[]` fjernet fra begge.)

- [ ] **Step 2: Fjern `PostProdTaskLite` og `postProdTasks` fra `getPreprodDetail`**

Fjern typen `PostProdTaskLite` (rundt linje 44-49), fjern `postProdTasks: PostProdTaskLite[]` fra `PreprodDetail`-typen (linje 104), fjern spørringen mot `tasks` for `postProdTasks` (rundt linje 127-131) og fjern `postProdTasks: (postProdTasks ?? []) as PostProdTaskLite[],` fra retur-objektet (linje 173).

- [ ] **Step 3: Fjern `syncPostCrewToTask`**

Slett hele `syncPostCrewToTask`-funksjonen (rundt linje 312-356) — den er kun brukt av `PostCrewSection`, som fjernes i Task 16.

- [ ] **Step 4: Legg til `postProdAssignedCount` i `getPreprodProjects`**

I `getPreprodProjects` (rundt linje 57-99), legg til en ny spørring rett etter `tasks`-spørringen som allerede finnes:

```typescript
const { data: postProdRows } = await supabase
  .from('tasks')
  .select('project_id, task_assignees(profile_id)')
  .in('project_id', ids)
  .eq('pipeline_stage', 'post_prod')
  .eq('is_custom', false)

const assignedCountMap: Record<string, number> = {}
for (const t of postProdRows ?? []) {
  if ((t.task_assignees ?? []).length > 0) {
    assignedCountMap[t.project_id] = (assignedCountMap[t.project_id] ?? 0) + 1
  }
}
```

Og legg til feltet i `return data.map(...)`-blokken:

```typescript
return data.map((row: ProjectRow) => {
  const pd = (row.pipeline_data as PipelineData) ?? {}
  return {
    ...row,
    customer: row.customers ?? null,
    customers: undefined,
    task_count: taskMap[row.id]?.total ?? 0,
    done_count: taskMap[row.id]?.done ?? 0,
    postProdAssignedCount: assignedCountMap[row.id] ?? 0,
    preprod: { ...DEFAULT_PREPROD, ...(pd.preprod ?? {}) },
  }
}) as PreprodProject[]
```

Og legg `postProdAssignedCount: number` til `PreprodProject`-typen (der `task_count`/`done_count` allerede er definert).

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit
```

Expected: feil i `app/admin/preprod/page.tsx` (bruker `post_crew`) og `app/admin/preprod/[id]/page.tsx` (bruker `syncPostCrewToTask`, `PostProdTaskLite`) er forventet her — fikses i Task 11 og Task 16.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/preprod.ts
git commit -m "feat: postProdAssignedCount erstatter post_crew-telling i preprod-listen"
```

---

### Task 11: Oppdater `app/admin/preprod/page.tsx`

**Files:**
- Modify: `app/admin/preprod/page.tsx:36`

**Interfaces:**
- Consumes: `PreprodProject.postProdAssignedCount` (Task 10).

- [ ] **Step 1: Bytt ut `post_crew.length`**

Finn linjen (rundt linje 36):

```typescript
const postCrew = project.preprod.post_crew.length
```

Erstatt med:

```typescript
const postCrew = project.postProdAssignedCount
```

(variabelnavnet `postCrew` beholdes siden det brukes videre i samme funksjon/JSX til visningsteksten — kun kilden endres.)

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: ingen feil relatert til `app/admin/preprod/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/admin/preprod/page.tsx
git commit -m "fix: preprod-listen bruker postProdAssignedCount i stedet for post_crew"
```

---

### Task 12: `PostProdTaskForm.tsx`

**Files:**
- Create: `app/admin/preprod/[id]/PostProdTaskForm.tsx`

**Interfaces:**
- Consumes: `addPostProdBoardTask`, `PostProdDestination` (Task 6), `getAllProfiles` (eksisterende, `lib/actions/pipeline.ts:1252`), `PostProdBoard`/`PostProdBoardLane` (Task 5).
- Produces: `PostProdTaskForm`-komponenten — konsumeres av `PostProdBoard.tsx` (Task 13).

- [ ] **Step 1: Skriv komponenten**

```typescript
// app/admin/preprod/[id]/PostProdTaskForm.tsx
'use client'

import { useState } from 'react'
import { addPostProdBoardTask, type PostProdDestination } from '@/lib/actions/pipeline'
import type { PostProdBoardLane } from '@/lib/actions/pipeline'

const C = {
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
}

const ICONS = ['🎬', '🎨', '✂️', '🔊', '✨', '📸', '📁', '⭐']

type DestinationOption = { key: string; label: string; destination: PostProdDestination }

export function PostProdTaskForm({
  projectId, lanes, profiles, onAdded,
}: {
  projectId: string
  lanes: PostProdBoardLane[]
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
  onAdded: () => void
}) {
  const options: DestinationOption[] = [
    ...lanes.map(lane => ({
      key: lane.laneId ?? lane.kind,
      label: lane.name,
      destination: (lane.kind === 'custom'
        ? { kind: 'custom' as const, laneId: lane.laneId as string }
        : { kind: lane.kind as 'video' | 'photo' }),
    })),
    { key: 'parallel', label: 'Parallell (hele post-produksjonen)', destination: { kind: 'parallel' as const } },
  ]

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [destinationKey, setDestinationKey] = useState(options[0]?.key ?? 'parallel')
  const [assigneeId, setAssigneeId] = useState('')
  const [color, setColor] = useState('#7C5CFC')
  const [icon, setIcon] = useState(ICONS[0])
  const [isReusable, setIsReusable] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    const trimmed = title.trim()
    if (!trimmed || saving) return
    const destination = options.find(o => o.key === destinationKey)?.destination
    if (!destination) return

    setSaving(true)
    const result = await addPostProdBoardTask({
      projectId,
      title: trimmed,
      description: description.trim() || undefined,
      assigneeId: assigneeId || undefined,
      color,
      icon,
      destination,
      isReusable,
    })
    if (result.ok) {
      setTitle('')
      setDescription('')
      setAssigneeId('')
      setIsReusable(false)
      onAdded()
    }
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <select
        value={destinationKey}
        onChange={e => setDestinationKey(e.target.value)}
        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px' }}
      >
        {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Navn på oppgave, f.eks. VFX"
        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', outline: 'none' }}
      />
      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Beskrivelse (valgfritt)"
        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', outline: 'none' }}
      />

      <select
        value={assigneeId}
        onChange={e => setAssigneeId(e.target.value)}
        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px' }}
      >
        <option value="">Ikke tildelt ennå</option>
        {profiles.map(p => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}
      </select>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 32, height: 28, border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', padding: 0 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {ICONS.map(i => (
            <button
              key={i}
              onClick={() => setIcon(i)}
              style={{ fontSize: '0.9rem', padding: '3px 6px', borderRadius: 5, cursor: 'pointer', background: icon === i ? C.accentBg : 'transparent', border: `1px solid ${icon === i ? 'rgba(124,92,252,0.3)' : C.border}` }}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, cursor: 'pointer' }}>
        <input type="checkbox" checked={isReusable} onChange={e => setIsReusable(e.target.checked)} />
        Gjenbrukbar oppgave (lagres i biblioteket)
      </label>

      <button
        onClick={handleAdd}
        disabled={!title.trim() || saving}
        style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, padding: '7px 12px', borderRadius: 6,
          cursor: title.trim() ? 'pointer' : 'not-allowed',
          background: title.trim() ? C.accentBg : 'transparent',
          color: title.trim() ? C.accent : C.text3,
          border: `1px solid ${title.trim() ? 'rgba(124,92,252,0.25)' : C.border}`,
          opacity: saving ? 0.6 : 1,
        }}
      >
        + Legg til i post-produksjon
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: ingen nye feil fra denne filen (feil fra `getPostProdBoard`/`PostProdBoardLane` mangler i andre filer er ikke relevant her).

- [ ] **Step 3: Commit**

```bash
git add app/admin/preprod/[id]/PostProdTaskForm.tsx
git commit -m "feat: PostProdTaskForm — legg til oppgave med lane/tildeling/utseende/bibliotek"
```

---

### Task 13: `PostProdBoard.tsx` — statisk rendering (uten DnD)

**Files:**
- Create: `app/admin/preprod/[id]/PostProdBoard.tsx`

**Interfaces:**
- Consumes: `getPostProdBoard`, `addTaskToLibrary`, `deleteTask` (eksisterende), `toggleTaskAssignee` (eksisterende, `lib/actions/pipeline.ts:1274`), `getAllProfiles` (eksisterende), `updateTaskDueDate` (eksisterende, `lib/actions/calendar.ts`), `updateLaneDeadline`, `createCustomLane` (Task 8), `PostProdTaskForm` (Task 12).
- Produces: `PostProdBoard`-komponenten (default export) — konsumeres av `page.tsx` (Task 16). Eksporterer også `PostProdBoardHandle`-mønsteret er IKKE nødvendig; komponenten er selvstendig og henter sin egen data via `useEffect`, akkurat som `PostCrewSection`/`PostProdFlowPlanner` gjorde.

Denne tasken bygger kort/lanes/parallell-rad/tildeling/frist UTEN dra-og-slipp — DnD legges til i Task 14 oppå dette. Grunnen til å dele opp: drag-and-drop-wiring er lettere å verifisere riktig når den statiske renderingen allerede virker.

- [ ] **Step 1: Skriv grunnstrukturen**

```typescript
// app/admin/preprod/[id]/PostProdBoard.tsx
'use client'

import { useEffect, useState } from 'react'
import {
  getPostProdBoard, addTaskToLibrary, deleteTask, toggleTaskAssignee, getAllProfiles,
  createCustomLane, updateLaneDeadline,
  type PostProdBoard as PostProdBoardData, type PostProdBoardCard, type PostProdBoardLane,
} from '@/lib/actions/pipeline'
import { updateTaskDueDate } from '@/lib/actions/calendar'
import { getAvatarColor } from '@/lib/avatar-colors'
import { PostProdTaskForm } from './PostProdTaskForm'

const C = {
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
  danger:   '#E05555',
}

function Avatar({ id, name, size = 20 }: { id: string; name: string | null; size?: number }) {
  const initials = (name ?? 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const color = getAvatarColor({ id, color: null })
  return (
    <div title={name ?? 'Ukjent'} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-dm-sans)', fontSize: size * 0.4, fontWeight: 700, color: '#fff',
    }}>
      {initials}
    </div>
  )
}

export function PostProdBoard({
  projectId, shootEnd, postDeadlines, onDeadlineChange,
}: {
  projectId: string
  shootEnd: string | null
  postDeadlines: { video: string | null; photo: string | null }
  onDeadlineChange: (subType: 'video' | 'photo', date: string | null) => void
}) {
  const [board, setBoard] = useState<PostProdBoardData>({ projectType: null, lanes: [], parallel: [] })
  const [profiles, setProfiles] = useState<{ id: string; name: string | null; email: string; color: string | null }[]>([])
  const [openAssigneeFor, setOpenAssigneeFor] = useState<string | null>(null)
  const [newLaneName, setNewLaneName] = useState('')

  async function refetch() {
    const data = await getPostProdBoard(projectId)
    setBoard(data)
  }

  useEffect(() => {
    refetch()
    getAllProfiles().then(setProfiles)
  }, [projectId])

  async function handleToggleAssignee(taskId: string, profileId: string) {
    await toggleTaskAssignee(taskId, profileId)
    refetch()
  }

  async function handleDueDate(taskId: string, date: string | null) {
    await updateTaskDueDate(taskId, date)
    refetch()
  }

  async function handleDelete(taskId: string) {
    await deleteTask(taskId)
    refetch()
  }

  async function handleSaveToLibrary(taskId: string) {
    await addTaskToLibrary(taskId)
  }

  async function handleCreateLane() {
    const trimmed = newLaneName.trim()
    if (!trimmed) return
    setNewLaneName('')
    await createCustomLane(projectId, trimmed)
    refetch()
  }

  function laneDeadlineValue(lane: PostProdBoardLane): string {
    if (lane.kind === 'video') return postDeadlines.video ?? ''
    if (lane.kind === 'photo') return postDeadlines.photo ?? ''
    return lane.deadline ?? ''
  }

  // Foreslår frister bakover fra shootEnd til lane.deadline, jevnt fordelt
  // over kortene, uten å overskrive kort som allerede har en manuelt satt
  // due_date. Samme algoritme som PostCrewSection hadde, portert hit.
  async function suggestDueDates(lane: PostProdBoardLane, deadline: string) {
    if (!deadline) return
    const start = shootEnd ? new Date(shootEnd) : new Date()
    const end = new Date(deadline)
    const totalMs = Math.max(end.getTime() - start.getTime(), 0)
    const n = lane.cards.length
    if (n === 0) return
    await Promise.all(lane.cards.map((card, i) => {
      if (card.dueDate) return Promise.resolve()
      const suggested = new Date(start.getTime() + totalMs * ((i + 1) / n)).toISOString().slice(0, 10)
      return updateTaskDueDate(card.id, suggested)
    }))
    refetch()
  }

  function handleLaneDeadlineChange(lane: PostProdBoardLane, value: string) {
    const date = value || null
    if (lane.kind === 'video' || lane.kind === 'photo') {
      onDeadlineChange(lane.kind, date)
    } else if (lane.laneId) {
      updateLaneDeadline(lane.laneId, date)
    }
    if (date) suggestDueDates(lane, date)
  }

  function renderCard(card: PostProdBoardCard) {
    const isOpen = openAssigneeFor === card.id
    return (
      <div key={card.id} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 7,
        background: C.surface2, border: `1px solid ${card.color ?? C.border}`, position: 'relative',
      }}>
        {card.icon && <span style={{ fontSize: '0.85rem' }}>{card.icon}</span>}
        <span style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text }}>{card.title}</span>
        <input
          type="date"
          value={card.dueDate ?? ''}
          onChange={e => handleDueDate(card.id, e.target.value || null)}
          title="Frist"
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: card.dueDate ? C.text2 : C.text3, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 5px', outline: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {card.assignees.map(a => <Avatar key={a.id} id={a.id} name={a.name} />)}
        </div>
        <button onClick={() => setOpenAssigneeFor(isOpen ? null : card.id)} title="Tildel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <button onClick={() => handleSaveToLibrary(card.id)} title="Lagre i bibliotek" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0, fontSize: '0.7rem' }}>
          ★
        </button>
        <button onClick={() => handleDelete(card.id)} title="Slett" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0 }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2L2 10" />
          </svg>
        </button>

        {isOpen && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 200, padding: '3px 0' }}>
            {profiles.map(p => {
              const isAssigned = card.assignees.some(a => a.id === p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => handleToggleAssignee(card.id, p.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 12px', background: isAssigned ? C.accentBg : 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <Avatar id={p.id} name={p.name} size={22} />
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: isAssigned ? C.accent : C.text, flex: 1 }}>{p.name ?? p.email}</span>
                  {isAssigned && <span style={{ color: C.accent }}>✓</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
        Post-produksjon
      </p>

      {board.parallel.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent, marginBottom: 6 }}>
            Parallelt gjennom hele post-produksjonen
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {board.parallel.map(renderCard)}
          </div>
        </div>
      )}

      {board.lanes.map(lane => (
        <div key={lane.laneId ?? lane.kind}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: lane.color ?? C.accent, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: lane.color ?? C.text3 }}>
                {lane.name}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>Leveringsfrist</span>
              <input
                type="date"
                value={laneDeadlineValue(lane)}
                onChange={e => handleLaneDeadlineChange(lane, e.target.value)}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 6px', outline: 'none' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {lane.cards.map(renderCard)}
          </div>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={newLaneName}
          onChange={e => setNewLaneName(e.target.value)}
          placeholder="Ny lane, f.eks. Animasjon"
          style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', outline: 'none' }}
        />
        <button
          onClick={handleCreateLane}
          disabled={!newLaneName.trim()}
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: newLaneName.trim() ? 'pointer' : 'not-allowed', background: 'transparent', color: C.text3, border: `1px solid ${C.border}` }}
        >
          + Ny lane
        </button>
      </div>

      <PostProdTaskForm projectId={projectId} lanes={board.lanes} profiles={profiles} onAdded={refetch} />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: ingen nye feil fra denne filen.

- [ ] **Step 3: Commit**

```bash
git add app/admin/preprod/[id]/PostProdBoard.tsx
git commit -m "feat: PostProdBoard — statisk rendering av lanes, parallell-rad og kort"
```

---

### Task 14: Dra-og-slipp i `PostProdBoard.tsx`

**Files:**
- Modify: `app/admin/preprod/[id]/PostProdBoard.tsx`

**Interfaces:**
- Consumes: `@dnd-kit/core` (`DndContext`, `PointerSensor`, `useSensor`, `useSensors`), `@dnd-kit/sortable` (`SortableContext`, `useSortable`, `arrayMove`, `verticalListSortingStrategy`), `@dnd-kit/utilities` (`CSS`), `moveBoardTask` (Task 7).

- [ ] **Step 1: Legg til imports**

Øverst i `PostProdBoard.tsx`, legg til:

```typescript
import {
  DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { moveBoardTask, type PostProdDestination } from '@/lib/actions/pipeline'
```

- [ ] **Step 2: Gjør `renderCard` sorterbar**

Erstatt `function renderCard(card: PostProdBoardCard) {` med en egen komponent `SortableCard` som wrapper eksisterende kort-JSX med `useSortable`, og bruk den i stedet for direkte kall til `renderCard`:

```typescript
function SortableCard({ card, children }: { card: PostProdBoardCard; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}
```

Endre `renderCard`-funksjonen til å returnere JSX-en pakket i `<SortableCard card={card}>...</SortableCard>` (behold selve kort-innholdet uendret — kun wrap ytterst).

- [ ] **Step 3: Pakk hver lanes kort-liste i en `SortableContext` med droppable-id**

Hver lane trenger en unik "container-id" for `onDragEnd` til å vite hvilken lane et kort ble sluppet i. Bruk `lane.laneId ?? lane.kind` som container-id (samme nøkkel som allerede brukes til `key` på lane-div-en). Wrap kort-listen slik:

```typescript
<SortableContext items={lane.cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
  <div
    data-lane-id={lane.laneId ?? lane.kind}
    style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 8 }}
  >
    {lane.cards.map(renderCard)}
  </div>
</SortableContext>
```

Gjør det samme for parallell-raden, med container-id `'parallel'`:

```typescript
<SortableContext items={board.parallel.map(c => c.id)} strategy={verticalListSortingStrategy}>
  <div data-lane-id="parallel" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    {board.parallel.map(renderCard)}
  </div>
</SortableContext>
```

- [ ] **Step 4: `DndContext` og `onDragEnd`-logikk**

Legg til øverst i komponentfunksjonen, rett under `const [newLaneName, setNewLaneName] = useState('')`:

```typescript
const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

function laneIdToDestination(laneKey: string): PostProdDestination | null {
  if (laneKey === 'parallel') return { kind: 'parallel' }
  if (laneKey === 'video' || laneKey === 'photo') return { kind: laneKey }
  return { kind: 'custom', laneId: laneKey }
}

function findContainerId(cardId: string): string | null {
  if (board.parallel.some(c => c.id === cardId)) return 'parallel'
  for (const lane of board.lanes) {
    if (lane.cards.some(c => c.id === cardId)) return lane.laneId ?? lane.kind
  }
  return null
}

async function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event
  if (!over) return

  const activeId = active.id as string
  // over.id er enten en kort-id (sluppet oppå et annet kort) eller en
  // lane-container-id (sluppet i tomt rom i en lane via data-lane-id).
  const overId = over.id as string
  const overIsCard = board.parallel.some(c => c.id === overId) || board.lanes.some(l => l.cards.some(c => c.id === overId))

  const targetContainerId = overIsCard ? findContainerId(overId) : overId
  if (!targetContainerId) return

  const destination = laneIdToDestination(targetContainerId)
  if (!destination) return

  const beforeTaskId = overIsCard && overId !== activeId ? overId : null

  // Optimistisk lokal reordering for en umiddelbar respons, faktisk
  // rekkefølge bekreftes av refetch() etter at moveBoardTask er ferdig.
  await moveBoardTask(activeId, destination, beforeTaskId)
  refetch()
}
```

- [ ] **Step 5: Wrap hele brettet i `DndContext`**

I `return`-blokken, wrap `<div style={{ background: C.surface, ...}}>...</div>` (hele det eksisterende root-elementet) i:

```typescript
<DndContext sensors={sensors} onDragEnd={handleDragEnd}>
  {/* eksisterende root-div uendret her */}
</DndContext>
```

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Manuell verifisering i dev-server**

```bash
npm run dev
```

Åpne `/admin/preprod/<en-eksisterende-prosjekt-id-i-pre-prod>` i nettleseren. Verifiser:
- Video/Foto-lanes viser faktiske steg (materialisert av `getPostProdBoard` hvis prosjektet ikke hadde post-prod-tasks fra før).
- Dra et kort til en annen posisjon innad i samme lane → rekkefølgen endres og overlever en sideoppfriskning.
- Dra et kort fra Video-lanen til en nyopprettet egendefinert lane → `sub_type` nullstilles, `custom_lane_id` settes (verifiser i Supabase-tabellen `tasks` at raden faktisk endret seg riktig).

- [ ] **Step 8: Commit**

```bash
git add app/admin/preprod/[id]/PostProdBoard.tsx
git commit -m "feat: dra-og-slipp for post-produksjon-brettet (dnd-kit sortable, kryss-lane)"
```

---

### Task 15: `PostProdLibraryPanel.tsx`

**Files:**
- Create: `app/admin/preprod/[id]/PostProdLibraryPanel.tsx`
- Modify: `app/admin/preprod/[id]/PostProdBoard.tsx` (koble inn panelet + håndter slipp fra biblioteket)

**Interfaces:**
- Consumes: `getTaskLibrary`, `PostProdLibraryItem` (Task 9), `addPostProdBoardTask`, `PostProdDestination` (Task 6).
- Produces: `PostProdLibraryPanel`-komponenten — konsumeres av `PostProdBoard.tsx`.

- [ ] **Step 1: Skriv panelet**

```typescript
// app/admin/preprod/[id]/PostProdLibraryPanel.tsx
'use client'

import { useEffect, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { getTaskLibrary, type PostProdLibraryItem } from '@/lib/actions/pipeline'

const C = {
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text3:    '#8484A0',
}

/** Bibliotekselementers dra-id-er er prefikset "lib:" slik at onDragEnd i
 *  PostProdBoard kan skille dem fra ekte task-id-er. */
export function libraryDragId(item: PostProdLibraryItem): string {
  return `lib:${item.id}`
}

function LibraryCard({ item }: { item: PostProdLibraryItem }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: libraryDragId(item) })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6,
        background: C.surface2, border: `1px solid ${item.color ?? C.border}`, cursor: 'grab', touchAction: 'none',
      }}
    >
      {item.icon && <span style={{ fontSize: '0.8rem' }}>{item.icon}</span>}
      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text }}>{item.title}</span>
    </div>
  )
}

export function PostProdLibraryPanel({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<PostProdLibraryItem[]>([])

  useEffect(() => {
    getTaskLibrary().then(setItems)
  }, [refreshKey])

  if (items.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.text3 }}>
        Bibliotek — dra inn i en lane
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map(item => <LibraryCard key={item.id} item={item} />)}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Koble panelet inn i `PostProdBoard.tsx`**

Legg til import og state for å tvinge re-fetch av biblioteket når noe nytt lagres:

```typescript
import { PostProdLibraryPanel, libraryDragId } from './PostProdLibraryPanel'
```

Legg til en `libraryRefreshKey`-state og øk den i `handleSaveToLibrary` og i `PostProdTaskForm`s `onAdded` (siden `isReusable` også kan legge noe i biblioteket):

```typescript
const [libraryRefreshKey, setLibraryRefreshKey] = useState(0)
```

I `handleSaveToLibrary`, etter `await addTaskToLibrary(taskId)`, legg til `setLibraryRefreshKey(k => k + 1)`. I `refetch`, som allerede kalles av `PostProdTaskForm`s `onAdded`, legg til samme økning (siden et gjenbrukbart nytt kort også skal dukke opp i biblioteket).

Sett inn `<PostProdLibraryPanel refreshKey={libraryRefreshKey} />` i JSX-en, rett over `<PostProdTaskForm ... />`.

- [ ] **Step 3: Håndter slipp fra biblioteket i `handleDragEnd`**

I `handleDragEnd` (fra Task 14), legg til en gren helt øverst som fanger opp bibliotek-drag før den vanlige move-logikken:

```typescript
async function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event
  if (!over) return

  const activeId = active.id as string
  const overId = over.id as string

  if (activeId.startsWith('lib:')) {
    const libraryItemId = activeId.slice('lib:'.length)
    const item = (await getTaskLibrary()).find(i => i.id === libraryItemId)
    if (!item) return

    const overIsCard = board.parallel.some(c => c.id === overId) || board.lanes.some(l => l.cards.some(c => c.id === overId))
    const targetContainerId = overIsCard ? findContainerId(overId) : overId
    if (!targetContainerId) return
    const destination = laneIdToDestination(targetContainerId)
    if (!destination) return

    await addPostProdBoardTask({
      projectId,
      title: item.title,
      description: item.description ?? undefined,
      color: item.color ?? undefined,
      icon: item.icon ?? undefined,
      destination,
      insertBeforeTaskId: overIsCard && overId !== activeId ? overId : null,
    })
    refetch()
    return
  }

  // ... (resten av funksjonen fra Task 14, uendret)
}
```

Legg til `import { getTaskLibrary, addPostProdBoardTask } from '@/lib/actions/pipeline'` i den eksisterende import-linjen fra `@/lib/actions/pipeline` (ikke som ny linje — `addPostProdBoardTask` er allerede importert av `PostProdTaskForm`, men trengs nå direkte i `PostProdBoard.tsx` også).

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Manuell verifisering**

I dev-serveren: merk en oppgave som gjenbrukbar via stjerne-knappen på et kort → biblioteket dukker opp nederst → åpne et annet prosjekts pre-prod-side → dra elementet fra biblioteket inn i en lane der → verifiser at et nytt kort med samme tittel/farge/ikon dukker opp, og at original-elementet i biblioteket er uendret.

- [ ] **Step 6: Commit**

```bash
git add app/admin/preprod/[id]/PostProdLibraryPanel.tsx app/admin/preprod/[id]/PostProdBoard.tsx
git commit -m "feat: gjenbrukbart oppgavebibliotek — dra inn i et hvilket som helst prosjekts brett"
```

---

### Task 16: Koble inn `PostProdBoard`, fjern `PostCrewSection`/`PostProdFlowPlanner`

**Files:**
- Modify: `app/admin/preprod/[id]/page.tsx`
- Delete: `app/admin/preprod/[id]/PostProdFlowPlanner.tsx`
- Delete: `lib/postprod-role-map.ts`

**Interfaces:**
- Consumes: `PostProdBoard` (Task 13/14/15).

- [ ] **Step 0: Legg `post_deadlines` tilbake på `PreprodData`**

Research under Task 10 avdekket at `post_deadlines` (leveringsfrist per video/foto-spor) ikke finnes i `lib/actions/preprod.ts` på denne branchen — det var kun en del av ukommittert WIP på `main` som denne branchen ikke arvet. Dette er ikke en regresjon å unngå, men ny funksjonalitet Magnus har bekreftet han vil ha bygget likevel (se `.superpowers/sdd/progress.md`). Legg feltet til i `lib/actions/preprod.ts`:

```typescript
export type PreprodData = {
  millanote_url: string
  millanote_done: boolean
  prod_crew: PreprodCrewMember[]
  packing_list: PackingItem[]
  post_deadlines: { video: string | null; photo: string | null }
}

const DEFAULT_PREPROD: PreprodData = {
  millanote_url: '',
  millanote_done: false,
  prod_crew: [],
  packing_list: [],
  post_deadlines: { video: null, photo: null },
}
```

(`post_crew` ble fjernet fra begge i Task 10 — ikke legg det tilbake.)

- [ ] **Step 1: Fjern døde imports**

I `app/admin/preprod/[id]/page.tsx` (linje 6-21), fjern:
- `syncPostCrewToTask` fra import-linjen på linje 6-10
- hele linje 11: `import { resolvePostProdTaskForRole } from '@/lib/postprod-role-map'`
- hele linje 14: `import { getPostProdFlowOptions, type PostProdFlowTrack, type PlannedPostProdStep } from '@/lib/actions/pipeline'`
- hele linje 16: `import { PostProdFlowPlanner } from './PostProdFlowPlanner'`
- `PostProdTaskLite` fra linje 20 (behold `PreprodDetail`)

Legg til:

```typescript
import { PostProdBoard } from './PostProdBoard'
```

- [ ] **Step 2: Fjern `PostCrewSection`-blokken**

Slett hele blokken fra `// ─── PostCrewSection ...` (linje 674) til den avsluttende `}` for `PostCrewSection`-funksjonen (rundt linje 905-910 — finn nøyaktig slutt ved å lese filen på nytt siden linjenumre har flyttet seg etter tidligere endringer i denne tasken). Dette inkluderer `POST_ROLES_VIDEO`, `POST_ROLES_PHOTO`, `RoleGroup`-typen, `resolveGroups`, og selve `PostCrewSection`-komponenten.

- [ ] **Step 3: Fjern `postProdTasks`-state og `flowTracks`/`plannedSteps`-state**

Fjern:
- `const [postProdTasks, setPostProdTasks] = useState<PostProdTaskLite[]>([])` (rundt linje 1024)
- `setPostProdTasks(detail.postProdTasks)` (rundt linje 1041)
- `const [flowTracks, setFlowTracks] = useState<PostProdFlowTrack[]>([])` og `const [plannedSteps, setPlannedSteps] = useState<PlannedPostProdStep[]>([])` (rundt linje 1057-1058)
- `refetchFlowOptions`-funksjonen og `useEffect`-en som kaller den (rundt linje 1060-1069)
- `handlePostProdDueDateChange` (rundt linje 1115-1118) — ikke lenger brukt, `PostProdBoard` håndterer due dates internt via `updateTaskDueDate` direkte.

- [ ] **Step 4: Oppdater `handleCrewChanged`-logikken**

`handleCrewChanged` (rundt linje 1129) satte «Tildel oppgaver til teamet»-statusen basert på `prod_crew`/`post_crew`. Siden `post_crew` er fjernet, gjør den nye signalet for "har noen blitt tildelt post-produksjon" avhengig av selve `PostProdBoard`s data i stedet. Endre funksjonen til å ta imot en eksplisitt boolean fra `PostProdBoard` (via en `onAnyAssigned`-callback) i stedet for å lese `post_crew`:

```typescript
const [postProdHasAssignee, setPostProdHasAssignee] = useState(false)

// hasPostOverride sendes eksplisitt fra onAssignedChange (Step 6) i stedet
// for å leses fra postProdHasAssignee-state via closure, siden funksjonen
// da kan kalles i samme tick som state-oppdateringen skjer uten å fange en
// foreldet verdi.
async function handleCrewChanged(updatedProdCrew?: PreprodCrewMember[], hasPostOverride?: boolean) {
  const prodCrew = updatedProdCrew ?? preprod?.prod_crew ?? []
  const hasProd = prodCrew.length > 0
  const hasPost = hasPostOverride ?? postProdHasAssignee
  const newStatus = (hasProd && hasPost) ? 'done' : (hasProd || hasPost) ? 'in_progress' : 'todo'
  await setTildelTaskStatus(id, newStatus)
  setTasks(prev => prev.map(t =>
    t.title === 'Tildel oppgaver til teamet' ? { ...t, status: newStatus } : t
  ))
}
```

`CrewSection` (produksjonsdag, uendret) sitt `onCrewAdded={next => handleCrewChanged(next, undefined)}`-kall (linje 1336) må oppdateres til `onCrewAdded={next => handleCrewChanged(next)}` siden funksjonens andre parameter nå betyr noe annet (`hasPostOverride`, ikke post-crew-listen).

- [ ] **Step 5: Bytt ut render-blokken**

Erstatt (rundt linje 1339-1362):

```typescript
{/* Fordeling: Post */}
<PostCrewSection
  crew={preprod.post_crew}
  projectId={id}
  profiles={profiles}
  projectType={project.project_type}
  postProdTasks={postProdTasks}
  shootEnd={project.shoot_end ?? null}
  deadlines={preprod.post_deadlines}
  onChange={next => patchPreprod({ post_crew: next })}
  onCrewAdded={next => handleCrewChanged(undefined, next)}
  onDueDateChange={handlePostProdDueDateChange}
  onDeadlineChange={handlePostDeadlineChange}
/>

{/* Planlagt for post-produksjon (f.eks. VFX/animasjon) */}
<PostProdFlowPlanner
  projectId={id}
  projectType={project.project_type}
  tracks={flowTracks}
  plannedSteps={plannedSteps}
  onStepAdded={refetchFlowOptions}
  onStepDeleted={deletedId => setPlannedSteps(prev => prev.filter(s => s.id !== deletedId))}
/>
```

med:

```typescript
{/* Post-produksjon-brettet: Video/Foto-lanes, egendefinerte lanes, parallell-rad, bibliotek */}
<PostProdBoard
  projectId={id}
  shootEnd={project.shoot_end ?? null}
  postDeadlines={preprod.post_deadlines}
  onDeadlineChange={handlePostDeadlineChange}
/>
```

- [ ] **Step 6: Koble `postProdHasAssignee` til faktisk data**

`PostProdBoard` henter sin egen data internt og har ingen naturlig callback-utgang i dagens Task 13/14/15-design for "har noen tildeling". Legg til en `onAssignedChange`-prop.

I `app/admin/preprod/[id]/PostProdBoard.tsx`, endre funksjonssignaturen:

```typescript
export function PostProdBoard({
  projectId, shootEnd, postDeadlines, onDeadlineChange, onAssignedChange,
}: {
  projectId: string
  shootEnd: string | null
  postDeadlines: { video: string | null; photo: string | null }
  onDeadlineChange: (subType: 'video' | 'photo', date: string | null) => void
  onAssignedChange: (hasAny: boolean) => void
}) {
```

Og i `refetch`, rett etter `setBoard(data)`:

```typescript
async function refetch() {
  const data = await getPostProdBoard(projectId)
  setBoard(data)
  const hasAny = data.lanes.some(l => l.cards.some(c => c.assignees.length > 0)) || data.parallel.some(c => c.assignees.length > 0)
  onAssignedChange(hasAny)
}
```

I `page.tsx`, koble `postProdHasAssignee` til denne propen og trigg `handleCrewChanged()` kun når verdien faktisk endrer seg (unngå unødvendige `setTildelTaskStatus`-kall ved hver refetch):

```typescript
<PostProdBoard
  projectId={id}
  shootEnd={project.shoot_end ?? null}
  postDeadlines={preprod.post_deadlines}
  onDeadlineChange={handlePostDeadlineChange}
  onAssignedChange={hasAny => {
    setPostProdHasAssignee(prev => {
      if (prev === hasAny) return prev
      handleCrewChanged(undefined, hasAny)
      return hasAny
    })
  }}
/>
```

- [ ] **Step 7: Slett `PostProdFlowPlanner.tsx` og `lib/postprod-role-map.ts`**

```bash
git rm app/admin/preprod/[id]/PostProdFlowPlanner.tsx lib/postprod-role-map.ts
```

- [ ] **Step 8: Typecheck**

```bash
npx tsc --noEmit
```

Expected: ingen feil. Dette er punktet der ALLE tidligere "forventede" feil fra tidligere tasks (manglende `getPostProdFlowOptions`, `PostProdFlowTrack`, osv.) skal være borte.

- [ ] **Step 9: Lint**

```bash
npx eslint app/admin/preprod/[id]/page.tsx app/admin/preprod/[id]/PostProdBoard.tsx app/admin/preprod/[id]/PostProdTaskForm.tsx app/admin/preprod/[id]/PostProdLibraryPanel.tsx lib/actions/pipeline.ts lib/actions/preprod.ts lib/postprod-flow.ts
```

Expected: ingen feil (advarsler om ubrukte variabler er reelle feil her — fjern dem, ikke bare undertrykk).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: koble inn PostProdBoard, fjern PostCrewSection og PostProdFlowPlanner"
```

---

### Task 17: Manuell ende-til-ende-verifisering

**Files:** ingen kodeendringer — kun verifisering.

- [ ] **Step 1: Start dev-server**

```bash
npm run dev
```

- [ ] **Step 2: Gå gjennom hele sjekklisten fra spec-en**

Bruk et midlertidig testprosjekt i pre-prod (opprett ett hvis nødvendig, rydd opp etterpå):

- Åpne et `mixed`-prosjekt i pre-prod: Video- og Foto-lanes viser de faktiske stegene (materialisert fra `task_templates` ved første besøk om de ikke fantes fra før).
- Legg til en ny oppgave («VFX») med tildeling, farge og ikon → dukker opp sist i valgt lane → dra den til ny posisjon mellom to eksisterende steg → rekkefølgen overlever en sideoppfriskning.
- Dra en oppgave fra Video-lanen over til en nyopprettet egendefinert lane («Animasjon») → sjekk i Supabase at `sub_type` er `null` og `custom_lane_id` er satt på raden, og at `sort_order` er fornuftig i begge lanes etterpå.
- Opprett en parallell-oppgave → vises i parallell-raden uavhengig av øvrige lanes.
- Sett en leveringsfrist på en lane → verifiser at tomme (uten manuelt satt frist fra før) kort i den lanen får et `due_date`-forslag jevnt fordelt bakover fra `shoot_end`.
- Merk en oppgave som gjenbrukbar → åpne et annet prosjekts pre-prod-side → dra den fra biblioteket inn i en lane der → feltene kopieres, original-elementet i biblioteket er uendret.
- Trykk «↺ Nullstill» i post-produksjon (`/admin/postprod/<id>`) for et prosjekt med både en custom-lane-oppgave og en parallell-oppgave → verifiser at begge overlever uendret og at kun maloppgavene regenereres.
- Slett en oppgave i en egendefinert lane og i parallell-raden → sletting fungerer.
- Sjekk pre-prod-listevisningen (`/admin/preprod`): «X tildelt»-tallet stemmer med antall post-prod-oppgaver som faktisk har en tildeling for et testprosjekt.
- Sjekk at «Tildel oppgaver til teamet»-oppgaven i pre-prod-sjekklisten fortsatt skifter status riktig når du tildeler både produksjonsdag-crew og minst én post-produksjon-oppgave.

- [ ] **Step 3: Full typecheck og lint på hele endringssettet**

```bash
npx tsc --noEmit
npx eslint app/admin/preprod app/admin/postprod lib/actions/pipeline.ts lib/actions/preprod.ts lib/postprod-flow.ts
```

Expected: ingen feil.

- [ ] **Step 4: Rydd opp testdata**

Slett eventuelt midlertidig testprosjekt/testoppgaver opprettet under verifiseringen (jf. [[feedback-testing-live-data]]-konvensjonen — ikke la testdata bli liggende i produksjonsdatabasen).

- [ ] **Step 5: Oppdater spec-status**

I `docs/superpowers/specs/2026-07-22-post-prod-board-design.md`, endre `**Status:** Godkjent av Magnus (design), venter på spec-review` til `**Status:** Implementert`.

```bash
git add docs/superpowers/specs/2026-07-22-post-prod-board-design.md
git commit -m "docs: merk post-produksjon-brett v2-spec som implementert"
```
