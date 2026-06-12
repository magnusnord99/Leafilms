# Lead-oppgaver og tildelingsvarsler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Oppgavepanel med hurtigknapper og tildeling på lead-arbeidsflatene, ansvarlig-velger på leads, og varsler ved tildeling av oppgave/lead.

**Architecture:** Lead-oppgaver gjenbruker eksisterende `tasks`/`task_assignees` på leadens koblede prosjekt (`leads.converted_to_project_id`). Kun `notifications` endres i databasen (nye typer + `lead_id`). En ny delt hjelper `lib/notify-assignment.ts` sender varsler via service-client. En ny selvstendig klientkomponent `LeadTaskPanel` monteres på kontaktsiden og lead-detaljsiden.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS + service-client), TypeScript strict, Tailwind ikke i bruk her (inline styles + `lib/admin-theme.ts`).

**Verifisering:** Prosjektet har ingen testrigg. Hvert task verifiseres med `npx tsc --noEmit` (rask) og til slutt `npm run build` + `npm run lint`.

**Spec:** `docs/superpowers/specs/2026-06-12-lead-oppgaver-tildeling-design.md`

---

### Task 1: Migrasjon 061 — notifications-utvidelse

**Files:**
- Create: `supabase/migrations/061_assignment_notifications.sql`

- [ ] **Step 1: Skriv migrasjonen**

```sql
-- 061_assignment_notifications.sql
-- Varsler ved tildeling av oppgave/lead:
--  - project_id valgfri (lead-varsler kan mangle prosjekt)
--  - lead_id-kobling så varselet kan lenke til leaden
--  - nye typer: task_assigned, lead_assigned

ALTER TABLE notifications ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notifications_lead ON notifications(lead_id);

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned'
  ));
```

- [ ] **Step 2: Kjør migrasjonen mot Supabase**

Run: `(set -a; source .env.local; set +a; bash scripts/migrate-single.sh supabase/migrations/061_assignment_notifications.sql)`
Expected: `✨ Migration completed successfully!`

- [ ] **Step 3: Verifiser skjemaendringen**

Run:
```bash
(set -a; source .env.local; set +a; psql "$DATABASE_URL" -c "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='notifications' AND column_name IN ('project_id','lead_id');" -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='notifications_type_check';")
```
Expected: `project_id | YES`, `lead_id | YES`, og constraint-def som inneholder `task_assigned` og `lead_assigned`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/061_assignment_notifications.sql
git commit -m "feat: migrasjon 061 — tildelingsvarsler (task_assigned/lead_assigned, lead_id)"
```

---

### Task 2: Delt varsel-hjelper

**Files:**
- Create: `lib/notify-assignment.ts`

- [ ] **Step 1: Skriv hjelperen**

```typescript
import { createClient, createServiceClient } from '@/lib/supabase-server'

/**
 * Sender et tildelingsvarsel til en bruker. Hopper over selv-tildeling.
 * Feil logges og svelges — varsling skal aldri blokkere hovedhandlingen.
 */
export async function notifyAssignment(opts: {
  recipientId: string
  type: 'task_assigned' | 'lead_assigned'
  projectId: string | null
  taskId?: string | null
  leadId?: string | null
  preview: string
}): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id === opts.recipientId) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', user.id)
      .single()

    const service = createServiceClient()
    await service.from('notifications').insert({
      user_id: opts.recipientId,
      type: opts.type,
      project_id: opts.projectId,
      task_id: opts.taskId ?? null,
      lead_id: opts.leadId ?? null,
      message_preview: opts.preview.slice(0, 200),
      sender_name: profile?.name ?? profile?.email ?? 'Ukjent',
    })
  } catch (err) {
    console.error('notifyAssignment error:', err)
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen feil.

- [ ] **Step 3: Commit**

```bash
git add lib/notify-assignment.ts
git commit -m "feat: delt hjelper for tildelingsvarsler"
```

---

### Task 3: pipeline.ts — varsel i toggleTaskAssignee + getProjectStageTasks

**Files:**
- Modify: `lib/actions/pipeline.ts` (toggleTaskAssignee ~linje 1058; ny funksjon rett etter `getTasksForProject` ~linje 123)

- [ ] **Step 1: Importer hjelperen øverst i fila** (sammen med eksisterende imports)

```typescript
import { notifyAssignment } from '@/lib/notify-assignment'
```

- [ ] **Step 2: Utvid insert-grenen i `toggleTaskAssignee`** — erstatt `else`-grenen:

```typescript
    } else {
      await supabase
        .from('task_assignees')
        .insert({ task_id: taskId, profile_id: profileId })

      const { data: taskInfo } = await supabase
        .from('tasks')
        .select('title, project_id, project:projects ( title )')
        .eq('id', taskId)
        .single()

      if (taskInfo) {
        const projectTitle = (taskInfo.project as { title: string } | null)?.title
        await notifyAssignment({
          recipientId: profileId,
          type: 'task_assigned',
          projectId: taskInfo.project_id,
          taskId,
          preview: projectTitle ? `${taskInfo.title} — ${projectTitle}` : taskInfo.title,
        })
      }
      return true
    }
```

- [ ] **Step 3: Legg til `getProjectStageTasks` etter `getTasksForProject`**

```typescript
/**
 * Henter prosjektets nåværende pipeline-steg + oppgavene for det steget.
 * Brukes av oppgavepanelet på lead-sidene.
 */
export async function getProjectStageTasks(projectId: string): Promise<{
  stage: PipelineStage
  tasks: Task[]
} | null> {
  try {
    const supabase = await createClient()
    const { data: proj, error } = await supabase
      .from('projects')
      .select('pipeline_stage')
      .eq('id', projectId)
      .single()

    if (error || !proj) {
      console.error('getProjectStageTasks error:', error)
      return null
    }

    const stage = proj.pipeline_stage as PipelineStage
    const tasks = await getTasksForProject(projectId, stage)
    return { stage, tasks }
  } catch (err) {
    console.error('getProjectStageTasks unexpected error:', err)
    return null
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen feil. NB: supabase-join-typen for `project:projects ( title )` kan
inferreres som array — cast via `as unknown as { title: string } | null` om nødvendig.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: varsel ved oppgavetildeling + getProjectStageTasks"
```

---

### Task 4: leads.ts — assignLead + getLeadsWithMeta

**Files:**
- Modify: `lib/actions/leads.ts` (nye funksjoner nederst)

- [ ] **Step 1: Importer hjelperen øverst**

```typescript
import { notifyAssignment } from '@/lib/notify-assignment'
```

- [ ] **Step 2: Legg til `assignLead` nederst i fila**

```typescript
export async function assignLead(leadId: string, profileId: string | null): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: lead } = await supabase
      .from('leads')
      .select('name, company, converted_to_project_id')
      .eq('id', leadId)
      .single()

    await supabase
      .from('leads')
      .update({ assigned_to: profileId, updated_at: new Date().toISOString() })
      .eq('id', leadId)

    if (profileId && lead) {
      await notifyAssignment({
        recipientId: profileId,
        type: 'lead_assigned',
        projectId: lead.converted_to_project_id,
        leadId,
        preview: lead.company || lead.name,
      })
    }

    revalidatePath('/admin/leads')
  } catch (err) {
    console.error('assignLead unexpected:', err)
  }
}
```

- [ ] **Step 3: Legg til `getLeadsWithMeta` nederst i fila**

```typescript
export type LeadListItem = LeadRecord & {
  assigned_profile: { id: string; name: string | null; email: string } | null
  open_tasks: number
}

export async function getLeadsWithMeta(): Promise<LeadListItem[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('leads')
      .select('*, assigned_profile:profiles!leads_assigned_to_fkey ( id, name, email )')
      .order('created_at', { ascending: false })
    if (error) { console.error('getLeadsWithMeta:', error); return [] }

    const leads = (data ?? []) as unknown as (LeadRecord & {
      assigned_profile: { id: string; name: string | null; email: string } | null
    })[]

    const projectIds = leads
      .map(l => l.converted_to_project_id)
      .filter((id): id is string => !!id)

    const openByProject: Record<string, number> = {}
    if (projectIds.length > 0) {
      const { data: openTasks } = await supabase
        .from('tasks')
        .select('project_id')
        .in('project_id', projectIds)
        .neq('status', 'done')
      for (const t of openTasks ?? []) {
        openByProject[t.project_id] = (openByProject[t.project_id] ?? 0) + 1
      }
    }

    return leads.map(l => ({
      ...l,
      open_tasks: l.converted_to_project_id
        ? openByProject[l.converted_to_project_id] ?? 0
        : 0,
    }))
  } catch (err) {
    console.error('getLeadsWithMeta unexpected:', err)
    return []
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen feil. NB: hvis FK-hintet `profiles!leads_assigned_to_fkey` feiler i
runtime testes alternativet `profiles!assigned_to` under manuell verifisering.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/leads.ts
git commit -m "feat: assignLead med varsel + getLeadsWithMeta"
```

---

### Task 5: notifications.ts — utvidet type + leads-join

**Files:**
- Modify: `lib/actions/notifications.ts:6-36`

- [ ] **Step 1: Erstatt `Notification`-typen**

```typescript
export type Notification = {
  id: string
  type: 'project_message' | 'task_message' | 'selection_submitted' | 'task_assigned' | 'lead_assigned'
  project_id: string | null
  task_id: string | null
  lead_id: string | null
  message_preview: string
  sender_name: string
  read: boolean
  created_at: string
  projects: { title: string } | null
  tasks: { title: string } | null
  leads: { name: string; company: string | null } | null
}
```

- [ ] **Step 2: Utvid select i `getNotifications`**

```typescript
      .select('*, projects(title), tasks(title), leads(name, company)')
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen feil (sjekk at VarslerClient fortsatt kompilerer — `lead_id` er ny, resten bakoverkompatibelt).

- [ ] **Step 4: Commit**

```bash
git add lib/actions/notifications.ts
git commit -m "feat: notifications-typen dekker tildelingsvarsler + lead-join"
```

---

### Task 6: VarslerClient — rendering og routing av nye typer

**Files:**
- Modify: `app/admin/varsler/VarslerClient.tsx`

- [ ] **Step 1: Oppdater `handleClick`** — erstat type-routingen:

```typescript
  async function handleClick(n: Notification) {
    if (!n.read) {
      startTransition(async () => { await markAsRead(n.id) })
    }
    if (n.type === 'lead_assigned') {
      router.push(n.project_id ? `/admin/projects/${n.project_id}/contact` : `/admin/leads/${n.lead_id}`)
    } else if (n.type === 'task_assigned' || n.type === 'project_message') {
      router.push(`/admin/projects/${n.project_id}`)
    } else {
      router.push(`/admin/postprod/${n.project_id}`)
    }
  }
```

- [ ] **Step 2: Kontekst-label** — erstatt span-innholdet `{n.type === 'project_message' ? 'i prosjekt-chatten' : 'i en oppgave'}` med:

```tsx
{n.type === 'project_message' ? 'i prosjekt-chatten'
  : n.type === 'task_assigned' ? 'tildelte deg en oppgave'
  : n.type === 'lead_assigned' ? 'satte deg som ansvarlig for en lead'
  : n.type === 'selection_submitted' ? 'sendte inn bildevalg'
  : 'i en oppgave'}
```

- [ ] **Step 3: Ikon** — utvid ikon-blokken: tildelingsvarsler får person-ikon i accent-farge:

```tsx
{n.type === 'task_assigned' || n.type === 'lead_assigned' ? (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
) : n.type === 'project_message' ? (
  /* eksisterende chat-ikon uendret */
) : (
  /* eksisterende dokument-ikon uendret */
)}
```

- [ ] **Step 4: Footer-linje** — i blokken som viser `n.projects?.title` / `n.tasks?.title`, legg til lead-navn:

```tsx
{n.leads?.name && (
  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
    {n.leads.company || n.leads.name}
  </span>
)}
```

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → ingen feil.

```bash
git add app/admin/varsler/VarslerClient.tsx
git commit -m "feat: varselsenter viser tildelingsvarsler med riktig lenke"
```

---

### Task 7: LeadTaskPanel-komponenten

**Files:**
- Create: `components/admin/LeadTaskPanel.tsx`

Selvstendig klientkomponent. Bruker `C` fra `@/lib/admin-theme`. Mønstre
(status-sykling, assignee-picker) er kopiert fra pipeline-siden for konsistens.

- [ ] **Step 1: Skriv komponenten**

```tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  getProjectStageTasks, getAllProfiles, toggleTaskAssignee, updateTaskStatus, createTask,
} from '@/lib/actions/pipeline'
import { assignLead } from '@/lib/actions/leads'
import { C } from '@/lib/admin-theme'
import type { Task, PipelineStage } from '@/lib/types'

type Profile = { id: string; name: string | null; email: string }

const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead', møte: 'Møte', tilbud_sendt: 'Tilbud sendt',
  kontrakt: 'Kontrakt', pre_prod: 'Pre-prod', produksjon: 'Produksjon',
  post_prod: 'Post-prod', levering: 'Levering', fakturert: 'Fakturert', videresalg: 'Videresalg',
}

const QUICK_TASKS = ['Send tilbud', 'Følg opp lead', 'Book møte', 'Ring tilbake']

// admin-theme mangler success/warning — samme verdier som leads-listen bruker lokalt
const SUCCESS = '#4CAF7D'
const WARNING = '#F0A500'

const STATUS_CYCLE: Record<Task['status'], Task['status']> = {
  todo: 'in_progress', in_progress: 'done', done: 'todo',
}

const STATUS_STYLE: Record<Task['status'], { label: string; color: string }> = {
  todo:        { label: 'Ikke startet', color: C.text3 },
  in_progress: { label: 'Pågår',        color: WARNING },
  done:        { label: 'Ferdig',       color: SUCCESS },
}

function Initials({ p, active }: { p: Profile; active: boolean }) {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
      background: active ? C.accent : C.surface,
      border: `1px solid ${active ? C.accent : C.border}`,
      color: active ? '#fff' : C.text2,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.6rem', fontWeight: 700,
    }}>
      {(p.name ?? p.email)[0].toUpperCase()}
    </span>
  )
}

function AssigneePicker({ task, profiles, onToggle }: {
  task: Task
  profiles: Profile[]
  onToggle: (taskId: string, profileId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        title="Tildel oppgave"
        style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
          background: open ? C.accentBg : 'transparent',
          border: `1px solid ${open ? 'rgba(124,92,252,0.35)' : C.border}`,
        }}
      >
        {task.assignees.length > 0 ? (
          <div style={{ display: 'flex' }}>
            {task.assignees.slice(0, 3).map((a, i) => (
              <span key={a.id} style={{
                width: 16, height: 16, borderRadius: '50%',
                background: C.accent, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.5rem', fontWeight: 700,
                marginLeft: i > 0 ? -4 : 0,
                border: `1.5px solid ${C.surface}`,
                position: 'relative', zIndex: 3 - i,
              }}>
                {(a.name ?? a.email)[0].toUpperCase()}
              </span>
            ))}
          </div>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.text3} strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        )}
        <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
          <path d="M1 2L3.5 5L6 2" stroke={C.text3} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200,
          background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          minWidth: 190, maxHeight: 220, overflowY: 'auto', padding: '3px 0',
        }}>
          {profiles.map(p => {
            const isAssigned = task.assignees.some(a => a.id === p.id)
            return (
              <button
                key={p.id}
                onClick={() => { onToggle(task.id, p.id); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '6px 12px',
                  background: isAssigned ? C.accentBg : 'none',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
              >
                <Initials p={p} active={isAssigned} />
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: isAssigned ? C.accent : C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name ?? p.email}
                </span>
                {isAssigned && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke={C.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function LeadTaskPanel({ projectId, leadId, assignedTo, canCreate }: {
  projectId: string
  leadId: string
  assignedTo: string | null
  canCreate: boolean
}) {
  const [stage, setStage] = useState<PipelineStage | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [owner, setOwner] = useState<string | null>(assignedTo)
  const [ownerOpen, setOwnerOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const [newTitle, setNewTitle] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newAssignees, setNewAssignees] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const ownerRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const result = await getProjectStageTasks(projectId)
    if (result) { setStage(result.stage); setTasks(result.tasks) }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    load()
    getAllProfiles().then(setProfiles)
  }, [load])

  useEffect(() => {
    if (!ownerOpen) return
    const handler = (e: MouseEvent) => {
      if (ownerRef.current && !ownerRef.current.contains(e.target as Node)) setOwnerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ownerOpen])

  async function handleOwner(profileId: string | null) {
    setOwner(profileId)
    setOwnerOpen(false)
    await assignLead(leadId, profileId)
  }

  async function handleToggleAssignee(taskId: string, profileId: string) {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t
      const has = t.assignees.some(a => a.id === profileId)
      const p = profiles.find(p => p.id === profileId)
      return {
        ...t,
        assignees: has
          ? t.assignees.filter(a => a.id !== profileId)
          : [...t.assignees, ...(p ? [p] : [])],
      }
    }))
    await toggleTaskAssignee(taskId, profileId)
  }

  async function handleStatus(task: Task) {
    const next = STATUS_CYCLE[task.status]
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: next } : t))
    await updateTaskStatus(task.id, next)
    // Steget kan ha auto-avansert — last på nytt
    await load()
  }

  async function handleCreate() {
    if (!newTitle.trim() || !stage || creating) return
    setCreating(true)
    const created = await createTask({
      project_id: projectId,
      pipeline_stage: stage,
      title: newTitle.trim(),
      due_date: newDue || undefined,
    })
    if (created) {
      for (const pid of newAssignees) {
        await toggleTaskAssignee(created.id, pid)
      }
      setNewTitle(''); setNewDue(''); setNewAssignees([])
      await load()
    }
    setCreating(false)
  }

  const ownerProfile = profiles.find(p => p.id === owner) ?? null

  const label = (s: string) => ({
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: C.text3, marginBottom: s,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Ansvarlig */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
        <p style={label('12px')}>Ansvarlig</p>
        <div ref={ownerRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setOwnerOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
              background: C.surface2, border: `1px solid ${ownerOpen ? 'rgba(124,92,252,0.35)' : C.border}`,
              textAlign: 'left',
            }}
          >
            {ownerProfile ? (
              <>
                <Initials p={ownerProfile} active />
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, flex: 1 }}>
                  {ownerProfile.name ?? ownerProfile.email}
                </span>
              </>
            ) : (
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, flex: 1, fontStyle: 'italic' }}>
                Ingen ansvarlig
              </span>
            )}
            <svg width="8" height="8" viewBox="0 0 7 7" fill="none">
              <path d="M1 2L3.5 5L6 2" stroke={C.text3} strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
          {ownerOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
              background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              maxHeight: 220, overflowY: 'auto', padding: '3px 0',
            }}>
              <button
                onClick={() => handleOwner(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, fontStyle: 'italic' }}>Ingen ansvarlig</span>
              </button>
              {profiles.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleOwner(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px',
                    background: owner === p.id ? C.accentBg : 'none',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Initials p={p} active={owner === p.id} />
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: owner === p.id ? C.accent : C.text }}>
                    {p.name ?? p.email}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Oppgaver */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <p style={{ ...label('0'), marginBottom: 0 }}>Oppgaver</p>
          {stage && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
              Steg: {STAGE_LABELS[stage] ?? stage}
            </span>
          )}
        </div>

        {loading ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
        ) : tasks.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, fontStyle: 'italic', marginBottom: canCreate ? 14 : 0 }}>
            Ingen oppgaver i dette steget.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: canCreate ? 16 : 0 }}>
            {tasks.map(task => {
              const st = STATUS_STYLE[task.status]
              return (
                <div key={task.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 10px', borderRadius: 8,
                  background: C.surface2, border: `1px solid ${C.border}`,
                }}>
                  <button
                    onClick={() => handleStatus(task)}
                    title="Bytt status"
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600,
                      letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0,
                      color: st.color, background: `${st.color}14`,
                      border: `1px solid ${st.color}30`,
                      padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                      minWidth: 86,
                    }}
                  >
                    {st.label}
                  </button>
                  <span style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                    color: task.status === 'done' ? C.text3 : C.text,
                    textDecoration: task.status === 'done' ? 'line-through' : 'none',
                    flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {task.title}
                  </span>
                  {task.due_date && (
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, flexShrink: 0 }}>
                      {new Date(task.due_date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                  <AssigneePicker task={task} profiles={profiles} onToggle={handleToggleAssignee} />
                </div>
              )
            })}
          </div>
        )}

        {canCreate && (
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            {/* Hurtigknapper */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {QUICK_TASKS.map(q => (
                <button
                  key={q}
                  onClick={() => setNewTitle(q)}
                  style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                    padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
                    background: newTitle === q ? C.accentBg : 'transparent',
                    color: newTitle === q ? C.accent : C.text3,
                    border: `1px solid ${newTitle === q ? 'rgba(124,92,252,0.35)' : C.border}`,
                    transition: 'all 0.12s',
                  }}
                >
                  + {q}
                </button>
              ))}
            </div>

            {/* Tittel + frist */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
                placeholder="Ny oppgave..."
                style={{
                  flex: 1, minWidth: 0, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                  color: C.text, background: C.surface2,
                  border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: '7px 10px', outline: 'none',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border }}
              />
              <input
                type="date"
                value={newDue}
                onChange={e => setNewDue(e.target.value)}
                title="Frist"
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
                  color: newDue ? C.text : C.text3, background: C.surface2,
                  border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: '7px 8px', outline: 'none', colorScheme: 'dark',
                }}
              />
            </div>

            {/* Tildel ved opprettelse */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>Tildel:</span>
              {profiles.map(p => {
                const sel = newAssignees.includes(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => setNewAssignees(prev => sel ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                    title={p.name ?? p.email}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '3px 8px 3px 4px', borderRadius: 12, cursor: 'pointer',
                      background: sel ? C.accentBg : 'transparent',
                      border: `1px solid ${sel ? 'rgba(124,92,252,0.35)' : C.border}`,
                    }}
                  >
                    <Initials p={p} active={sel} />
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: sel ? C.accent : C.text3 }}>
                      {(p.name ?? p.email).split(' ')[0]}
                    </span>
                  </button>
                )
              })}
            </div>

            <button
              onClick={handleCreate}
              disabled={!newTitle.trim() || creating}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                padding: '7px 16px', borderRadius: 6,
                cursor: !newTitle.trim() || creating ? 'not-allowed' : 'pointer',
                background: newTitle.trim() ? C.accent : C.surface2,
                color: newTitle.trim() ? '#fff' : C.text3,
                border: 'none', opacity: creating ? 0.6 : 1,
              }}
            >
              {creating ? 'Oppretter...' : 'Opprett oppgave'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: ingen feil. `PipelineStage` eksporteres fra `lib/types.ts:5` (verifisert);
`lib/admin-theme.ts` har `bg/surface/surface2/border/text/text2/text3/accent/accentBg/danger`
(verifisert — success/warning defineres lokalt i komponenten).

- [ ] **Step 3: Commit**

```bash
git add components/admin/LeadTaskPanel.tsx
git commit -m "feat: LeadTaskPanel — oppgaver, hurtigknapper og ansvarlig på lead"
```

---

### Task 8: Monter panelet på kontaktsiden

**Files:**
- Modify: `app/admin/projects/[id]/contact/page.tsx` (import øverst; panel i høyre kolonne over «Snarvei til prosjektsiden»-blokken, ~linje 408)

- [ ] **Step 1: Import**

```typescript
import LeadTaskPanel from '@/components/admin/LeadTaskPanel'
```

- [ ] **Step 2: Monter panelet** rett før `{/* Snarvei til prosjektsiden */}`-blokken i høyre kolonne:

```tsx
            {lead && (
              <LeadTaskPanel
                projectId={projectId}
                leadId={lead.id}
                assignedTo={lead.assigned_to}
                canCreate={lead.status !== 'converted' && lead.status !== 'lost'}
              />
            )}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → ingen feil.

```bash
git add "app/admin/projects/[id]/contact/page.tsx"
git commit -m "feat: oppgavepanel på kontaktsiden (lead-arbeidsflaten)"
```

---

### Task 9: Monter panelet på lead-detaljsiden

**Files:**
- Modify: `app/admin/leads/[id]/page.tsx` (import; øverst i høyre kolonne ~linje 320)

- [ ] **Step 1: Import**

```typescript
import LeadTaskPanel from '@/components/admin/LeadTaskPanel'
```

- [ ] **Step 2: Monter panelet** som første element i høyre kolonne (før Salgspunkter):

```tsx
            {lead.converted_to_project_id && (
              <LeadTaskPanel
                projectId={lead.converted_to_project_id}
                leadId={lead.id}
                assignedTo={lead.assigned_to}
                canCreate={lead.status !== 'converted' && lead.status !== 'lost'}
              />
            )}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → ingen feil.

```bash
git add "app/admin/leads/[id]/page.tsx"
git commit -m "feat: oppgavepanel på lead-detaljsiden"
```

---

### Task 10: Leads-listen — ansvarlig + åpne oppgaver

**Files:**
- Modify: `app/admin/leads/page.tsx`

- [ ] **Step 1: Bytt datakilde** — endre import og state:

```typescript
import { getLeadsWithMeta, deleteLead, LeadListItem, LeadStatus } from '@/lib/actions/leads'
```

```typescript
  const [leads, setLeads] = useState<LeadListItem[]>([])
```

```typescript
  useEffect(() => {
    getLeadsWithMeta().then(data => {
      setLeads(data)
      setLoading(false)
    })
  }, [])
```

- [ ] **Step 2: Render badges** — rett før `{/* Sales points count */}`-blokken i raden:

```tsx
                      {/* Ansvarlig + åpne oppgaver */}
                      {lead.assigned_profile && (
                        <span
                          title={`Ansvarlig: ${lead.assigned_profile.name ?? lead.assigned_profile.email}`}
                          style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: C.accent, color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700,
                          }}
                        >
                          {(lead.assigned_profile.name ?? lead.assigned_profile.email)[0].toUpperCase()}
                        </span>
                      )}
                      {lead.open_tasks > 0 && (
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, flexShrink: 0 }}>
                          {lead.open_tasks} oppgave{lead.open_tasks !== 1 ? 'r' : ''}
                        </span>
                      )}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → ingen feil.

```bash
git add app/admin/leads/page.tsx
git commit -m "feat: leads-listen viser ansvarlig og åpne oppgaver"
```

---

### Task 11: Full verifisering

- [ ] **Step 1: Lint**

Run: `npm run lint`
Expected: ingen nye feil (eksisterende warnings OK).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: bygger grønt.

- [ ] **Step 3: Manuell røyk-test mot dev-server** (hvis miljøet tillater)

1. Start `npm run dev`, logg inn om mulig.
2. Åpne en lead via leads-listen → kontaktsiden: oppgavepanelet vises.
3. Klikk «+ Send tilbud» → velg tildelt → Opprett → oppgaven vises med assignee.
4. Sjekk at varsel dukker opp for den tildelte (databasespørring mot
   `notifications` er nok: `type='task_assigned'`).
5. Sett ansvarlig på leaden → sjekk `lead_assigned`-varsel + badge i leads-listen.

Hvis innlogging ikke er mulig autonomt: verifiser i stedet med direkte
databasespørringer + at sidene rendrer (HTTP 200 / redirect til login).

- [ ] **Step 4: Oppdater CLAUDE.md migrasjonsnummer**

I `CLAUDE.md`: endre «neste er `040_`» til «neste er `062_`».

```bash
git add CLAUDE.md
git commit -m "docs: oppdater neste migrasjonsnummer til 062"
```
