# Seleksjon — varsler, pipeline-fremgang og prosjektleder — Implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Når kunden sender inn bildevalg skal teamet varsles, "Seleksjon til kunde"-tasken markeres done, og prosjektleder innføres som fallback for varsler og vises i alle prosjektsider.

**Architecture:** Fire uavhengige endringer: (1) DB-migrasjon + typer, (2) delt varsellogikk + submitAlbumPicks-fix, (3) setProjectLead action + oppdaterte queries, (4) prosjektleder-widget i tre sider + alltid-synlig kundevalg i postprod.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL), TypeScript, Tailwind-free inline styles.

## Global Constraints

- Neste migrasjon er `078_` — bruk dette nummeret
- Alle inline styles følger eksisterende `C`-fargepalett i hver fil
- Server actions har `'use server'` direktiv øverst
- Supabase service client (`createServiceClient()`) brukes i kunde-facing actions, autentisert client (`createClient()`) i admin-actions
- Ingen nye npm-pakker

---

## Filstruktur

**Opprettes:**
- `supabase/migrations/078_project_lead.sql`

**Endres:**
- `lib/types.ts` — `Project` og `ProjectWithPipeline` får `project_lead_id` og `project_lead`
- `lib/actions/selections.ts` — ny intern `notifyOnSelectionSubmit()` + `markSeleksjonTaskDone()`, `submitGallery()` refaktoreres til å bruke dem
- `lib/actions/selection-picks.ts` — `submitAlbumPicks()` får varsel + task-markering
- `lib/actions/pipeline.ts` — ny `setProjectLead()`, oppdatert select i `getProjectHub()` og `getPostProdProjects()`
- `lib/actions/preprod.ts` — oppdatert select i `getPreprodDetail()`
- `app/admin/postprod/[id]/page.tsx` — prosjektleder-widget i header + kundevalg alltid synlig
- `app/admin/projects/[id]/page.tsx` — prosjektleder-widget i header
- `app/admin/preprod/[id]/page.tsx` — prosjektleder-widget i header

---

## Task 1: DB-migrasjon

**Files:**
- Create: `supabase/migrations/078_project_lead.sql`

**Interfaces:**
- Produces: kolonnen `projects.project_lead_id UUID REFERENCES profiles(id)` tilgjengelig i Supabase

- [ ] **Steg 1: Opprett migrasjonsfil**

```sql
-- supabase/migrations/078_project_lead.sql
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_lead_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
```

- [ ] **Steg 2: Kjør migrasjonen**

```bash
npx supabase db push
```

Forventet output: `Applying migration 078_project_lead.sql` uten feil.

- [ ] **Steg 3: Commit**

```bash
git add supabase/migrations/078_project_lead.sql
git commit -m "feat: add project_lead_id column to projects"
```

---

## Task 2: Oppdater typer

**Files:**
- Modify: `lib/types.ts:45-65` (Project-typen) og `lib/types.ts:455-467` (ProjectWithPipeline-typen)

**Interfaces:**
- Consumes: kolonnen `project_lead_id` fra Task 1
- Produces: `Project.project_lead_id`, `ProjectWithPipeline.project_lead_id`, `ProjectWithPipeline.project_lead`

- [ ] **Steg 1: Legg til `project_lead_id` i `Project`-typen**

I `lib/types.ts`, legg til én linje etter `invoice_assignee_id` (linje 62):

```ts
  invoice_assignee_id?: string | null
  project_lead_id?: string | null   // ← ny linje
  created_at: string
```

- [ ] **Steg 2: Legg til `project_lead_id` og `project_lead` i `ProjectWithPipeline`**

Erstatt blokken fra linje 455–467:

```ts
export type ProjectWithPipeline = Project & {
  pipeline_stage: PipelineStage
  project_type?: ProjectType | null
  pipeline_data?: PipelineData | null
  project_lead_id?: string | null
  project_lead?: { id: string; name: string | null; email: string } | null
  customer?: {
    id: string
    name: string
    company: string | null
    email?: string | null
    phone?: string | null
  } | null
  tasks?: Task[]
}
```

- [ ] **Steg 3: Verifiser TypeScript-kompilering**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Forventet: ingen feil (eller samme feil som før endringen).

- [ ] **Steg 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add project_lead fields to Project and ProjectWithPipeline types"
```

---

## Task 3: Delt varsellogikk + refaktorer `submitGallery`

**Files:**
- Modify: `lib/actions/selections.ts`

**Interfaces:**
- Consumes: `projects.project_lead_id` fra Task 1
- Produces: intern `notifyOnSelectionSubmit(projectId, service)` og `markSeleksjonTaskDone(projectId, service, now)` som brukes av Task 4

- [ ] **Steg 1: Legg til to interne hjelpefunksjoner øverst i `submitGallery`-seksjonen**

I `lib/actions/selections.ts`, legg til disse funksjonene **før** `submitGallery` (etter linje 510, dvs. etter avsluttende `}` for `addImageComment`):

```ts
// ---------------------------------------------------------------------------
// INTERN: Varsel + task-markering ved seleksjonsinnsending
// ---------------------------------------------------------------------------
async function notifyOnSelectionSubmit(
  projectId: string,
  service: ReturnType<typeof createServiceClient>
): Promise<void> {
  const { data: taskRows } = await service
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)

  const taskIds = (taskRows ?? []).map((t: { id: string }) => t.id)
  let profileIds: string[] = []

  if (taskIds.length > 0) {
    const { data: assignees } = await service
      .from('task_assignees')
      .select('profile_id')
      .in('task_id', taskIds)

    profileIds = [...new Set((assignees ?? []).map((a: { profile_id: string }) => a.profile_id))]
  }

  if (profileIds.length === 0) {
    const { data: proj } = await service
      .from('projects')
      .select('project_lead_id')
      .eq('id', projectId)
      .single()

    if (proj?.project_lead_id) profileIds = [proj.project_lead_id]
  }

  if (profileIds.length === 0) return

  await service.from('notifications').insert(
    profileIds.map((uid: string) => ({
      user_id: uid,
      type: 'selection_submitted',
      project_id: projectId,
      message_preview: 'Kunden har sendt inn sitt bildevalg',
      sender_name: 'Kunde',
    }))
  )
}

async function markSeleksjonTaskDone(
  projectId: string,
  service: ReturnType<typeof createServiceClient>,
  now: string
): Promise<void> {
  const { data: selTask } = await service
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('pipeline_stage', 'post_prod')
    .ilike('title', 'Seleksjon til kunde')
    .maybeSingle()

  if (selTask) {
    await service
      .from('tasks')
      .update({ status: 'done', updated_at: now })
      .eq('id', selTask.id)
  }
}
```

- [ ] **Steg 2: Refaktorer `submitGallery` til å bruke hjelpefunksjonene**

Erstatt hele `submitGallery`-funksjonen (linje 514–578):

```ts
export async function submitGallery(token: string): Promise<void> {
  const cookieStore = await cookies()
  const galleryId = cookieStore.get(cookieKey(token))?.value
  if (!galleryId) throw new Error('Ikke autorisert')

  const service = createServiceClient()
  const now = new Date().toISOString()

  const { data: gallery } = await service
    .from('selection_galleries')
    .select('project_id, status')
    .eq('id', galleryId)
    .single()

  if (!gallery || gallery.status !== 'open') return

  await service
    .from('selection_galleries')
    .update({ status: 'submitted', submitted_at: now, updated_at: now })
    .eq('id', galleryId)

  await Promise.all([
    notifyOnSelectionSubmit(gallery.project_id, service),
    markSeleksjonTaskDone(gallery.project_id, service, now),
  ])
}
```

- [ ] **Steg 3: Verifiser TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "selections" | head -10
```

Forventet: ingen feil fra `selections.ts`.

- [ ] **Steg 4: Commit**

```bash
git add lib/actions/selections.ts
git commit -m "feat: extract notification helpers and refactor submitGallery"
```

---

## Task 4: `submitAlbumPicks` — full pipeline-integrasjon

**Files:**
- Modify: `lib/actions/selection-picks.ts`

**Interfaces:**
- Consumes: `notifyOnSelectionSubmit` og `markSeleksjonTaskDone` fra Task 3 (begge er i `selections.ts` — men de er interne! Alternativet er å duplisere logikken her, eller flytte hjelperne til et felles sted. Siden `selection-picks.ts` importerer fra `selection-albums.ts` allerede, og for å unngå sirkulære imports, dupliseres logikken minimalt ved å inline den direkte i `submitAlbumPicks`)

**NB:** Hjelpefunksjonene i `selections.ts` er interne (`async function`, ikke `export`). De skal ikke importeres. I stedet implementeres tilsvarende logikk direkte i `submitAlbumPicks`.

- [ ] **Steg 1: Legg til varsel + task-markering i `submitAlbumPicks`**

Erstatt hele `submitAlbumPicks`-funksjonen (linje 218–252 i `lib/actions/selection-picks.ts`):

```ts
export async function submitAlbumPicks(albumToken: string): Promise<void> {
  const cookieStore = await cookies()
  const albumId = cookieStore.get(albumCookieKey(albumToken))?.value
  if (!albumId) throw new Error('Ikke autorisert')

  const service = createServiceClient()
  const now = new Date().toISOString()

  // Hent alle picks og alle bilder i albumet
  const [{ data: picks }, { data: images }] = await Promise.all([
    service.from('selection_album_picks').select('image_id, selected, comment').eq('album_id', albumId),
    service.from('selection_images').select('id').eq('album_id', albumId),
  ])

  const pickMap = Object.fromEntries((picks ?? []).map(p => [p.image_id, p]))

  // Synk alle bilder til selection_images
  await Promise.all(
    (images ?? []).map(img => {
      const pick = pickMap[img.id]
      return service
        .from('selection_images')
        .update({
          selected: pick?.selected ?? false,
          selected_at: pick?.selected ? now : null,
          comment: pick?.comment ?? null,
        })
        .eq('id', img.id)
    })
  )

  await service
    .from('selection_albums')
    .update({ album_status: 'submitted', album_submitted_at: now, updated_at: now })
    .eq('id', albumId)

  // Hent project_id via gallery
  const { data: album } = await service
    .from('selection_albums')
    .select('gallery_id')
    .eq('id', albumId)
    .single()

  if (!album?.gallery_id) return

  const { data: gallery } = await service
    .from('selection_galleries')
    .select('project_id')
    .eq('id', album.gallery_id)
    .single()

  if (!gallery?.project_id) return

  const projectId = gallery.project_id

  // Varsle task-assignees, fallback til prosjektleder
  const { data: taskRows } = await service
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)

  const taskIds = (taskRows ?? []).map((t: { id: string }) => t.id)
  let profileIds: string[] = []

  if (taskIds.length > 0) {
    const { data: assignees } = await service
      .from('task_assignees')
      .select('profile_id')
      .in('task_id', taskIds)

    profileIds = [...new Set((assignees ?? []).map((a: { profile_id: string }) => a.profile_id))]
  }

  if (profileIds.length === 0) {
    const { data: proj } = await service
      .from('projects')
      .select('project_lead_id')
      .eq('id', projectId)
      .single()

    if (proj?.project_lead_id) profileIds = [proj.project_lead_id]
  }

  // Marker "Seleksjon til kunde"-task som done
  const { data: selTask } = await service
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('pipeline_stage', 'post_prod')
    .ilike('title', 'Seleksjon til kunde')
    .maybeSingle()

  await Promise.all([
    profileIds.length > 0
      ? service.from('notifications').insert(
          profileIds.map((uid: string) => ({
            user_id: uid,
            type: 'selection_submitted',
            project_id: projectId,
            message_preview: 'Kunden har sendt inn sitt bildevalg',
            sender_name: 'Kunde',
          }))
        )
      : Promise.resolve(),
    selTask
      ? service.from('tasks').update({ status: 'done', updated_at: now }).eq('id', selTask.id)
      : Promise.resolve(),
  ])
}
```

- [ ] **Steg 2: Verifiser TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "selection-picks" | head -10
```

Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add lib/actions/selection-picks.ts
git commit -m "feat: submitAlbumPicks sends notifications and advances pipeline"
```

---

## Task 5: `setProjectLead` action + oppdater data-queries

**Files:**
- Modify: `lib/actions/pipeline.ts` (legg til action, oppdater `getProjectHub` og `getPostProdProjects`)
- Modify: `lib/actions/preprod.ts` (oppdater `getPreprodDetail`)

**Interfaces:**
- Produces: `setProjectLead(projectId: string, profileId: string | null): Promise<{ ok: boolean; error?: string }>`
- Produces: `getProjectHub` returnerer nå `project` med `project_lead` populated
- Produces: `getPostProdProjects` returnerer nå items med `project_lead` populated
- Produces: `getPreprodDetail` returnerer nå `project` med `project_lead` populated

- [ ] **Steg 1: Legg til `setProjectLead` i `pipeline.ts`**

Legg til på slutten av `lib/actions/pipeline.ts` (før siste linjeskift):

```ts
/**
 * Setter eller fjerner prosjektleder for et prosjekt.
 */
export async function setProjectLead(
  projectId: string,
  profileId: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('projects')
      .update({ project_lead_id: profileId, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
```

- [ ] **Steg 2: Oppdater `getProjectHub` — legg til `project_lead` i select**

Finn select-kallet i `getProjectHub` (rundt linje 665–674 i `pipeline.ts`). Erstatt det:

```ts
    const { data: projectRow, error: projectError } = await supabase
      .from('projects')
      .select(`
        *,
        customers (
          id,
          name,
          company
        ),
        project_lead:profiles!project_lead_id (
          id,
          name,
          email
        )
      `)
      .eq('id', projectId)
      .single()
```

Og oppdater mappingen av `project` like under (linje 683–687):

```ts
    const project: ProjectWithPipeline = {
      ...projectRow,
      customer: projectRow.customers ?? null,
      customers: undefined,
      project_lead: projectRow.project_lead ?? null,
    } as ProjectWithPipeline
```

- [ ] **Steg 3: Oppdater `getPostProdProjects` — legg til `project_lead` i select**

Finn select-kallet i `getPostProdProjects` (rundt linje 550–553 i `pipeline.ts`). Erstatt:

```ts
    const { data, error } = await supabase
      .from('projects')
      .select(`*, customers(id, name, company), project_lead:profiles!project_lead_id(id, name, email)`)
      .eq('pipeline_stage', 'post_prod')
      .neq('status', 'lost')
      .order('updated_at', { ascending: false })
```

- [ ] **Steg 4: Oppdater mapping i `getPostProdProjects`**

Finn `return data.map(...)` (linje 574–580 i `pipeline.ts`). Erstatt:

```ts
    return data.map((row: ProjectRow) => ({
      ...row,
      customer: row.customers ?? null,
      customers: undefined,
      project_lead: (row as { project_lead?: ProjectWithPipeline['project_lead'] }).project_lead ?? null,
      task_count: taskMap[row.id]?.total ?? 0,
      done_count: taskMap[row.id]?.done ?? 0,
    })) as (ProjectWithPipeline & { task_count: number; done_count: number })[]
```

- [ ] **Steg 5: Oppdater `getPreprodDetail` — legg til `project_lead` i select**

I `lib/actions/preprod.ts`, finn select-kallet (linje 96–100). Erstatt:

```ts
    const { data: project, error: pErr } = await supabase
      .from('projects')
      .select('*, customers(id, name, company), project_lead:profiles!project_lead_id(id, name, email)')
      .eq('id', projectId)
      .single()
```

Og oppdater return-objektet (linje 136–142) for å inkludere `project_lead`:

```ts
    return {
      project: {
        ...project,
        customer: project.customers ?? null,
        project_lead: (project as { project_lead?: ProjectWithPipeline['project_lead'] }).project_lead ?? null,
        preprod,
        quote_equipment: quoteEquipment,
      },
      tasks: (tasks ?? []).map((t: TaskRow) => ({
        ...t,
        assignees: (t.task_assignees ?? [])
          .map((ta) => ta.profile)
          .filter((pr): pr is NonNullable<typeof pr> => pr !== null),
      })),
      profiles: (profiles ?? []) as { id: string; name: string | null; email: string }[],
    }
```

- [ ] **Steg 6: Verifiser TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -E "pipeline|preprod" | head -20
```

Forventet: ingen nye feil.

- [ ] **Steg 7: Commit**

```bash
git add lib/actions/pipeline.ts lib/actions/preprod.ts
git commit -m "feat: add setProjectLead action and include project_lead in project queries"
```

---

## Task 6: Prosjektleder-widget + alltid-synlig kundevalg i `postprod/[id]`

**Files:**
- Modify: `app/admin/postprod/[id]/page.tsx`

**Interfaces:**
- Consumes: `setProjectLead` fra Task 5, `currentProject.project_lead` fra oppdatert `getPostProdProjects`

Postprod-siden er allerede ~1714 linjer. Endringene er:
1. Importer `setProjectLead`
2. Legg til to state-variabler og en ref
3. Legg til `handleSetLead`-funksjon og click-outside useEffect
4. Legg til widget-JSX i headeren (etter kundenavsnittet)
5. Initialiser `projectLead`-state fra `currentProject` i `fetchAll`
6. Fjern title-betingelsen for seleksjonsbildene

- [ ] **Steg 1: Importer `setProjectLead`**

Finn importlinjen øverst (linje 7–18 i `postprod/[id]/page.tsx`):

```ts
import {
  getPostProdProjects, getTasksForProject, updateTaskStatus,
  reseedPostProdTasks, setProjectType, getTaskMessages,
  sendTaskMessage, updateTaskNotes, updateTaskData, getCurrentUserProfile,
  rejectFeedbackAndReset, resetTaskAndSubsequent,
  getAllProfiles, toggleTaskAssignee, updatePostProdDelivery,
  getProjectDeliverablesSection,
  updateProjectDeliverablesSection,
  setProjectLead,
} from '@/lib/actions/pipeline'
```

- [ ] **Steg 2: Legg til state og ref for prosjektleder**

Finn state-deklarasjonene i `PostProdDetailPage` (rundt linje 190–230). Legg til rett etter `const [dueDates, setDueDates] = ...`:

```ts
  const [projectLead, setProjectLead_] = useState<{ id: string; name: string | null; email: string } | null>(null)
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false)
  const leadDropdownRef = useRef<HTMLDivElement>(null)
```

(Vi bruker `setProjectLead_` for å unngå navnekollisjon med den importerte `setProjectLead` action.)

- [ ] **Steg 3: Initialiser `projectLead` i `fetchAll`**

Finn `fetchAll`-funksjonen. Legg til én linje rett etter `setLoading(false)` i det normale løpet (etter `if (currentProj)` blokken, rundt linje 318–321):

```ts
    if (currentProj) {
      setDeliveryVideo(currentProj.delivery_video ?? '')
      setDeliveryPhoto(currentProj.delivery_photo ?? '')
      setProjectLead_(currentProj.project_lead ?? null)   // ← ny linje
    }
```

- [ ] **Steg 4: Legg til `handleSetLead` og click-outside useEffect**

Legg til rett etter eksisterende `useEffect` for `assigneeDropdownOpen` (rundt linje 248–257):

```ts
  useEffect(() => {
    if (!leadDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (leadDropdownRef.current && !leadDropdownRef.current.contains(e.target as Node)) {
        setLeadDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [leadDropdownOpen])

  async function handleSetLead(profileId: string | null) {
    const prev = projectLead
    const profile = profileId ? profiles.find(p => p.id === profileId) ?? null : null
    setProjectLead_(profile)
    const result = await setProjectLead(projectId, profileId)
    if (!result.ok) setProjectLead_(prev)
  }
```

- [ ] **Steg 5: Legg til prosjektleder-widget i header-JSX**

Finn kundenavsnittet i header-JSX (linje ~678–681):

```tsx
                {currentProject.customer && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                    {currentProject.customer.name}{currentProject.customer.company ? ` — ${currentProject.customer.company}` : ''}
                  </p>
                )}
```

Legg til prosjektleder-widget **etter** dette avsnittet:

```tsx
                {/* Prosjektleder */}
                <div style={{ position: 'relative', marginTop: 6 }} ref={leadDropdownRef}>
                  <button
                    onClick={() => setLeadDropdownOpen(v => !v)}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                      background: 'none', border: `1px solid ${C.border}`,
                      color: projectLead ? C.text2 : C.text3,
                    }}
                  >
                    {projectLead ? (
                      <>
                        <span style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                          background: getProfileColor(projectLead.id), color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.58rem', fontWeight: 700,
                        }}>
                          {(projectLead.name ?? projectLead.email)[0].toUpperCase()}
                        </span>
                        {projectLead.name ?? projectLead.email}
                      </>
                    ) : (
                      '+ Prosjektleder'
                    )}
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                      <path d="M2 4L6 8L10 4" stroke={C.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {leadDropdownOpen && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 150,
                      background: C.surface2, border: `1px solid ${C.border}`,
                      borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      minWidth: 200, maxHeight: 260, overflowY: 'auto', padding: '4px 0',
                    }}>
                      {projectLead && (
                        <button
                          onClick={() => { handleSetLead(null); setLeadDropdownOpen(false) }}
                          style={{
                            width: '100%', textAlign: 'left',
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.73rem',
                            color: C.danger, background: 'none', border: 'none',
                            borderBottom: `1px solid ${C.border}`,
                            padding: '7px 14px', cursor: 'pointer',
                          }}
                        >
                          Fjern leder
                        </button>
                      )}
                      {profiles.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { handleSetLead(p.id); setLeadDropdownOpen(false) }}
                          style={{
                            width: '100%', textAlign: 'left',
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.73rem',
                            color: p.id === projectLead?.id ? C.accent : C.text,
                            background: 'none', border: 'none',
                            padding: '7px 14px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.bg}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
                        >
                          <span style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: getProfileColor(p.id), color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.65rem', fontWeight: 700,
                          }}>
                            {(p.name ?? p.email)[0].toUpperCase()}
                          </span>
                          {p.name ?? p.email}
                          {p.id === projectLead?.id && (
                            <span style={{ marginLeft: 'auto', color: C.accent, fontSize: '0.65rem' }}>✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
```

- [ ] **Steg 6: Gjør kundevalg-panelet alltid synlig**

Finn betingelsen som begrenser kundevalg-panelet (linje ~1109):

```tsx
              {(selectedTask.title === 'Redigering' || selectedTask.title === 'Redigering bilder') && selectionImages.length > 0 && (
```

Erstatt med:

```tsx
              {selectionImages.length > 0 && (
```

Finn også tittelen i samme blokk (linje ~1112–1113):

```tsx
                    <label style={{ ... }}>
                      Valgt av kunden ({selectionImages.length})
                    </label>
```

Erstatt teksten:

```tsx
                    <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Kundens bildevalg ({selectionImages.length})
                    </label>
```

- [ ] **Steg 7: Verifiser TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "postprod" | head -10
```

Forventet: ingen feil.

- [ ] **Steg 8: Commit**

```bash
git add "app/admin/postprod/[id]/page.tsx"
git commit -m "feat: add project lead widget and show customer selection on all postprod steps"
```

---

## Task 7: Prosjektleder-widget i `projects/[id]`

**Files:**
- Modify: `app/admin/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `setProjectLead` fra Task 5, `getProjectHub` returnerer nå `project.project_lead`

- [ ] **Steg 1: Importer `setProjectLead` og legg til `getProfileColor`**

Finn importlinjen øverst (linje 6):

```ts
import { getProjectHub, updateTaskStatus, getAllProfiles, toggleTaskAssignee, updateProjectDeliveryInfo, saveProjectMeetingNotes, analyzeProjectNotes, getContractStatus, sendTilbudToKunde, setProjectLead } from '@/lib/actions/pipeline'
```

Legg til `getProfileColor`-hjelper rett etter `const C = { ... }` blokken (etter linje 26):

```ts
const PROFILE_COLORS = ['#7C5CFC', '#4A9AC4', '#4CAF7D', '#F0A500', '#E8529A', '#E07C3A', '#50C8C8']
function getProfileColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff
  return PROFILE_COLORS[h % PROFILE_COLORS.length]
}
```

- [ ] **Steg 2: Legg til state og ref for prosjektleder**

Finn state-deklarasjonene i hoved-komponenten (rundt linje 564). Legg til:

```ts
  const [projectLead, setProjectLead_] = useState<{ id: string; name: string | null; email: string } | null>(null)
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false)
  const leadDropdownRef = useRef<HTMLDivElement>(null)
```

- [ ] **Steg 3: Initialiser `projectLead` fra `hub.project`**

Finn `useEffect` som kaller `getProjectHub` og setter state (rundt linje 600–630). Legg til én linje der `hub.project` brukes:

```ts
      setProjectLead_(hub.project.project_lead ?? null)
```

(Typisk etter `setProfiles(allProfiles)` eller lignende.)

- [ ] **Steg 4: Legg til `handleSetLead` og click-outside useEffect**

Legg til i komponenten (etter eksisterende useEffects):

```ts
  useEffect(() => {
    if (!leadDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (leadDropdownRef.current && !leadDropdownRef.current.contains(e.target as Node)) {
        setLeadDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [leadDropdownOpen])

  async function handleSetLead(profileId: string | null) {
    const prev = projectLead
    const profile = profileId ? profiles.find((p: { id: string; name: string | null; email: string }) => p.id === profileId) ?? null : null
    setProjectLead_(profile)
    const result = await setProjectLead(projectId, profileId)
    if (!result.ok) setProjectLead_(prev)
  }
```

- [ ] **Steg 5: Legg til widget i header-JSX**

Finn der `project.title` og `project.customer` vises i header-JSX (linje ~784). Legg til prosjektleder-widget rett etter kundenavnet. Widget-JSX er identisk med den i Task 6 Steg 5, bare bytt `leadDropdownRef` til riktig ref-navn og sørg for at `profiles`-typen matcher (`{ id: string; name: string | null; email: string }[]`).

```tsx
                {/* Prosjektleder */}
                <div style={{ position: 'relative', marginTop: 6 }} ref={leadDropdownRef}>
                  <button
                    onClick={() => setLeadDropdownOpen(v => !v)}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                      background: 'none', border: `1px solid ${C.border}`,
                      color: projectLead ? C.text2 : C.text3,
                    }}
                  >
                    {projectLead ? (
                      <>
                        <span style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                          background: getProfileColor(projectLead.id), color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.58rem', fontWeight: 700,
                        }}>
                          {(projectLead.name ?? projectLead.email)[0].toUpperCase()}
                        </span>
                        {projectLead.name ?? projectLead.email}
                      </>
                    ) : (
                      '+ Prosjektleder'
                    )}
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                      <path d="M2 4L6 8L10 4" stroke={C.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {leadDropdownOpen && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 150,
                      background: C.surface2, border: `1px solid ${C.border}`,
                      borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      minWidth: 200, maxHeight: 260, overflowY: 'auto', padding: '4px 0',
                    }}>
                      {projectLead && (
                        <button
                          onClick={() => { handleSetLead(null); setLeadDropdownOpen(false) }}
                          style={{
                            width: '100%', textAlign: 'left',
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.73rem',
                            color: C.danger, background: 'none', border: 'none',
                            borderBottom: `1px solid ${C.border}`,
                            padding: '7px 14px', cursor: 'pointer',
                          }}
                        >
                          Fjern leder
                        </button>
                      )}
                      {(profiles as { id: string; name: string | null; email: string }[]).map(p => (
                        <button
                          key={p.id}
                          onClick={() => { handleSetLead(p.id); setLeadDropdownOpen(false) }}
                          style={{
                            width: '100%', textAlign: 'left',
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.73rem',
                            color: p.id === projectLead?.id ? C.accent : C.text,
                            background: 'none', border: 'none',
                            padding: '7px 14px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.bg}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
                        >
                          <span style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: getProfileColor(p.id), color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.65rem', fontWeight: 700,
                          }}>
                            {(p.name ?? p.email)[0].toUpperCase()}
                          </span>
                          {p.name ?? p.email}
                          {p.id === projectLead?.id && (
                            <span style={{ marginLeft: 'auto', color: C.accent, fontSize: '0.65rem' }}>✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
```

- [ ] **Steg 6: Verifiser TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "projects/\[id\]" | head -10
```

Forventet: ingen feil.

- [ ] **Steg 7: Commit**

```bash
git add "app/admin/projects/[id]/page.tsx"
git commit -m "feat: add project lead widget to project detail page"
```

---

## Task 8: Prosjektleder-widget i `preprod/[id]`

**Files:**
- Modify: `app/admin/preprod/[id]/page.tsx`

**Interfaces:**
- Consumes: `setProjectLead` fra Task 5, `getPreprodDetail` returnerer nå `project.project_lead`

Preprod-siden har allerede `getProfileColor` og `PROFILE_COLORS` (linje 29–33), og `profiles` state (linje 961). Det som mangler er import av `setProjectLead`, lead state/ref, og widget-JSX.

- [ ] **Steg 1: Importer `setProjectLead`**

Finn import fra pipeline i `preprod/[id]/page.tsx`. Legg til `setProjectLead` i den:

```ts
import { ..., setProjectLead } from '@/lib/actions/pipeline'
```

(Sjekk eksisterende import øverst i filen og legg til `setProjectLead` der.)

- [ ] **Steg 2: Legg til state og ref**

Finn der `project` og `profiles` state deklareres (linje ~959–963). Legg til:

```ts
  const [projectLead, setProjectLead_] = useState<{ id: string; name: string | null; email: string } | null>(null)
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false)
  const leadDropdownRef = useRef<HTMLDivElement>(null)
```

- [ ] **Steg 3: Initialiser fra `detail.project`**

Finn `useEffect` som kaller `getPreprodDetail` (linje ~965–975). Legg til:

```ts
      setProjectLead_(detail.project.project_lead ?? null)
```

- [ ] **Steg 4: Legg til `handleSetLead` og click-outside useEffect**

Identisk med Task 7 Steg 4 — legg til etter eksisterende useEffects:

```ts
  useEffect(() => {
    if (!leadDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (leadDropdownRef.current && !leadDropdownRef.current.contains(e.target as Node)) {
        setLeadDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [leadDropdownOpen])

  async function handleSetLead(profileId: string | null) {
    const prev = projectLead
    const profile = profileId ? profiles.find(p => p.id === profileId) ?? null : null
    setProjectLead_(profile)
    const result = await setProjectLead(projectId, profileId)
    if (!result.ok) setProjectLead_(prev)
  }
```

(I preprod-siden finnes `projectId` som `id` fra `useParams`. Tilpass variabelnavnet til det som brukes i filen.)

- [ ] **Steg 5: Legg til widget i header-JSX**

Finn der `project.title` og `project.customer` vises (linje ~1023–1034). Legg til prosjektleder-widget rett etter. Bruk identisk JSX som Task 6 Steg 5 — bare med `profiles` (allerede riktig type i preprod).

- [ ] **Steg 6: Verifiser TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep "preprod" | head -10
```

Forventet: ingen feil.

- [ ] **Steg 7: Commit**

```bash
git add "app/admin/preprod/[id]/page.tsx"
git commit -m "feat: add project lead widget to preprod detail page"
```

---

## Selvsjekk mot spec

| Spec-krav | Task |
|---|---|
| Migrasjon `078_project_lead.sql` | Task 1 ✓ |
| `project_lead_id` og `project_lead` i typer | Task 2 ✓ |
| `notifyOnSelectionSubmit` — task-assignees fallback prosjektleder | Task 3 ✓ |
| `submitGallery` refaktorert til å bruke helper | Task 3 ✓ |
| `submitAlbumPicks` — varsel + marker task done | Task 4 ✓ |
| `setProjectLead` action | Task 5 ✓ |
| Oppdaterte queries i `getProjectHub`, `getPostProdProjects`, `getPreprodDetail` | Task 5 ✓ |
| Widget i `postprod/[id]` | Task 6 ✓ |
| Kundevalg alltid synlig i `postprod/[id]` | Task 6 ✓ |
| Widget i `projects/[id]` | Task 7 ✓ |
| Widget i `preprod/[id]` | Task 8 ✓ |
