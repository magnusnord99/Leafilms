# Se og lås opp tidligere pipeline-steg — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff open a pipeline stage page for a project that has already moved past that stage and see it read-only, with an explicit "lås opp" action (behind a confirmation dialog) to edit it anyway.

**Architecture:** A single ordering-based helper (`getStageAccess`) classifies each of the 5 stage-scoped pages as `not_yet_reached` / `current` / `past` relative to the project's actual `pipeline_stage`. `past` pages render normally but read-only, via a `readOnly?: boolean` prop threaded into every mutating handler/control, with a shared `PastStageBanner` component offering a session-local (unpersisted) unlock.

**Tech Stack:** Next.js App Router, React client components, Supabase (no schema changes), TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-01-pipeline-stage-history-lock-design.md`

## Global Constraints

- Scope is exactly 5 pages: `app/admin/projects/[id]/contact/page.tsx` (lead), `app/admin/preprod/[id]/page.tsx` (pre_prod), `app/admin/produksjon/[id]/page.tsx` (produksjon), `app/admin/postprod/[id]/page.tsx` (post_prod), `app/admin/faktura/[id]/page.tsx` (fakturert). No changes to the email page or the project-hub pitch/kontrakt tabs — they have no per-stage historical content to lock (see spec).
- Reuse the existing `readOnly?: boolean` (default `false`) prop convention from the boards system (`components/boards/BoardCanvas.tsx`) — do not invent a new name.
- Unlocking is **session-local React state only** — never persisted to the database, never sent to other users. Reverts to locked on reload/navigation.
- **No notifications** to other users when a past stage is unlocked/edited.
- **No changes to `lib/permissions.ts`** — `isPathAllowedForRole()` already runs at the layout level, independent of and before any of this logic. Verify it's unaffected, don't touch it.
- **Chat/messaging stays outside the lock everywhere** — the contact page's internal chat, `PreprodChat`, and `ProductionChat` remain fully interactive regardless of stage access. It's an ongoing conversation, not stage data.
- A stage-*transition* action (preprod's "→ Send til produksjon", faktura's "Send faktura" which auto-advances to `videresalg`) must render/execute **only** when `access === 'current'` — never from a `past` view, locked or unlocked.
- **No automated test runner exists in this repo** (confirmed: no `test` script in `package.json`, no vitest/jest config, no project `*.test.ts` files outside `node_modules`). Every task's verification step is `npx tsc --noEmit` + `npx eslint <touched files>`, plus a manual browser walkthrough — the same convention this session already used for the image-recategorization feature. Do not introduce a test framework as part of this plan.

---

### Task 1: Stage-access helper

**Files:**
- Create: `lib/pipeline-stage-lock.ts`

**Interfaces:**
- Produces: `type StageAccess = 'not_yet_reached' | 'current' | 'past'`, `function getStageAccess(pageStage: PipelineStage, projectStage: PipelineStage): StageAccess` — every later task imports this.

- [ ] **Step 1: Write the helper**

```ts
// lib/pipeline-stage-lock.ts
import { PIPELINE_STAGES, type PipelineStage } from './types'

const STAGE_ORDER = PIPELINE_STAGES.map(s => s.value)

export type StageAccess = 'not_yet_reached' | 'current' | 'past'

/**
 * Klassifiserer en stegside i forhold til prosjektets faktiske pipeline_stage,
 * ut fra rekkefølgen i PIPELINE_STAGES. Brukt av de 5 stegsidene (kontakt,
 * preprod, produksjon, postprod, faktura) til å avgjøre om siden skal
 * blokkere helt, vise seg normalt, eller vise seg skrivebeskyttet.
 */
export function getStageAccess(pageStage: PipelineStage, projectStage: PipelineStage): StageAccess {
  const pageIdx = STAGE_ORDER.indexOf(pageStage)
  const projectIdx = STAGE_ORDER.indexOf(projectStage)
  if (projectIdx < pageIdx) return 'not_yet_reached'
  if (projectIdx > pageIdx) return 'past'
  return 'current'
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors involving `lib/pipeline-stage-lock.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/pipeline-stage-lock.ts
git commit -m "Legg til getStageAccess-hjelper for pipeline-stegsider"
```

---

### Task 2: Shared `PastStageBanner` component

**Files:**
- Create: `components/admin/PastStageBanner.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (styling only).
- Produces: `export function PastStageBanner({ currentStageLabel, unlocked, onUnlock }: { currentStageLabel: string; unlocked: boolean; onUnlock: () => void })` — every page-integration task (4, 8 onward) renders this.

- [ ] **Step 1: Write the component**

```tsx
// components/admin/PastStageBanner.tsx
'use client'

import { C } from '@/lib/admin-theme'

// admin-theme mangler warning — samme verdi som resten av admin-sidene bruker lokalt
const WARNING = '#F0A500'

export function PastStageBanner({
  currentStageLabel, unlocked, onUnlock,
}: {
  currentStageLabel: string
  unlocked: boolean
  onUnlock: () => void
}) {
  if (unlocked) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
        background: 'rgba(240,165,0,0.1)', border: `1px solid ${WARNING}4D`,
        borderRadius: 6, marginBottom: 16,
      }}>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, color: WARNING }}>
          🔓 Redigerer et fullført steg
        </span>
      </div>
    )
  }

  function handleUnlockClick() {
    const ok = confirm(
      `Dette steget er fullført og prosjektet har gått videre til ${currentStageLabel}. Er du sikker på at du vil redigere det? Endringene lagres direkte.`
    )
    if (ok) onUnlock()
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 14px',
      background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, marginBottom: 16,
    }}>
      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
        🔒 Skrivebeskyttet · steget er fullført
      </span>
      <button
        onClick={handleUnlockClick}
        style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600,
          padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
          background: 'transparent', color: C.accent, border: '1px solid rgba(124,92,252,0.3)',
        }}
      >
        Lås opp for redigering
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/admin/PastStageBanner.tsx
git commit -m "Legg til PastStageBanner-komponent for skrivebeskyttet stegvisning"
```

---

### Task 3: `getPostProdProject` singular fetch

**Files:**
- Modify: `lib/actions/pipeline.ts` (add new function directly after `getPostProdProjects`, currently ending at line 789)

**Interfaces:**
- Consumes: nothing new (same imports already present in the file: `createClient`, `ProjectRow`, `ProjectWithPipeline`).
- Produces: `export async function getPostProdProject(id: string): Promise<(ProjectWithPipeline & { task_count: number; done_count: number }) | null>` — consumed by Task 11 (postprod page).

- [ ] **Step 1: Add the function**

Insert immediately after the closing `}` of `getPostProdProjects` (line 789 today — confirm with `grep -n "^export async function getPostProdProjects" lib/actions/pipeline.ts` first, the function ends at the next blank line before the `/**` comment for `createTask`):

```ts
/**
 * Henter ETT prosjekt uten filter på pipeline_stage — i motsetning til
 * getPostProdProjects() (som kun viser AKTIVE post-prod-prosjekter for
 * oversikten) brukes denne av [id]-siden for å kunne vise et prosjekt som
 * har gått forbi post-prod skrivebeskyttet, se
 * docs/superpowers/specs/2026-09-01-pipeline-stage-history-lock-design.md.
 */
export async function getPostProdProject(id: string): Promise<(ProjectWithPipeline & { task_count: number; done_count: number }) | null> {
  try {
    const supabase = await createClient()

    const { data: row, error } = await supabase
      .from('projects')
      .select(`*, customers(id, name, company), project_lead:profiles!project_lead_id(id, name, email)`)
      .eq('id', id)
      .single()

    if (error || !row) return null

    const { data: tasks } = await supabase
      .from('tasks')
      .select('status')
      .eq('project_id', id)
      .eq('pipeline_stage', 'post_prod')

    const task_count = tasks?.length ?? 0
    const done_count = tasks?.filter(t => t.status === 'done').length ?? 0

    return {
      ...(row as ProjectRow),
      customer: (row as ProjectRow).customers ?? null,
      customers: undefined,
      project_lead: (row as { project_lead?: ProjectWithPipeline['project_lead'] }).project_lead ?? null,
      task_count,
      done_count,
    } as ProjectWithPipeline & { task_count: number; done_count: number }
  } catch (err) {
    console.error('getPostProdProject error:', err)
    return null
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors involving `lib/actions/pipeline.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "Legg til getPostProdProject: uten stegfilter, for [id]-siden"
```

---

### Task 4: `RichNotesEditor` readOnly support

**Files:**
- Modify: `components/admin/RichNotesEditor.tsx`

**Interfaces:**
- Produces: new optional prop `readOnly?: boolean` (default `false`) on `RichNotesEditor` — consumed by Task 6 (contact page).

- [ ] **Step 1: Add the prop and wire it into Tiptap**

Change the import line (line 1):
```tsx
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
```
to:
```tsx
import { useEffect } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
```

Change the component signature (currently lines 69-79):
```tsx
export default function RichNotesEditor({
  value,
  onChange,
  placeholder,
  minHeight = 96,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}) {
```
to:
```tsx
export default function RichNotesEditor({
  value,
  onChange,
  placeholder,
  minHeight = 96,
  readOnly = false,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
  readOnly?: boolean
}) {
```

Change the `useEditor` call (currently lines 80-94) to set `editable` at creation:
```tsx
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: value,
    editable: !readOnly,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
    editorProps: {
      attributes: {
        style: `min-height:${minHeight}px; outline: none;`,
      },
    },
  })
```

Add a `useEffect` right after `if (!editor) return null` (currently line 96) to keep it reactive if `readOnly` changes after mount without remounting the editor:
```tsx
  if (!editor) return null

  editor.setEditable(!readOnly)
```

(Calling `setEditable` directly in the render body — not inside a `useEffect` — is safe and idiomatic for Tiptap: it's a synchronous, idempotent DOM-attribute toggle, not a side effect requiring cleanup.)

Change the render (currently lines 98-105) to hide the toolbar when read-only:
```tsx
  return (
    <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
      {!readOnly && <Toolbar editor={editor} />}
      <div style={{ padding: '10px 12px' }}>
        <EditorContent editor={editor} className="rich-notes-editor" />
      </div>
    </div>
  )
```

Remove the now-unused `useEffect` import if you added it but didn't end up needing it (you don't — `editor.setEditable` is called directly in the render body above, not in an effect; skip adding the `useEffect` import from the first sub-step).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors involving `components/admin/RichNotesEditor.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/admin/RichNotesEditor.tsx
git commit -m "Legg til readOnly-støtte i RichNotesEditor"
```

---

### Task 5: `LeadTaskPanel` readOnly support

**Files:**
- Modify: `components/admin/LeadTaskPanel.tsx`

**Interfaces:**
- Produces: new optional prop `readOnly?: boolean` (default `false`) on `LeadTaskPanel` — consumed by Task 6 (contact page). Existing `canCreate` prop is unchanged in meaning; the create-section now also requires `!readOnly`.

- [ ] **Step 1: Add `readOnly` to the exported component's props**

Change the signature (currently lines 138-143):
```tsx
export default function LeadTaskPanel({ projectId, leadId, assignedTo, canCreate }: {
  projectId: string
  leadId: string
  assignedTo: string | null
  canCreate: boolean
}) {
```
to:
```tsx
export default function LeadTaskPanel({ projectId, leadId, assignedTo, canCreate, readOnly = false }: {
  projectId: string
  leadId: string
  assignedTo: string | null
  canCreate: boolean
  readOnly?: boolean
}) {
```

- [ ] **Step 2: Gate the owner-picker button (currently lines 239-247)**

Change:
```tsx
          <button
            onClick={() => setOwnerOpen(v => !v)}
            style={{
```
to:
```tsx
          <button
            onClick={() => setOwnerOpen(v => !v)}
            disabled={readOnly}
            style={{
```

- [ ] **Step 3: Gate the status-toggle button (currently lines 325-338)**

Change:
```tsx
                  <button
                    onClick={() => handleStatus(task)}
                    title="Bytt status"
                    style={{
```
to:
```tsx
                  <button
                    onClick={() => handleStatus(task)}
                    disabled={readOnly}
                    title="Bytt status"
                    style={{
```

- [ ] **Step 4: Pass `readOnly` into the local `AssigneePicker` and gate its own trigger button**

Change the `AssigneePicker` invocation (currently line 352):
```tsx
                  <AssigneePicker task={task} profiles={profiles} onToggle={handleToggleAssignee} />
```
to:
```tsx
                  <AssigneePicker task={task} profiles={profiles} onToggle={handleToggleAssignee} readOnly={readOnly} />
```

Change the `AssigneePicker` function signature (currently lines 45-49):
```tsx
function AssigneePicker({ task, profiles, onToggle }: {
  task: Task
  profiles: Profile[]
  onToggle: (taskId: string, profileId: string) => void
}) {
```
to:
```tsx
function AssigneePicker({ task, profiles, onToggle, readOnly = false }: {
  task: Task
  profiles: Profile[]
  onToggle: (taskId: string, profileId: string) => void
  readOnly?: boolean
}) {
```

Change its trigger button (currently lines 64-73):
```tsx
      <button
        onClick={() => setOpen(v => !v)}
        title="Tildel oppgave"
        style={{
```
to:
```tsx
      <button
        onClick={() => setOpen(v => !v)}
        disabled={readOnly}
        title="Tildel oppgave"
        style={{
```

- [ ] **Step 5: Fold `readOnly` into the create-section visibility (currently line 359)**

Change:
```tsx
        {canCreate && (
```
to:
```tsx
        {canCreate && !readOnly && (
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors involving `components/admin/LeadTaskPanel.tsx`.

- [ ] **Step 7: Commit**

```bash
git add components/admin/LeadTaskPanel.tsx
git commit -m "Legg til readOnly-støtte i LeadTaskPanel"
```

---

### Task 6: Contact page (lead) integration

**Files:**
- Modify: `app/admin/projects/[id]/contact/page.tsx`

**Interfaces:**
- Consumes: `getStageAccess` (Task 1), `PastStageBanner` (Task 2), `RichNotesEditor`'s new `readOnly` prop (Task 4), `LeadTaskPanel`'s new `readOnly` prop (Task 5).
- Produces: nothing new for later tasks (leaf page).

- [ ] **Step 1: Add imports**

Add after the existing imports (currently ending at line 10):
```tsx
import { getStageAccess } from '@/lib/pipeline-stage-lock'
import { STAGE_LABEL } from '@/lib/pipeline-ui'
import { PastStageBanner } from '@/components/admin/PastStageBanner'
import type { PipelineStage } from '@/lib/types'
```

- [ ] **Step 2: Track `pipeline_stage` and add `unlocked` state**

Change the state declarations (currently line 47):
```tsx
  const [projectTitle, setProjectTitle] = useState<string | null>(null)
```
to:
```tsx
  const [projectTitle, setProjectTitle] = useState<string | null>(null)
  const [projectStage, setProjectStage] = useState<PipelineStage | null>(null)
  const [unlocked, setUnlocked] = useState(false)
```

Change the data-fetch effect (currently lines 76-88) to also store the stage:
```tsx
  useEffect(() => {
    Promise.all([
      getProjectHub(projectId),
      getLeadByProjectId(projectId),
    ]).then(([hub, leadData]) => {
      setProjectTitle(hub?.project.title ?? null)
      setProjectStage(hub?.project.pipeline_stage ?? null)
      setCustomer(hub?.project.customer ?? null)
      setLead(leadData)
      setNotes(notesToHtml(leadData?.notes ?? ''))
      setLoading(false)
    })
    fetchMessages()
  }, [projectId])
```

- [ ] **Step 3: Insert the access gate right after the loading check**

After the loading-state block (currently lines 136-142), insert:
```tsx
  const access = projectStage ? getStageAccess('lead', projectStage) : 'current'

  if (access === 'not_yet_reached') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
            Prosjektet har ikke nådd dette steget ennå
          </p>
          <Link href="/admin/pipeline" style={{ textDecoration: 'none' }}>
            <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
              ← Tilbake
            </button>
          </Link>
        </div>
      </div>
    )
  }

  const readOnly = access === 'past' && !unlocked
```

- [ ] **Step 4: Render the banner and pass `readOnly` down**

Insert right after the opening `<div style={{ maxWidth: 860, margin: '0 auto' }}>` (currently line 154), before the `{/* Breadcrumb */}` comment:
```tsx
        {access === 'past' && (
          <PastStageBanner
            currentStageLabel={projectStage ? STAGE_LABEL[projectStage] : ''}
            unlocked={unlocked}
            onUnlock={() => setUnlocked(true)}
          />
        )}
```

Gate the lead-status buttons — change (currently lines 198-212):
```tsx
                  <button
                    key={val}
                    onClick={() => handleStatusChange(val)}
                    style={{
```
to:
```tsx
                  <button
                    key={val}
                    onClick={() => handleStatusChange(val)}
                    disabled={readOnly}
                    style={{
```

Gate the notes editor — change (currently lines 317-321):
```tsx
                <RichNotesEditor
                  value={notes}
                  onChange={handleNotesChange}
                  placeholder="Legg til notater..."
                />
```
to:
```tsx
                <RichNotesEditor
                  value={notes}
                  onChange={handleNotesChange}
                  placeholder="Legg til notater..."
                  readOnly={readOnly}
                />
```

Gate `LeadTaskPanel` — change (currently lines 407-412):
```tsx
              <LeadTaskPanel
                projectId={projectId}
                leadId={lead.id}
                assignedTo={lead.assigned_to}
                canCreate={lead.status !== 'converted' && lead.status !== 'lost'}
              />
```
to:
```tsx
              <LeadTaskPanel
                projectId={projectId}
                leadId={lead.id}
                assignedTo={lead.assigned_to}
                canCreate={lead.status !== 'converted' && lead.status !== 'lost'}
                readOnly={readOnly}
              />
```

Chat (the "Intern chat" block, lines 431-510) is **not** gated — see Global Constraints.

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "app/admin/projects/[id]/contact/page.tsx"`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

Start the dev server (`npm run dev` if not already running) and in the browser:
1. Open `/admin/projects/<id>/contact` for a project actually in the `lead` stage — page renders exactly as before, no banner.
2. Temporarily set that project's `pipeline_stage` to e.g. `kontrakt` in Supabase (or use a project already further along) and reload — banner appears, status buttons/notes editor/task panel are disabled, chat still works.
3. Click "Lås opp for redigering" → confirm dialog appears → confirm → controls become editable, banner switches to "Redigerer et fullført steg".
4. Change a lead status while unlocked → reload the page → change persisted, banner is back to locked.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/projects/[id]/contact/page.tsx"
git commit -m "Vis kontakt-siden (lead) skrivebeskyttet for prosjekter som har gått videre"
```

---

### Task 7: `TaskList` readOnly support

**Files:**
- Modify: `components/task/TaskList.tsx`

**Interfaces:**
- Produces: new optional prop `readOnly?: boolean` (default `false`) — consumed by Task 9 (preprod page) and Task 11 (postprod page). No other consumers exist in the repo (verified: only preprod and postprod import this component).

- [ ] **Step 1: Add the prop**

Change the signature (currently lines 39-56):
```tsx
export function TaskList({
  tasks, profiles, onStatusChange, currentUserId, messageCounts, deepLinkTaskId,
  projectId, pipelineStage, onTaskCreated, onTaskDeleted, onAssigneesChange, onDueDateChange, emptyLabel,
}: {
  tasks: Task[]
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
  onStatusChange: (taskId: string, status: Task['status']) => void
  currentUserId: string | null
  messageCounts: Record<string, number>
  deepLinkTaskId: string | null
  projectId: string
  pipelineStage: PipelineStage
  onTaskCreated: (task: Task) => void
  onTaskDeleted: (taskId: string) => void
  onAssigneesChange: (taskId: string, assignees: Task['assignees']) => void
  onDueDateChange: (taskId: string, dueDate: string | null) => void
  emptyLabel?: string
}) {
```
to:
```tsx
export function TaskList({
  tasks, profiles, onStatusChange, currentUserId, messageCounts, deepLinkTaskId,
  projectId, pipelineStage, onTaskCreated, onTaskDeleted, onAssigneesChange, onDueDateChange, emptyLabel,
  readOnly = false,
}: {
  tasks: Task[]
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
  onStatusChange: (taskId: string, status: Task['status']) => void
  currentUserId: string | null
  messageCounts: Record<string, number>
  deepLinkTaskId: string | null
  projectId: string
  pipelineStage: PipelineStage
  onTaskCreated: (task: Task) => void
  onTaskDeleted: (taskId: string) => void
  onAssigneesChange: (taskId: string, assignees: Task['assignees']) => void
  onDueDateChange: (taskId: string, dueDate: string | null) => void
  emptyLabel?: string
  readOnly?: boolean
}) {
```

- [ ] **Step 2: Guard the three mutating handlers**

Change (currently lines 63-75):
```tsx
  async function handleAssigneeToggle(taskId: string, profileId: string) {
    setToggling(profileId)
```
to:
```tsx
  async function handleAssigneeToggle(taskId: string, profileId: string) {
    if (readOnly) return
    setToggling(profileId)
```

Change (currently lines 83-93):
```tsx
  async function handleAddTask() {
    const title = newTitle.trim()
    if (!title || creating) return
```
to:
```tsx
  async function handleAddTask() {
    if (readOnly) return
    const title = newTitle.trim()
    if (!title || creating) return
```

Change (currently lines 95-100):
```tsx
  async function handleDeleteTask(taskId: string) {
    setDeletingId(taskId)
```
to:
```tsx
  async function handleDeleteTask(taskId: string) {
    if (readOnly) return
    setDeletingId(taskId)
```

(`handleDueDateChange`, lines 77-81, is called directly from the `<input type="date">`'s `onChange` — gated at the input itself in the next step instead, since a disabled `<input>` never fires `onChange`.)

- [ ] **Step 3: Disable the interactive controls**

Change the status-toggle button (currently lines 127-135, add `disabled`):
```tsx
                <button
                  onClick={() => onStatusChange(task.id, STATUS_CYCLE[task.status])}
                  style={{
```
to:
```tsx
                <button
                  onClick={() => onStatusChange(task.id, STATUS_CYCLE[task.status])}
                  disabled={readOnly}
                  style={{
```

Change the assignee-picker-open button (currently lines 156-163):
```tsx
                  <button
                    onClick={() => setPickerOpenId(isOpen ? null : task.id)}
                    style={{
```
to:
```tsx
                  <button
                    onClick={() => setPickerOpenId(isOpen ? null : task.id)}
                    disabled={readOnly}
                    style={{
```

Change the due-date input (currently lines 175-187):
```tsx
                <input
                  type="date"
                  value={task.due_date ?? ''}
                  onChange={e => handleDueDateChange(task.id, e.target.value)}
                  title="Frist"
                  style={{
```
to:
```tsx
                <input
                  type="date"
                  value={task.due_date ?? ''}
                  onChange={e => handleDueDateChange(task.id, e.target.value)}
                  disabled={readOnly}
                  title="Frist"
                  style={{
```

Change the delete button (currently lines 199-201) to also fold in `readOnly`:
```tsx
                    onClick={() => handleDeleteTask(task.id)}
                    disabled={deletingId === task.id}
```
to:
```tsx
                    onClick={() => handleDeleteTask(task.id)}
                    disabled={readOnly || deletingId === task.id}
```

Change the per-assignee toggle button inside the picker (currently lines 225-228):
```tsx
                      <button
                        key={p.id}
                        onClick={() => handleAssigneeToggle(task.id, p.id)}
                        disabled={busy}
```
to:
```tsx
                      <button
                        key={p.id}
                        onClick={() => handleAssigneeToggle(task.id, p.id)}
                        disabled={readOnly || busy}
```

Change the "Legg til oppgave" input (currently lines 253-265) and button (currently lines 266-268):
```tsx
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddTask()}
          placeholder="Legg til oppgave..."
          style={{
```
to:
```tsx
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAddTask()}
          placeholder="Legg til oppgave..."
          disabled={readOnly}
          style={{
```
and:
```tsx
        <button
          onClick={handleAddTask}
          disabled={!newTitle.trim() || creating}
```
to:
```tsx
        <button
          onClick={handleAddTask}
          disabled={readOnly || !newTitle.trim() || creating}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors involving `components/task/TaskList.tsx`.

- [ ] **Step 5: Commit**

```bash
git add components/task/TaskList.tsx
git commit -m "Legg til readOnly-støtte i TaskList"
```

---

### Task 8: Preprod board family readOnly support (`PostProdBoard`, `PostProdTaskForm`, `PostProdLibraryPanel`)

**Files:**
- Modify: `app/admin/preprod/[id]/PostProdBoard.tsx`
- Modify: `app/admin/preprod/[id]/PostProdTaskForm.tsx`
- Modify: `app/admin/preprod/[id]/PostProdLibraryPanel.tsx`

**Interfaces:**
- Produces: new optional prop `readOnly?: boolean` (default `false`) on all three — consumed by Task 9 (preprod page). `PostProdBoard` passes its own `readOnly` down into the `PostProdTaskForm` and `PostProdLibraryPanel` it renders.

- [ ] **Step 1: `PostProdTaskForm` — add the prop and gate `handleAdd`**

Change the signature (currently lines 20-29):
```tsx
export function PostProdTaskForm({
  projectId, lanes, videoShared, videoTabs, profiles, onAdded,
}: {
  projectId: string
  lanes: PostProdBoardLane[]
  videoShared: PostProdBoardLane | null
  videoTabs: VideoDeliverableTab[] | null
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
  onAdded: () => void
}) {
```
to:
```tsx
export function PostProdTaskForm({
  projectId, lanes, videoShared, videoTabs, profiles, onAdded, readOnly = false,
}: {
  projectId: string
  lanes: PostProdBoardLane[]
  videoShared: PostProdBoardLane | null
  videoTabs: VideoDeliverableTab[] | null
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
  onAdded: () => void
  readOnly?: boolean
}) {
```

Change `handleAdd` (currently lines 61-63):
```tsx
  async function handleAdd() {
    const trimmed = title.trim()
    if (!trimmed || saving) return
```
to:
```tsx
  async function handleAdd() {
    if (readOnly) return
    const trimmed = title.trim()
    if (!trimmed || saving) return
```

Change the submit button (currently lines 129-131):
```tsx
      <button
        onClick={handleAdd}
        disabled={!title.trim() || saving}
```
to:
```tsx
      <button
        onClick={handleAdd}
        disabled={readOnly || !title.trim() || saving}
```

- [ ] **Step 2: `PostProdLibraryPanel` — add the prop and gate delete**

Change the signature (currently line 65):
```tsx
export function PostProdLibraryPanel({ refreshKey }: { refreshKey: number }) {
```
to:
```tsx
export function PostProdLibraryPanel({ refreshKey, readOnly = false }: { refreshKey: number; readOnly?: boolean }) {
```

Change the render to pass it to `LibraryCard` (currently lines 80-82):
```tsx
        {items.map(item => (
          <LibraryCard key={item.id} item={item} onDelete={id => setItems(prev => prev.filter(i => i.id !== id))} />
        ))}
```
to:
```tsx
        {items.map(item => (
          <LibraryCard key={item.id} item={item} onDelete={id => setItems(prev => prev.filter(i => i.id !== id))} readOnly={readOnly} />
        ))}
```

Change `LibraryCard`'s signature (currently line 22):
```tsx
function LibraryCard({ item, onDelete }: { item: PostProdLibraryItem; onDelete: (id: string) => void }) {
```
to:
```tsx
function LibraryCard({ item, onDelete, readOnly = false }: { item: PostProdLibraryItem; onDelete: (id: string) => void; readOnly?: boolean }) {
```

Change `handleDelete` (currently lines 26-32):
```tsx
  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(true)
```
to:
```tsx
  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (readOnly) return
    setDeleting(true)
```

Change its delete button (currently lines 48-51):
```tsx
      <button
        onClick={handleDelete}
        onPointerDown={e => e.stopPropagation()}
        disabled={deleting}
```
to:
```tsx
      <button
        onClick={handleDelete}
        onPointerDown={e => e.stopPropagation()}
        disabled={readOnly || deleting}
```

- [ ] **Step 3: `PostProdBoard` — add the prop, guard all mutating handlers, disable controls, pass down to children**

Change the signature (currently lines 71-80):
```tsx
export function PostProdBoard({
  projectId, shootEnd, postDeadlines, currentUserId, onDeadlineChange, onAssignedChange,
}: {
  projectId: string
  shootEnd: string | null
  postDeadlines: { video: string | null; photo: string | null }
  currentUserId: string | null
  onDeadlineChange: (subType: 'video' | 'photo', date: string | null) => void
  onAssignedChange: (hasAny: boolean) => void
}) {
```
to:
```tsx
export function PostProdBoard({
  projectId, shootEnd, postDeadlines, currentUserId, onDeadlineChange, onAssignedChange, readOnly = false,
}: {
  projectId: string
  shootEnd: string | null
  postDeadlines: { video: string | null; photo: string | null }
  currentUserId: string | null
  onDeadlineChange: (subType: 'video' | 'photo', date: string | null) => void
  onAssignedChange: (hasAny: boolean) => void
  readOnly?: boolean
}) {
```

Guard `handleDragEnd` (currently lines 129-131) — this single guard covers both drag branches (drag-from-library and reorder/move):
```tsx
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
```
to:
```tsx
  async function handleDragEnd(event: DragEndEvent) {
    if (readOnly) return
    const { active, over } = event
    if (!over) return
```

Guard `handleToggleAssignee` (currently lines 196-199):
```tsx
  async function handleToggleAssignee(taskId: string, profileId: string) {
    await toggleTaskAssignee(taskId, profileId)
```
to:
```tsx
  async function handleToggleAssignee(taskId: string, profileId: string) {
    if (readOnly) return
    await toggleTaskAssignee(taskId, profileId)
```

Guard `handleDueDate` (currently lines 201-204):
```tsx
  async function handleDueDate(taskId: string, date: string | null) {
    await updateTaskDueDate(taskId, date)
```
to:
```tsx
  async function handleDueDate(taskId: string, date: string | null) {
    if (readOnly) return
    await updateTaskDueDate(taskId, date)
```

Guard `handleDelete` (currently lines 206-209):
```tsx
  async function handleDelete(taskId: string) {
    await deleteTask(taskId)
```
to:
```tsx
  async function handleDelete(taskId: string) {
    if (readOnly) return
    await deleteTask(taskId)
```

Guard `handleSaveToLibrary` (currently lines 211-214):
```tsx
  async function handleSaveToLibrary(taskId: string) {
    await addTaskToLibrary(taskId)
```
to:
```tsx
  async function handleSaveToLibrary(taskId: string) {
    if (readOnly) return
    await addTaskToLibrary(taskId)
```

Guard `handleCreateLane` (currently lines 216-222):
```tsx
  async function handleCreateLane() {
    const trimmed = newLaneName.trim()
    if (!trimmed) return
```
to:
```tsx
  async function handleCreateLane() {
    if (readOnly) return
    const trimmed = newLaneName.trim()
    if (!trimmed) return
```

Guard `handleLaneDeadlineChange` (currently lines 248-256) — this covers `suggestDueDates` too since it's the only caller:
```tsx
  function handleLaneDeadlineChange(lane: PostProdBoardLane, value: string) {
    const date = value || null
```
to:
```tsx
  function handleLaneDeadlineChange(lane: PostProdBoardLane, value: string) {
    if (readOnly) return
    const date = value || null
```

Disable the per-card due-date input (currently lines 270-276):
```tsx
        <input
          type="date"
          value={card.dueDate ?? ''}
          onChange={e => handleDueDate(card.id, e.target.value || null)}
          title="Frist"
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: card.dueDate ? C.text2 : C.text3, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 5px', outline: 'none' }}
        />
```
to:
```tsx
        <input
          type="date"
          value={card.dueDate ?? ''}
          onChange={e => handleDueDate(card.id, e.target.value || null)}
          disabled={readOnly}
          title="Frist"
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: card.dueDate ? C.text2 : C.text3, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 5px', outline: 'none' }}
        />
```

Disable the card's assignee/save/delete buttons (currently lines 280, 292, 295):
```tsx
        <button onClick={() => setOpenAssigneeFor(isOpen ? null : card.id)} title="Tildel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0 }}>
```
to:
```tsx
        <button onClick={() => setOpenAssigneeFor(isOpen ? null : card.id)} disabled={readOnly} title="Tildel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0 }}>
```
```tsx
        <button onClick={() => handleSaveToLibrary(card.id)} title="Lagre i bibliotek" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0, fontSize: '0.7rem' }}>
```
to:
```tsx
        <button onClick={() => handleSaveToLibrary(card.id)} disabled={readOnly} title="Lagre i bibliotek" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0, fontSize: '0.7rem' }}>
```
```tsx
        <button onClick={() => handleDelete(card.id)} title="Slett" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0 }}>
```
to:
```tsx
        <button onClick={() => handleDelete(card.id)} disabled={readOnly} title="Slett" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0 }}>
```

Disable the lane-deadline input (currently lines 340-345):
```tsx
            <input
              type="date"
              value={laneDeadlineValue(lane)}
              onChange={e => handleLaneDeadlineChange(lane, e.target.value)}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 6px', outline: 'none' }}
            />
```
to:
```tsx
            <input
              type="date"
              value={laneDeadlineValue(lane)}
              onChange={e => handleLaneDeadlineChange(lane, e.target.value)}
              disabled={readOnly}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 6px', outline: 'none' }}
            />
```

Disable the "Ny lane" input and button (currently lines 405-419):
```tsx
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
```
to:
```tsx
        <input
          value={newLaneName}
          onChange={e => setNewLaneName(e.target.value)}
          placeholder="Ny lane, f.eks. Animasjon"
          disabled={readOnly}
          style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', outline: 'none' }}
        />
        <button
          onClick={handleCreateLane}
          disabled={readOnly || !newLaneName.trim()}
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: newLaneName.trim() ? 'pointer' : 'not-allowed', background: 'transparent', color: C.text3, border: `1px solid ${C.border}` }}
        >
          + Ny lane
        </button>
```

Pass `readOnly` down to the two children (currently lines 421-430):
```tsx
      <PostProdLibraryPanel refreshKey={libraryRefreshKey} />

      <PostProdTaskForm
        projectId={projectId}
        lanes={board.lanes}
        videoShared={board.videoShared}
        videoTabs={board.videoTabs}
        profiles={profiles}
        onAdded={refetch}
      />
```
to:
```tsx
      <PostProdLibraryPanel refreshKey={libraryRefreshKey} readOnly={readOnly} />

      <PostProdTaskForm
        projectId={projectId}
        lanes={board.lanes}
        videoShared={board.videoShared}
        videoTabs={board.videoTabs}
        profiles={profiles}
        onAdded={refetch}
        readOnly={readOnly}
      />
```

Note: drag-and-drop remains visually draggable when `readOnly` (the `useSortable`/`useDraggable` listeners aren't removed) — dropping is a no-op via the `handleDragEnd` guard above. This is an accepted v1 gap per the spec (guard-at-handler is the baseline; visual drag-affordance removal is not required).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors in the three modified files.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/preprod/[id]/PostProdBoard.tsx" "app/admin/preprod/[id]/PostProdTaskForm.tsx" "app/admin/preprod/[id]/PostProdLibraryPanel.tsx"
git commit -m "Legg til readOnly-støtte i preprodens post-prod-brett-familie"
```

---

### Task 9: Preprod page (pre_prod) integration

**Files:**
- Modify: `app/admin/preprod/[id]/page.tsx`

**Interfaces:**
- Consumes: `getStageAccess` (Task 1), `PastStageBanner` (Task 2), `TaskList`'s `readOnly` (Task 7), `PostProdBoard`'s `readOnly` (Task 8).
- Produces: nothing new for later tasks (leaf page).

- [ ] **Step 1: Add imports**

Add after the existing imports (currently ending at line 18):
```tsx
import { getStageAccess } from '@/lib/pipeline-stage-lock'
import { STAGE_LABEL } from '@/lib/pipeline-ui'
import { PastStageBanner } from '@/components/admin/PastStageBanner'
```

- [ ] **Step 2: Add `readOnly` prop to the 4 local mutating components**

`MoodboardCard` (currently lines 60-64) — add prop and guard `toggleDone` (currently lines 65-69):
```tsx
function MoodboardCard({
  url, done, projectId, onChange,
}: {
  url: string; done: boolean; projectId: string; onChange: (patch: Partial<PreprodData>) => void
}) {
  function toggleDone() {
    const next = !done
    onChange({ millanote_done: next })
    updatePreprodData(projectId, { millanote_done: next })
  }
```
to:
```tsx
function MoodboardCard({
  url, done, projectId, onChange, readOnly = false,
}: {
  url: string; done: boolean; projectId: string; onChange: (patch: Partial<PreprodData>) => void; readOnly?: boolean
}) {
  function toggleDone() {
    if (readOnly) return
    const next = !done
    onChange({ millanote_done: next })
    updatePreprodData(projectId, { millanote_done: next })
  }
```
Then disable its checkbox (currently lines 96-101):
```tsx
        <input
          type="checkbox"
          checked={done}
          onChange={toggleDone}
          style={{ width: 14, height: 14, accentColor: C.success, cursor: 'pointer' }}
        />
```
to:
```tsx
        <input
          type="checkbox"
          checked={done}
          onChange={toggleDone}
          disabled={readOnly}
          style={{ width: 14, height: 14, accentColor: C.success, cursor: 'pointer' }}
        />
```

`PackingSection` (currently lines 326-340) — add prop and guard the shared `save` helper (currently lines 359-362), which every mutating function in this component (`addItem`, `toggleItem`, `removeItem`, `assignItem`, `importFromQuote`) calls through:
```tsx
function PackingSection({
  projectId, freetextItems, quoteEquipment, storageUnits, prodCrew, profiles, currentUserId,
  onFreetextChange, onAssignUnit, onTogglePacked,
}: {
```
to:
```tsx
function PackingSection({
  projectId, freetextItems, quoteEquipment, storageUnits, prodCrew, profiles, currentUserId,
  onFreetextChange, onAssignUnit, onTogglePacked, readOnly = false,
}: {
```
(add `readOnly?: boolean` to the closing type block that follows, after `onTogglePacked: (unitId: string) => void`)
```tsx
  function save(next: PackingItem[]) {
    onFreetextChange(next)
    updatePreprodData(projectId, { packing_list: next })
  }
```
to:
```tsx
  function save(next: PackingItem[]) {
    if (readOnly) return
    onFreetextChange(next)
    updatePreprodData(projectId, { packing_list: next })
  }
```
`onAssignUnit`/`onTogglePacked` are callback props delegating to the parent page's `handleAssignUnit`/`handleTogglePacked` (Step 4 below guards those at the source). This component's own JSX also needs its "add item" input/button, `AssigneePicker` instances, and the packed-toggle controls disabled — locate them via `grep -n "onClick=\|<input\|<AssigneePicker" "app/admin/preprod/[id]/page.tsx" | sed -n '/^3[3-9][0-9]:/,/^5[0-9][0-9]:/p'` (the PackingSection render body, roughly lines 399-570) and add `disabled={readOnly}` to each interactive element the same way as the examples above — this component's render wasn't fully reproduced here due to length; apply the identical `disabled={readOnly}` / early-`return` pattern established in this task's other components.

`CrewSection` (currently lines 573-583) — add prop and guard its 4 mutating functions individually (they don't share a helper):
```tsx
function CrewSection({
  title, crew, projectId, field, profiles, onChange, onCrewAdded,
}: {
```
to:
```tsx
function CrewSection({
  title, crew, projectId, field, profiles, onChange, onCrewAdded, readOnly = false,
}: {
```
(add `readOnly?: boolean` to the closing type block, after `onCrewAdded?: (updated: PreprodCrewMember[]) => void`)

Guard each (currently lines 594, 609, 622, 636):
```tsx
  async function importFromPitch() {
    setImporting(true)
```
→
```tsx
  async function importFromPitch() {
    if (readOnly) return
    setImporting(true)
```
```tsx
  function addCrew() {
    if (!selectedId) return
```
→
```tsx
  function addCrew() {
    if (readOnly || !selectedId) return
```
```tsx
  function remove(profileId: string) {
    const next = crew.filter(c => c.profile_id !== profileId)
```
→
```tsx
  function remove(profileId: string) {
    if (readOnly) return
    const next = crew.filter(c => c.profile_id !== profileId)
```
```tsx
  function saveEdit() {
    if (!editingId || !editSelectedId) return
```
→
```tsx
  function saveEdit() {
    if (readOnly || !editingId || !editSelectedId) return
```
This component's "import from pitch" / "add crew" / "remove" / "edit" buttons (rendered after line 649) also need `disabled={readOnly}` added the same way as the examples above — locate via `grep -n "onClick=" "app/admin/preprod/[id]/page.tsx" | sed -n '/^6[5-9][0-9]:/,/^8[0-2][0-9]:/p'`.

`InvoiceAssigneeCard` (currently lines 822-830) — add prop and guard `select` (currently lines 847-853):
```tsx
function InvoiceAssigneeCard({
  projectId,
  currentAssigneeId,
  profiles,
}: {
```
to:
```tsx
function InvoiceAssigneeCard({
  projectId,
  currentAssigneeId,
  profiles,
  readOnly = false,
}: {
```
(add `readOnly?: boolean` to the closing type block, after `profiles: ...`)
```tsx
  async function select(profileId: string | null) {
    setSaving(true)
```
to:
```tsx
  async function select(profileId: string | null) {
    if (readOnly) return
    setSaving(true)
```
Disable the trigger button (currently lines 869-876):
```tsx
          <button
            onClick={() => setOpen(v => !v)}
            disabled={saving}
```
to:
```tsx
          <button
            onClick={() => setOpen(v => !v)}
            disabled={readOnly || saving}
```

- [ ] **Step 3: Replace the access gate**

Replace the existing block (currently lines 1065-1078):
```tsx
  if (project.pipeline_stage !== 'pre_prod') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
            Prosjektet er ikke lenger i pre-produksjon
          </p>
          <button onClick={() => router.push('/admin/preprod')} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
            ← Tilbake
          </button>
        </div>
      </div>
    )
  }
```
with:
```tsx
  const access = getStageAccess('pre_prod', project.pipeline_stage)

  if (access === 'not_yet_reached') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
            Prosjektet har ikke nådd pre-produksjon ennå
          </p>
          <button onClick={() => router.push('/admin/preprod')} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
            ← Tilbake
          </button>
        </div>
      </div>
    )
  }

  const readOnly = access === 'past' && !unlocked
```

- [ ] **Step 4: Add `unlocked` state**

Add near the top of the component's state declarations (right after the line declaring `const params = useParams<{ id: string }>()` or equivalent — locate the first `useState` line in the component body, currently starting a few lines after line 921):
```tsx
  const [unlocked, setUnlocked] = useState(false)
```

- [ ] **Step 5: Render the banner, hide the advance button behind `access === 'current'`**

Insert the banner right after the header's stage-badge row closes and before the "→ Send til produksjon" button (currently between lines 1106 and 1107 — the row containing the "Pre-produksjon" badge span):

Replace (currently lines 1104-1118):
```tsx
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#4A9EFF', background: 'rgba(74,158,255,0.1)', border: '1px solid rgba(74,158,255,0.25)', padding: '3px 10px', borderRadius: 5 }}>
              Pre-produksjon
            </span>
            <button
              onClick={handleAdvanceToProduction}
              disabled={advancing}
              style={{
                marginLeft: 'auto', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                padding: '7px 16px', borderRadius: 7, cursor: advancing ? 'default' : 'pointer',
                background: C.accent, color: '#fff', border: 'none',
                opacity: advancing ? 0.6 : 1, transition: 'opacity 0.15s',
              }}
            >
              {advancing ? 'Sender...' : '→ Send til produksjon'}
            </button>
```
with:
```tsx
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#4A9EFF', background: 'rgba(74,158,255,0.1)', border: '1px solid rgba(74,158,255,0.25)', padding: '3px 10px', borderRadius: 5 }}>
              Pre-produksjon
            </span>
            {access === 'current' && (
              <button
                onClick={handleAdvanceToProduction}
                disabled={advancing}
                style={{
                  marginLeft: 'auto', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                  padding: '7px 16px', borderRadius: 7, cursor: advancing ? 'default' : 'pointer',
                  background: C.accent, color: '#fff', border: 'none',
                  opacity: advancing ? 0.6 : 1, transition: 'opacity 0.15s',
                }}
              >
                {advancing ? 'Sender...' : '→ Send til produksjon'}
              </button>
            )}
```

Then, immediately after the closing `</div>` of the header block (the div that opened at line 1094, `{/* Header */}`), insert:
```tsx
        {access === 'past' && (
          <PastStageBanner
            currentStageLabel={STAGE_LABEL[project.pipeline_stage]}
            unlocked={unlocked}
            onUnlock={() => setUnlocked(true)}
          />
        )}
```

- [ ] **Step 6: Thread `readOnly` into the 9 rendered components**

In the render tree (currently lines 1216-1290), add `readOnly={readOnly}` to each of these existing invocations:
- `<TaskList ... />` (line ~1216)
- `<CrewSection ... />` (line ~1233, and any second `<CrewSection>` if the file renders more than one — check with `grep -n "<CrewSection" "app/admin/preprod/[id]/page.tsx"`)
- `<PostProdBoard ... />` (line ~1244)
- `<MoodboardCard ... />` (line ~1262)
- `<PackingSection ... />` (line ~1268)
- `<InvoiceAssigneeCard ... />` (line ~1280)

`<PreprodChat ... />` (line ~1290) is **not** gated — see Global Constraints.

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "app/admin/preprod/[id]/page.tsx"`
Expected: no new errors.

- [ ] **Step 8: Manual verification**

1. Open `/admin/preprod/<id>` for a project actually in `pre_prod` — unchanged, fully editable, "→ Send til produksjon" visible.
2. Open it for a project that has moved to `produksjon` or later — banner appears, all tested controls (moodboard checkbox, packing list add/toggle/remove, crew add/remove, invoice-assignee picker, task list, post-prod board add-lane/add-task/drag) are inert, advance button is gone.
3. Unlock → confirm dialog → confirm → make one change in each of the 4 local components + the task list + the board → verify each persists after reload (then re-locks on reload).
4. Open it for a project still in an earlier stage than `pre_prod` (e.g. `kontrakt`) — unchanged "ikke nådd" block screen.

- [ ] **Step 9: Commit**

```bash
git add "app/admin/preprod/[id]/page.tsx"
git commit -m "Vis pre-produksjon skrivebeskyttet for prosjekter som har gått videre"
```

---

### Task 10: Produksjon page integration

**Files:**
- Modify: `app/admin/produksjon/[id]/page.tsx`
- Modify: `lib/actions/production-chat.ts`

**Interfaces:**
- Consumes: `getStageAccess` (Task 1), `PastStageBanner` (Task 2).
- Produces: nothing new for later tasks (leaf page). Extends `ProductionInfo` with `pipelineStage: PipelineStage`.

- [ ] **Step 1: Add `pipeline_stage` to `getProductionInfo`**

In `lib/actions/production-chat.ts`, change the type (currently lines 12-20):
```ts
export type ProductionInfo = {
  id: string
  title: string
  shootStart: string | null
  shootEnd: string | null
  shootConfirmed: boolean
  customer: { name: string; email: string | null; phone: string | null; address: string | null } | null
  projectLead: { id: string; name: string | null; email: string } | null
}
```
to:
```ts
export type ProductionInfo = {
  id: string
  title: string
  shootStart: string | null
  shootEnd: string | null
  shootConfirmed: boolean
  customer: { name: string; email: string | null; phone: string | null; address: string | null } | null
  projectLead: { id: string; name: string | null; email: string } | null
  pipelineStage: PipelineStage
}
```
Add the import (top of file, alongside the existing imports):
```ts
import type { PipelineStage } from '@/lib/types'
```
Change the query's `.select(...)` (currently lines 29-33) to also fetch `pipeline_stage`:
```ts
      .select(`
        id, title, shoot_start, shoot_end, shoot_confirmed, pipeline_stage,
        customers (name, email, phone, address),
        project_lead:profiles!project_lead_id (id, name, email)
      `)
```
Change the return object (currently lines 42-50):
```ts
    return {
      id: project.id,
      title: project.title,
      shootStart: project.shoot_start,
      shootEnd: project.shoot_end,
      shootConfirmed: !!project.shoot_confirmed,
      customer,
      projectLead,
    }
```
to:
```ts
    return {
      id: project.id,
      title: project.title,
      shootStart: project.shoot_start,
      shootEnd: project.shoot_end,
      shootConfirmed: !!project.shoot_confirmed,
      customer,
      projectLead,
      pipelineStage: project.pipeline_stage,
    }
```

- [ ] **Step 2: Add imports to the page**

Add after the existing imports (currently ending at line 10):
```tsx
import { getStageAccess } from '@/lib/pipeline-stage-lock'
import { STAGE_LABEL } from '@/lib/pipeline-ui'
import { PastStageBanner } from '@/components/admin/PastStageBanner'
```

- [ ] **Step 3: Add `unlocked` state**

Change (currently line 40):
```tsx
  const [allProfiles, setAllProfiles] = useState<ConversationParticipant[]>([])
```
to:
```tsx
  const [allProfiles, setAllProfiles] = useState<ConversationParticipant[]>([])
  const [unlocked, setUnlocked] = useState(false)
```

- [ ] **Step 4: Insert the gate after the existing "not found" block**

After the existing block (currently lines 68-79, the `if (!info || !conversationId || !currentUser)` check), insert:
```tsx
  const access = getStageAccess('produksjon', info.pipelineStage)

  if (access === 'not_yet_reached') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
            Prosjektet har ikke nådd produksjon ennå
          </p>
          <button onClick={() => router.push('/admin/pipeline')} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
            ← Tilbake
          </button>
        </div>
      </div>
    )
  }
```

- [ ] **Step 5: Render the banner**

Insert right after the opening `<div style={{ maxWidth: 1100, margin: '0 auto' }}>` (currently line 89), before the breadcrumb row:
```tsx
        {access === 'past' && (
          <PastStageBanner
            currentStageLabel={STAGE_LABEL[info.pipelineStage]}
            unlocked={unlocked}
            onUnlock={() => setUnlocked(true)}
          />
        )}
```

No controls need gating on this page beyond the banner itself — the only interactive element (`ProductionChat`) is explicitly excluded per Global Constraints, and there are no other mutating actions here today.

- [ ] **Step 6: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "app/admin/produksjon/[id]/page.tsx" lib/actions/production-chat.ts`
Expected: no new errors.

- [ ] **Step 7: Manual verification**

1. Open `/admin/produksjon/<id>` for a project actually in `produksjon` — unchanged, no banner.
2. Open it for a project in `post_prod` or later — banner appears; chat still fully works.
3. Open it for a project still in `pre_prod` — new "ikke nådd" block screen (this is a genuinely new restriction here — confirm it doesn't break any current UI flow that expects to reach this page early, by checking `getStageHref` in `lib/pipeline-ui.ts` only ever links here when `stage === 'produksjon'`).

- [ ] **Step 8: Commit**

```bash
git add "app/admin/produksjon/[id]/page.tsx" lib/actions/production-chat.ts
git commit -m "Vis produksjon-siden skrivebeskyttet/blokkert basert på stegtilgang"
```

---

### Task 11: Postprod page (post_prod) integration

**Files:**
- Modify: `app/admin/postprod/[id]/page.tsx`

**Interfaces:**
- Consumes: `getStageAccess` (Task 1), `PastStageBanner` (Task 2), `TaskList`'s `readOnly` (Task 7), `getPostProdProject` (Task 3).
- Produces: nothing new for later tasks (leaf page).

- [ ] **Step 1: Add imports**

Add after the existing imports (currently ending at line 25):
```tsx
import { getPostProdProject } from '@/lib/actions/pipeline'
import { getStageAccess } from '@/lib/pipeline-stage-lock'
import { STAGE_LABEL } from '@/lib/pipeline-ui'
import { PastStageBanner } from '@/components/admin/PastStageBanner'
```
(`getPostProdProject` joins the existing `getPostProdProjects, getTasksForProject, ...` import list from `@/lib/actions/pipeline` at the top of the file — add it into that same `import { ... } from '@/lib/actions/pipeline'` block rather than a separate statement.)

- [ ] **Step 2: Add `viewedProject` and `unlocked` state**

Change (currently line 199):
```tsx
  const [projects, setProjects] = useState<PostProdProject[]>([])
```
to:
```tsx
  const [projects, setProjects] = useState<PostProdProject[]>([])
  const [viewedProject, setViewedProject] = useState<PostProdProject | null>(null)
  const [unlocked, setUnlocked] = useState(false)
```

- [ ] **Step 3: Fetch the singular project alongside the filtered list in `fetchAll`**

Change (currently lines 315-327):
```tsx
  async function fetchAll() {
    setLoading(true)
    setSeedError(null)

    const [allProjects, projectTasks, userProfile, allProfiles, delivSection, selImgs, gallerySumm] = await Promise.all([
      getPostProdProjects(),
      getTasksForProject(projectId, 'post_prod'),
      getCurrentUserProfile(),
      getAllProfiles(),
      getProjectDeliverablesSection(projectId),
      getSelectedImagesForProject(projectId),
      getGalleryIdForProject(projectId),
    ])
```
to:
```tsx
  async function fetchAll() {
    setLoading(true)
    setSeedError(null)

    const [allProjects, viewedProj, projectTasks, userProfile, allProfiles, delivSection, selImgs, gallerySumm] = await Promise.all([
      getPostProdProjects(),
      getPostProdProject(projectId),
      getTasksForProject(projectId, 'post_prod'),
      getCurrentUserProfile(),
      getAllProfiles(),
      getProjectDeliverablesSection(projectId),
      getSelectedImagesForProject(projectId),
      getGalleryIdForProject(projectId),
    ])
    setViewedProject(viewedProj)
```

Then, in the same function, change every subsequent `const currentProj = allProj.find(p => p.id === projectId)` (currently line 334) to fall back to `viewedProj`:
```tsx
    const currentProj = allProj.find(p => p.id === projectId)
```
to:
```tsx
    const currentProj = allProj.find(p => p.id === projectId) ?? viewedProj
```

- [ ] **Step 4: Update the two other reads of `projects.find(p => p.id === projectId)` outside `fetchAll`**

Change (currently line 298):
```tsx
  const isMixed = projects.find(p => p.id === projectId)?.project_type === 'mixed'
  const videoDeliverables = ((projects.find(p => p.id === projectId)?.deliverables ?? []) as SignedDeliverableItem[])
```
to:
```tsx
  const viewedOrListedProject = projects.find(p => p.id === projectId) ?? viewedProject
  const isMixed = viewedOrListedProject?.project_type === 'mixed'
  const videoDeliverables = ((viewedOrListedProject?.deliverables ?? []) as SignedDeliverableItem[])
```

Change the render-time lookup (currently line 728):
```tsx
  const currentProject = projects.find(p => p.id === projectId)
```
to:
```tsx
  const currentProject = viewedOrListedProject
```

(All other reads of `currentProject` later in the render — lines 744, 802, 848, 856-858, 949-975, 1329, 1523, 2055-2063 — are unchanged; they already read from this single `currentProject` binding.)

- [ ] **Step 5: Replace the "not found" gate with the 3-state gate**

Replace (currently lines 729-742):
```tsx
  if (!currentProject) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
            Prosjektet er ikke lenger i post-produksjon
          </p>
          <button onClick={() => router.push('/admin/postprod')} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
            ← Tilbake
          </button>
        </div>
      </div>
    )
  }
```
with:
```tsx
  if (!currentProject) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
            Fant ikke prosjektet
          </p>
          <button onClick={() => router.push('/admin/postprod')} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
            ← Tilbake
          </button>
        </div>
      </div>
    )
  }

  const access = getStageAccess('post_prod', currentProject.pipeline_stage)

  if (access === 'not_yet_reached') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
            Prosjektet har ikke nådd post-produksjon ennå
          </p>
          <button onClick={() => router.push('/admin/postprod')} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
            ← Tilbake
          </button>
        </div>
      </div>
    )
  }

  const readOnly = access === 'past' && !unlocked
```

- [ ] **Step 6: Render the banner**

Insert right after line 843 (the `</div>` closing the breadcrumb + prev/next-navigation row) and before line 844 (the title/customer/lead row):
```tsx
            {access === 'past' && (
              <PastStageBanner
                currentStageLabel={STAGE_LABEL[currentProject.pipeline_stage]}
                unlocked={unlocked}
                onUnlock={() => setUnlocked(true)}
              />
            )}
```

- [ ] **Step 7: Guard the mutating handlers**

Add `if (readOnly) return` as the first line inside each of the following (exact current signatures — locate each by `grep -n "^  async function handle\|^  function handle" "app/admin/postprod/[id]/page.tsx"` to confirm current line numbers before editing, since earlier edits in this task shift them):

`handleSetLead`, `handleDeleteSelectionComment`, `handleDueDateChange`, `handleLinkChange`, `handleNotesChange`, `handleAdvance`, `handleReject`, `handleGoBack`, `handleToggleAssignee`, `handleCustomTaskStatusChange`, `handleDeleteStepperTask`, `handleSelectType`, `handleOpenDeliveryReview`, `handleReseed`.

Worked example for the two most-used ones:
```tsx
  async function handleAdvance(taskId: string, to: 'in_progress' | 'done') {
```
becomes:
```tsx
  async function handleAdvance(taskId: string, to: 'in_progress' | 'done') {
    if (readOnly) return
```
(insert as the new first line of the function body, before whatever currently comes first)

```tsx
  async function handleReject() {
```
becomes:
```tsx
  async function handleReject() {
    if (readOnly) return
```

Apply the identical one-line guard to the remaining 12 handlers listed above.

Do **not** guard `handleSelectTask`, `handleSwitchTab`, `handleSwitchVideoTab` — these only change local view state (which task/tab is displayed), not project data, and must stay usable while read-only so the page remains browsable.

`handleCustomTaskCreated`, `handleCustomTaskAssigneesChange`, `handleCustomTaskDueDateChange`, `handleCustomTaskDeleted` also do **not** need a guard — they're passed as `onTaskCreated`/`onAssigneesChange`/`onDueDateChange`/`onTaskDeleted` callbacks into `<TaskList>` (Step 9 below), which only calls them after its own already-`readOnly`-gated mutation succeeds.

- [ ] **Step 8: Disable the primary action buttons**

Extend the `disabled` prop on each of the following (currently lines 1848-1849, 1943-1944, 1966, 1981-1982, 1996-1997, 1909-1910, 1920-1921, 2016):
```tsx
                        disabled={togglingId === selectedTask.id}
```
→ (every occurrence of exactly this expression, 5 of them — "Godkjent", "Sett i gang" ×2, "Merk som ferdig ✓", "Marker som fullført manuelt", "Gå tilbake"):
```tsx
                        disabled={readOnly || togglingId === selectedTask.id}
```
```tsx
                        disabled={rejecting}
```
→ (both occurrences — "Avbryt" and "Send tilbake til klipping" inside the rejection form):
```tsx
                        disabled={readOnly || rejecting}
```

Disable the two textareas — the task-notes textarea (currently lines 1822-1824):
```tsx
                <textarea
                  value={notes[selectedTask.id] ?? ''}
                  onChange={e => handleNotesChange(selectedTask.id, e.target.value)}
```
to:
```tsx
                <textarea
                  value={notes[selectedTask.id] ?? ''}
                  onChange={e => handleNotesChange(selectedTask.id, e.target.value)}
                  disabled={readOnly}
```
and the rejection-note textarea (currently lines 1883-1886):
```tsx
                      <textarea
                        autoFocus
                        value={rejectionNote}
                        onChange={e => { setRejectionNote(e.target.value); setRejectionNoteError(false) }}
```
to:
```tsx
                      <textarea
                        autoFocus
                        value={rejectionNote}
                        onChange={e => { setRejectionNote(e.target.value); setRejectionNoteError(false) }}
                        disabled={readOnly}
```

Also add `disabled={readOnly}` to the "✗ Ikke godkjent" button (currently lines 1862-1864, which opens the rejection form and has no existing `disabled` prop):
```tsx
                      <button
                        onClick={() => { setShowRejectionForm(true); setRejectionNote(''); setRejectionNoteError(false) }}
                        style={{
```
to:
```tsx
                      <button
                        onClick={() => { setShowRejectionForm(true); setRejectionNote(''); setRejectionNoteError(false) }}
                        disabled={readOnly}
                        style={{
```

Secondary/inline controls elsewhere on the page (per-task link inputs driven by `TASK_LINK_FIELDS`, the reseed button, the lead-assignment dropdown, deliverables editing) keep only the handler-level guard from Step 7 as their protection — they stay visually enabled but no-op when clicked while `readOnly`. This is an accepted v1 gap (same pattern used for `PostProdBoard`'s secondary controls in Task 8) rather than threading `disabled` through every remaining input on this 2000+-line page.

- [ ] **Step 9: Pass `readOnly` to `<TaskList>`**

Change (currently lines 1329-1339, the "Egendefinerte oppgaver" instance):
```tsx
              <TaskList
                tasks={customTasks}
                profiles={profiles}
                onStatusChange={handleCustomTaskStatusChange}
                currentUserId={currentUser?.id ?? null}
                messageCounts={messageCounts}
                deepLinkTaskId={deepLinkTaskId}
                projectId={projectId}
                pipelineStage="post_prod"
                onTaskCreated={handleCustomTaskCreated}
                onTaskDeleted={handleCustomTaskDeleted}
```
to add `readOnly={readOnly}` as an additional prop on this same element (keep every existing prop, including the two lines already shown and whatever follows them up to the closing `/>`).

- [ ] **Step 10: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "app/admin/postprod/[id]/page.tsx"`
Expected: no new errors.

- [ ] **Step 11: Manual verification**

1. Open `/admin/postprod/<id>` for a project actually in `post_prod` — unchanged, sidebar still lists only active post-prod projects, fully editable.
2. Open it for a project that has moved to `levering`/`fakturert`/`videresalg` — page now loads (previously blocked entirely) with the banner, project title/lead/customer render correctly (via `viewedProject`), primary action buttons and notes are disabled, sidebar still correctly excludes it (it's not in `getPostProdProjects()`'s filtered list any more).
3. Unlock → confirm dialog → confirm → advance a task / edit notes → verify it persists after reload (then re-locks).
4. Open it for a project still in `pre_prod`/`produksjon` — new "ikke nådd" block screen.

- [ ] **Step 12: Commit**

```bash
git add "app/admin/postprod/[id]/page.tsx"
git commit -m "Vis post-produksjon skrivebeskyttet for prosjekter som har gått videre"
```

---

### Task 12: Faktura page (fakturert) integration

**Files:**
- Modify: `app/admin/faktura/[id]/page.tsx`

**Interfaces:**
- Consumes: `getStageAccess` (Task 1), `PastStageBanner` (Task 2).
- Produces: nothing new for later tasks (leaf page).

- [ ] **Step 1: Add imports**

Add after the existing imports (currently ending at line 8):
```tsx
import { getStageAccess } from '@/lib/pipeline-stage-lock'
import { STAGE_LABEL } from '@/lib/pipeline-ui'
import { PastStageBanner } from '@/components/admin/PastStageBanner'
```

- [ ] **Step 2: Add `unlocked` state**

Change (currently line 61):
```tsx
  const [loading, setLoading] = useState(true)
```
to:
```tsx
  const [loading, setLoading] = useState(true)
  const [unlocked, setUnlocked] = useState(false)
```

- [ ] **Step 3: Guard the two handlers**

Change `handleAssign` (currently lines 81-87):
```tsx
  async function handleAssign(profileId: string | null) {
    setSaving(true)
```
to:
```tsx
  async function handleAssign(profileId: string | null) {
    if (readOnly) return
    setSaving(true)
```

Change `handleMarkDone` (currently lines 89-102) — this one auto-advances the pipeline stage (`advanceToVideresalg`), so it must be blocked both when read-only AND when the page isn't showing the current stage (an unlocked-but-past view should never trigger a stage transition — see Global Constraints):
```tsx
  async function handleMarkDone() {
    if (marking || taskDone) return
```
to:
```tsx
  async function handleMarkDone() {
    if (readOnly || access !== 'current' || marking || taskDone) return
```

- [ ] **Step 4: Insert the access gate after the loading check**

After the existing loading block (currently lines 104-110), insert:
```tsx
  const project = hub?.project

  if (!project) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem' }}>Fant ikke prosjektet</span>
      </div>
    )
  }

  const access = getStageAccess('fakturert', project.pipeline_stage)

  if (access === 'not_yet_reached') {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
            Prosjektet har ikke nådd fakturering ennå
          </p>
          <Link href="/admin/pipeline" style={{ textDecoration: 'none' }}>
            <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
              ← Tilbake
            </button>
          </Link>
        </div>
      </div>
    )
  }

  const readOnly = access === 'past' && !unlocked
```

Then remove the now-redundant original lines that computed `project`/`customer` right before the `return (` (currently lines 112-115):
```tsx
  const project = hub?.project
  const customer = project?.customer ?? null
  const customerName = customer?.name ?? null
  const hasInvoiceInfo = !!(customer?.company || customer?.org_nummer || customer?.address || customer?.invoice_email)
```
to (drop the now-duplicate `const project = hub?.project` line, keep the rest — `project` is no longer optional at this point so `customer` can read `project.customer` directly):
```tsx
  const customer = project.customer ?? null
  const customerName = customer?.name ?? null
  const hasInvoiceInfo = !!(customer?.company || customer?.org_nummer || customer?.address || customer?.invoice_email)
```

Update the two now-redundant `project?.title ?? '—'` reads in the breadcrumb/header (currently lines 125, 133) to drop the optional chaining since `project` is guaranteed non-null past the gate:
```tsx
          <span style={{ color: C.text2, fontSize: '0.78rem' }}>{project?.title ?? '—'}</span>
```
to:
```tsx
          <span style={{ color: C.text2, fontSize: '0.78rem' }}>{project.title}</span>
```
and:
```tsx
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
            {project?.title ?? '—'}
          </h1>
```
to:
```tsx
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
            {project.title}
          </h1>
```

- [ ] **Step 5: Render the banner**

Insert right after the opening `<div style={{ maxWidth: 560, margin: '0 auto' }}>` (currently line 119), before the `{/* Breadcrumb */}` comment:
```tsx
        {access === 'past' && (
          <PastStageBanner
            currentStageLabel={STAGE_LABEL[project.pipeline_stage]}
            unlocked={unlocked}
            onUnlock={() => setUnlocked(true)}
          />
        )}
```

- [ ] **Step 6: Disable the interactive controls**

Change the "send faktura" checkbox button (currently lines 146-148):
```tsx
            <button
              onClick={handleMarkDone}
              disabled={marking}
```
to:
```tsx
            <button
              onClick={handleMarkDone}
              disabled={readOnly || access !== 'current' || marking}
```

Change the "Tildel"/"Bytt" button (currently lines 197-199):
```tsx
              <button
                onClick={() => setPickerOpen(o => !o)}
                disabled={saving}
```
to:
```tsx
              <button
                onClick={() => setPickerOpen(o => !o)}
                disabled={readOnly || saving}
```

- [ ] **Step 7: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint "app/admin/faktura/[id]/page.tsx"`
Expected: no new errors.

- [ ] **Step 8: Manual verification**

1. Open `/admin/faktura/<id>` for a project actually in `fakturert` — unchanged, fully interactive.
2. Open it for a project that has moved to `videresalg` — banner appears, checkbox and "Tildel" button disabled.
3. Unlock → confirm dialog → confirm → "Tildel" becomes clickable; the "send faktura" checkbox stays disabled regardless (it's a stage-transition action, gated separately on `access !== 'current'`, not just `readOnly`) — verify this explicitly, it's the one control in this task that stays disabled even after unlocking.
4. Open it for a project still in `post_prod` or earlier — new "ikke nådd" block screen.

- [ ] **Step 9: Commit**

```bash
git add "app/admin/faktura/[id]/page.tsx"
git commit -m "Vis faktura-siden skrivebeskyttet for prosjekter som har gått videre"
```
