# Tapte prosjekter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gjør det mulig å markere prosjekter som tapt med årsak og notat, filtrere dem ut av pipeline, og vise statistikk i et eget arkiv-view.

**Architecture:** Ny `status = 'lost'` på eksisterende projects-tabell med fire støttekolonner. Server actions i `lib/actions/lost.ts`. Modal inline i project hub. Arkiv/statistikk-side på `/admin/tapte`.

**Tech Stack:** Next.js 16 App Router, Supabase (server-side via `createClient`), TypeScript strict, Tailwind v4 / inline styles (følg eksisterende mønster)

---

## Filstruktur

| Fil | Handling | Ansvar |
|---|---|---|
| `supabase/migrations/055_lost_projects.sql` | Opprett | Legger til `lost_reason`, `lost_notes`, `lost_at`, `lost_stage` på `projects` |
| `lib/actions/lost.ts` | Opprett | `markAsLost`, `getLostProjects`, `getLostStats` |
| `app/admin/projects/[id]/page.tsx` | Modifiser | Legg til trigger-knapp + `LostModal`-komponent |
| `lib/actions/pipeline.ts` | Modifiser | Filtrer `status = 'lost'` ut av `getProjectsForPipeline` |
| `app/admin/tapte/page.tsx` | Opprett | Arkiv + statistikk-side |
| `app/admin/layout.tsx` | Modifiser | Legg til nav-lenke under "Salg & CRM" |

---

## Task 1: Database-migrasjon

**Files:**
- Create: `supabase/migrations/055_lost_projects.sql`

- [ ] **Steg 1: Opprett migrasjonsfilen**

```sql
-- 055_lost_projects.sql
alter table projects
  add column if not exists lost_reason  text,
  add column if not exists lost_notes   text,
  add column if not exists lost_at      timestamptz,
  add column if not exists lost_stage   text;
```

- [ ] **Steg 2: Kjør migrasjonen mot Supabase**

Gå til Supabase Dashboard → SQL Editor og kjør innholdet i filen. Bekreft at kolonnene dukker opp under `projects`-tabellen i Table Editor.

- [ ] **Steg 3: Commit**

```bash
git add supabase/migrations/055_lost_projects.sql
git commit -m "feat: add lost_reason/notes/at/stage columns to projects"
```

---

## Task 2: Server actions

**Files:**
- Create: `lib/actions/lost.ts`

- [ ] **Steg 1: Opprett `lib/actions/lost.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { PipelineStage } from '@/lib/types'

export type LostReason =
  | 'pris'
  | 'konkurrent'
  | 'utsatt'
  | 'budsjett_kuttet'
  | 'intern'
  | 'ikke_svar'
  | 'annet'

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  pris:            'Pris for høy',
  konkurrent:      'Valgte konkurrent',
  utsatt:          'Prosjekt utsatt',
  budsjett_kuttet: 'Budsjett kuttet',
  intern:          'Intern produksjon',
  ikke_svar:       'Ikke svar',
  annet:           'Annet',
}

export async function markAsLost(
  projectId: string,
  reason: LostReason,
  notes: string | null,
  currentStage: PipelineStage,
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('projects')
      .update({
        status: 'lost',
        lost_reason: reason,
        lost_notes: notes || null,
        lost_at: new Date().toISOString(),
        lost_stage: currentStage,
      })
      .eq('id', projectId)

    if (error) return { error: error.message }
    revalidatePath('/admin/pipeline')
    revalidatePath('/admin/tapte')
    return { error: null }
  } catch (err) {
    return { error: 'Noe gikk galt' }
  }
}

export type LostProject = {
  id: string
  title: string
  client_name: string | null
  lost_reason: LostReason
  lost_notes: string | null
  lost_at: string
  lost_stage: PipelineStage
}

export async function getLostProjects(): Promise<LostProject[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('projects')
      .select('id, title, client_name, lost_reason, lost_notes, lost_at, lost_stage')
      .eq('status', 'lost')
      .order('lost_at', { ascending: false })

    if (error) return []
    return (data ?? []) as LostProject[]
  } catch {
    return []
  }
}

export type LostStats = {
  total: number
  byReason: Record<string, number>
  byStage: Record<string, number>
  winLossRatio: number | null
}

export async function getLostStats(): Promise<LostStats> {
  try {
    const supabase = await createClient()

    const [{ data: lostData }, { count: wonCount }] = await Promise.all([
      supabase
        .from('projects')
        .select('lost_reason, lost_stage')
        .eq('status', 'lost'),
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('pipeline_stage', 'fakturert'),
    ])

    const lost = lostData ?? []
    const total = lost.length

    const byReason: Record<string, number> = {}
    const byStage: Record<string, number> = {}

    for (const row of lost) {
      if (row.lost_reason) byReason[row.lost_reason] = (byReason[row.lost_reason] ?? 0) + 1
      if (row.lost_stage)  byStage[row.lost_stage]   = (byStage[row.lost_stage]   ?? 0) + 1
    }

    const won = wonCount ?? 0
    const winLossRatio = total > 0 ? Math.round((won / (won + total)) * 100) : null

    return { total, byReason, byStage, winLossRatio }
  } catch {
    return { total: 0, byReason: {}, byStage: {}, winLossRatio: null }
  }
}
```

- [ ] **Steg 2: Bekreft TypeScript kompilerer**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch && npx tsc --noEmit 2>&1 | head -20
```

Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add lib/actions/lost.ts
git commit -m "feat: add markAsLost, getLostProjects, getLostStats server actions"
```

---

## Task 3: Modal og trigger-knapp i project hub

**Files:**
- Modify: `app/admin/projects/[id]/page.tsx`

- [ ] **Steg 1: Legg til import av server action og type**

Øverst i filen, etter eksisterende imports:

```typescript
import { markAsLost, LOST_REASON_LABELS, type LostReason } from '@/lib/actions/lost'
```

- [ ] **Steg 2: Legg til state for modal**

I `ProjectHubPage`-komponenten, etter de eksisterende `useState`-kallene (rundt linje 300):

```typescript
const [showLostModal, setShowLostModal] = useState(false)
const [lostReason, setLostReason] = useState<LostReason | null>(null)
const [lostNotes, setLostNotes] = useState('')
const [markingLost, setMarkingLost] = useState(false)
```

- [ ] **Steg 3: Legg til `handleMarkAsLost`-funksjon**

Etter `handleAssigneeToggle`-funksjonen:

```typescript
async function handleMarkAsLost() {
  if (!lostReason) return
  setMarkingLost(true)
  const { error } = await markAsLost(
    projectId,
    lostReason,
    lostNotes.trim() || null,
    project.pipeline_stage,
  )
  if (error) {
    alert('Noe gikk galt. Prøv igjen.')
    setMarkingLost(false)
    return
  }
  router.push('/admin/pipeline')
}
```

- [ ] **Steg 4: Legg til "Marker som tapt"-knapp i headeren**

Finn denne blokken (rundt linje 473):

```typescript
            <Link href={`/admin/projects/${projectId}/edit`}>
              <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}`, flexShrink: 0 }}>
                Rediger →
              </button>
            </Link>
```

Erstatt med:

```typescript
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => setShowLostModal(true)}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: C.danger, border: `1px solid ${C.danger}`, flexShrink: 0, opacity: 0.7 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7' }}
              >
                Marker som tapt
              </button>
              <Link href={`/admin/projects/${projectId}/edit`}>
                <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}`, flexShrink: 0 }}>
                  Rediger →
                </button>
              </Link>
            </div>
```

- [ ] **Steg 5: Legg til modal-markup**

Rett før den avsluttende `</div>` på hele page-komponenten (etter alle tabs), legg til:

```typescript
        {/* Lost modal */}
        {showLostModal && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}
            onClick={e => { if (e.target === e.currentTarget) setShowLostModal(false) }}
          >
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '28px 28px 24px', width: '100%', maxWidth: 440, margin: '0 16px' }}>
              <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 600, color: C.text, marginBottom: 6 }}>
                Marker prosjekt som tapt
              </h2>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginBottom: 20 }}>
                {project.title}
              </p>

              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
                Årsak
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                {(Object.entries(LOST_REASON_LABELS) as [LostReason, string][]).map(([value, label]) => (
                  <label
                    key={value}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, border: `1px solid ${lostReason === value ? 'rgba(224,85,85,0.4)' : C.border}`, background: lostReason === value ? 'rgba(224,85,85,0.08)' : C.surface2, cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="lost_reason"
                      value={value}
                      checked={lostReason === value}
                      onChange={() => setLostReason(value)}
                      style={{ accentColor: C.danger }}
                    />
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: lostReason === value ? '#E8A0A0' : C.text2 }}>
                      {label}
                    </span>
                  </label>
                ))}
              </div>

              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>
                Notater (valgfritt)
              </p>
              <textarea
                value={lostNotes}
                onChange={e => setLostNotes(e.target.value)}
                placeholder="Hva vet vi om hvorfor dette ikke gikk gjennom?"
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', outline: 'none', resize: 'vertical', marginBottom: 20 }}
                onFocus={e => { e.currentTarget.style.borderColor = C.danger }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border }}
              />

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowLostModal(false); setLostReason(null); setLostNotes('') }}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '7px 14px', borderRadius: 6, cursor: 'pointer' }}
                >
                  Avbryt
                </button>
                <button
                  onClick={handleMarkAsLost}
                  disabled={!lostReason || markingLost}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, padding: '7px 16px', borderRadius: 6, background: lostReason ? C.danger : C.surface2, color: lostReason ? '#fff' : C.text3, border: 'none', cursor: lostReason ? 'pointer' : 'not-allowed', opacity: markingLost ? 0.6 : 1 }}
                >
                  {markingLost ? 'Lagrer...' : 'Marker som tapt'}
                </button>
              </div>
            </div>
          </div>
        )}
```

- [ ] **Steg 6: Verifiser TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Steg 7: Test manuelt**

Start dev-server, åpne et prosjekt, klikk "Marker som tapt", velg årsak og bekreft. Prosjektet skal forsvinne fra pipeline og `status = 'lost'` i databasen.

- [ ] **Steg 8: Commit**

```bash
git add app/admin/projects/[id]/page.tsx
git commit -m "feat: add lost modal and trigger to project hub"
```

---

## Task 4: Filtrer tapte prosjekter ut av pipeline

**Files:**
- Modify: `lib/actions/pipeline.ts`

- [ ] **Steg 1: Legg til status-filter i `getProjectsForPipeline`**

Finn `.order('updated_at', { ascending: false })` i `getProjectsForPipeline` og legg til filter:

```typescript
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          customers (
            id,
            name,
            company
          )
        `)
        .neq('status', 'lost')        // <-- legg til denne linjen
        .order('updated_at', { ascending: false })
```

- [ ] **Steg 2: Gjør det samme i `getProjectsForPipeline`-varianter om de finnes**

Søk etter andre steder i `pipeline.ts` som henter alle prosjekter uten status-filter:

```bash
grep -n "from('projects')" /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch/lib/actions/pipeline.ts
```

Legg til `.neq('status', 'lost')` på alle som ikke allerede har et status-filter.

- [ ] **Steg 3: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: exclude lost projects from pipeline view"
```

---

## Task 5: Arkiv og statistikk-side

**Files:**
- Create: `app/admin/tapte/page.tsx`

- [ ] **Steg 1: Opprett siden**

```typescript
import { getLostProjects, getLostStats, LOST_REASON_LABELS, type LostReason } from '@/lib/actions/lost'
import { PIPELINE_STAGES } from '@/lib/types'

const C = {
  bg:       '#181920',
  surface:  '#1E1E28',
  surface2: '#252530',
  border:   '#2D2D3A',
  text:     '#E2E2E2',
  text2:    '#9B9BAD',
  text3:    '#5C5C70',
  accent:   '#7C5CFC',
  danger:   '#E05555',
}

function stageLabel(stage: string) {
  return PIPELINE_STAGES.find(s => s.value === stage)?.label ?? stage
}

export default async function TaptePage() {
  const [projects, stats] = await Promise.all([getLostProjects(), getLostStats()])

  const topReason = Object.entries(stats.byReason).sort((a, b) => b[1] - a[1])[0]
  const topStage  = Object.entries(stats.byStage).sort((a, b) => b[1] - a[1])[0]

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
            Tapte prosjekter
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
            Prosjekter og pitcher som ikke ble til salg
          </p>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 32 }}>
          {[
            { label: 'Totalt tapt', value: stats.total.toString() },
            { label: 'Vanligste årsak', value: topReason ? LOST_REASON_LABELS[topReason[0] as LostReason] : '–' },
            { label: 'Vanligste steg', value: topStage ? stageLabel(topStage[0]) : '–' },
            { label: 'Win-rate', value: stats.winLossRatio !== null ? `${stats.winLossRatio}%` : '–' },
          ].map(stat => (
            <div key={stat.label} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>
                {stat.label}
              </p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.1rem', fontWeight: 600, color: C.text }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Årsaksfordeling */}
        {stats.total > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '18px 20px', marginBottom: 24 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
              Fordeling per årsak
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {Object.entries(LOST_REASON_LABELS).map(([key, label]) => {
                const count = stats.byReason[key] ?? 0
                const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: count > 0 ? C.text2 : C.text3, width: 160, flexShrink: 0 }}>
                      {label}
                    </span>
                    <div style={{ flex: 1, height: 6, background: C.surface2, borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: count > 0 ? C.danger : 'transparent', borderRadius: 3, transition: 'width 0.3s ease', opacity: 0.7 }} />
                    </div>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, width: 32, textAlign: 'right', flexShrink: 0 }}>
                      {count > 0 ? count : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Liste */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
              Alle tapte prosjekter
            </p>
          </div>
          {projects.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3 }}>
                Ingen tapte prosjekter registrert ennå.
              </p>
            </div>
          ) : (
            <div>
              {projects.map((p, i) => (
                <div
                  key={p.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, padding: '12px 18px', borderBottom: i < projects.length - 1 ? `1px solid ${C.border}` : 'none' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.title}
                    </p>
                    {p.client_name && (
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
                        {p.client_name}
                      </p>
                    )}
                    {p.lost_notes && (
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, fontStyle: 'italic', marginTop: 2 }}>
                        {p.lost_notes}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: '#E8A0A0', background: 'rgba(224,85,85,0.1)', padding: '3px 9px', borderRadius: 4 }}>
                      {LOST_REASON_LABELS[p.lost_reason]}
                    </span>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                      {stageLabel(p.lost_stage)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                      {new Date(p.lost_at).toLocaleDateString('nb-NO')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Steg 2: Verifiser TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Steg 3: Commit**

```bash
git add app/admin/tapte/page.tsx
git commit -m "feat: add lost projects archive and stats page at /admin/tapte"
```

---

## Task 6: Navigasjon

**Files:**
- Modify: `app/admin/layout.tsx`

- [ ] **Steg 1: Legg til lenke i "Salg & CRM"-gruppen**

Finn `navGroups` og legg til `{ href: '/admin/tapte', label: 'Tapte prosjekter' }` i "Salg & CRM"-gruppen:

```typescript
  {
    label: 'Salg & CRM',
    items: [
      { href: '/admin/leads',     label: 'Leads' },
      { href: '/admin/pipeline',  label: 'Pipeline' },
      { href: '/admin/tapte',     label: 'Tapte prosjekter' },  // <-- ny
      { href: '/admin/customers', label: 'Kunder' },
      { href: '/admin/email',     label: 'E-post' },
    ],
  },
```

- [ ] **Steg 2: Test navigasjon**

Start dev-server og bekreft at lenken "Tapte prosjekter" vises i sidebar og at `/admin/tapte` laster korrekt.

- [ ] **Steg 3: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "feat: add tapte prosjekter link to admin nav"
```
