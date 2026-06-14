# Tilbud-ansvarlig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lagre hvem som er ansvarlig for å sende tilbud på hvert prosjekt, sett ved opprettelse eller via blokkerende modal når prosjektet flyttes til «Sende tilbud»-steget.

**Architecture:** Ny kolonne `quote_assignee_id` på `projects`. Sjekk skjer klient-side i pipeline ved drag (samme mønster som `KontraktWarningModal`). Varsler via eksisterende `notifyAssignment`-infrastruktur med ny type `quote_assigned`.

**Tech Stack:** Next.js 15 App Router, Supabase, TypeScript strict, Tailwind CSS v4

---

## File Map

| Fil | Hva endres |
|-----|-----------|
| `supabase/migrations/065_quote_assignee.sql` | Ny — kolonne + constraint-oppdatering |
| `lib/types.ts` | `Project` + `ProjectWithPipeline` får `quote_assignee_id` |
| `lib/notify-assignment.ts` | Legg til `'quote_assigned'` i type-union |
| `lib/actions/notifications.ts` | Legg til `'quote_assigned'` i `Notification`-type |
| `lib/actions/pipeline.ts` | Ny `assignQuoteAndMove`-action |
| `lib/actions/leads.ts` | `createLead` tar imot `quote_assignee_id?` |
| `app/admin/leads/new/page.tsx` | Hent profiles, legg til person-picker UI |
| `app/admin/pipeline/page.tsx` | `TilbudAssignModal` + state + drag-trigger |

---

## Task 1: Database-migrasjon

**Filer:**
- Opprett: `supabase/migrations/065_quote_assignee.sql`

- [ ] **Opprett migrasjonsfilen**

```sql
-- 065_quote_assignee.sql
-- Legger til ansvarlig for å sende tilbud på hvert prosjekt.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS quote_assignee_id UUID
  REFERENCES auth.users(id) ON DELETE SET NULL;

-- Oppdater notification_type-sjekk med ny type
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned'
  ));
```

- [ ] **Kjør migrasjonen mot Supabase**

Bruk pooler-tilkoblingen (ikke direkte IPv6). Kjør:
```bash
psql "postgresql://postgres.<ref>@aws-1-eu-north-1.pooler.supabase.com:5432/postgres" \
  -f supabase/migrations/065_quote_assignee.sql
```
Erstatt `<ref>` med prosjekt-ref fra Supabase Dashboard.

Forventet output: `ALTER TABLE` × 2, ingen feil.

- [ ] **Verifiser i Supabase Dashboard**

Gå til Table Editor → `projects` — sjekk at kolonnen `quote_assignee_id` er synlig. Gå til `notifications` — sjekk at constraint inkluderer `quote_assigned`.

- [ ] **Commit**

```bash
git add supabase/migrations/065_quote_assignee.sql
git commit -m "feat: migrasjon 065 — quote_assignee_id på projects"
```

---

## Task 2: Oppdater TypeScript-typer

**Filer:**
- Modifiser: `lib/types.ts`
- Modifiser: `lib/notify-assignment.ts`
- Modifiser: `lib/actions/notifications.ts`

- [ ] **Legg til `quote_assignee_id` på `Project`-typen i `lib/types.ts`**

Finn `Project`-typen (rundt linje 43). Legg til feltet etter `pipeline_data`:

```typescript
  pipeline_data?: PipelineData | null
  quote_assignee_id?: string | null   // ← legg til denne linjen
```

- [ ] **Legg til `'quote_assigned'` i `notifyAssignment` i `lib/notify-assignment.ts`**

Finn linje 9 — endre type-union:

```typescript
  type: 'task_assigned' | 'lead_assigned' | 'quote_assigned'
```

- [ ] **Legg til `'quote_assigned'` i `Notification`-typen i `lib/actions/notifications.ts`**

Finn linje 8 — endre type-union:

```typescript
  type: 'project_message' | 'task_message' | 'selection_submitted' | 'task_assigned' | 'lead_assigned' | 'quote_assigned'
```

- [ ] **Verifiser at TypeScript kompilerer**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Commit**

```bash
git add lib/types.ts lib/notify-assignment.ts lib/actions/notifications.ts
git commit -m "feat: legg til quote_assignee_id og quote_assigned-type"
```

---

## Task 3: Ny server action `assignQuoteAndMove`

**Filer:**
- Modifiser: `lib/actions/pipeline.ts`

- [ ] **Legg til import av `notifyAssignment` øverst i `lib/actions/pipeline.ts`**

Finn import-seksjonene øverst i filen. Legg til:

```typescript
import { notifyAssignment } from '@/lib/notify-assignment'
```

- [ ] **Legg til `assignQuoteAndMove` på slutten av `lib/actions/pipeline.ts`** (før siste linjeskift)

```typescript
export async function assignQuoteAndMove(
  projectId: string,
  assigneeId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('title')
      .eq('id', projectId)
      .single()

    if (fetchError || !project) {
      return { ok: false, error: 'Prosjekt ikke funnet' }
    }

    const { error } = await supabase
      .from('projects')
      .update({
        quote_assignee_id: assigneeId,
        pipeline_stage: 'tilbud_sendt',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    if (error) {
      return { ok: false, error: 'Kunne ikke oppdatere prosjekt' }
    }

    await seedTasksFromTemplates(projectId, 'tilbud_sendt')

    await notifyAssignment({
      recipientId: assigneeId,
      type: 'quote_assigned',
      projectId,
      preview: project.title,
    })

    revalidatePath('/admin/pipeline')
    revalidatePath(`/admin/projects/${projectId}`)

    return { ok: true }
  } catch (err) {
    console.error('assignQuoteAndMove unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
```

- [ ] **Verifiser at TypeScript kompilerer**

```bash
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: legg til assignQuoteAndMove server action"
```

---

## Task 4: Oppdater `createLead` med `quote_assignee_id`

**Filer:**
- Modifiser: `lib/actions/leads.ts`

- [ ] **Utvid parameter-typen til `createLead`**

Finn funksjonsignaturen (linje 15). Legg til `quote_assignee_id?` i data-objektet:

```typescript
export async function createLead(data: {
  name: string
  company: string
  email: string
  phone: string
  website: string
  source: string
  reason: string
  sales_points: string[]
  notes: string
  quote_assignee_id?: string
}): Promise<{ leadId: string; projectId: string } | null> {
```

- [ ] **Lagre `quote_assignee_id` ved opprettelse av prosjektet**

Finn `.insert({` for projects (linje ~32). Legg til feltet:

```typescript
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        title: projectTitle,
        slug,
        pipeline_stage: 'lead',
        status: 'draft',
        language: 'no',
        client_name: null,
        quote_assignee_id: data.quote_assignee_id ?? null,
      })
      .select('id')
      .single()
```

- [ ] **Send `quote_assigned`-varsel etter vellykket opprettelse**

Finn `revalidatePath`-kallene på slutten av `try`-blokken (linje ~97), legg til varsel rett over dem:

```typescript
    // Send varsel til tilbud-ansvarlig hvis satt ved opprettelse
    if (data.quote_assignee_id) {
      await notifyAssignment({
        recipientId: data.quote_assignee_id,
        type: 'quote_assigned',
        projectId: project.id,
        preview: projectTitle,
      })
    }

    revalidatePath('/admin/pipeline')
    revalidatePath('/admin/leads')
```

- [ ] **Legg til import av `notifyAssignment` øverst i `lib/actions/leads.ts`**

```typescript
import { notifyAssignment } from '@/lib/notify-assignment'
```

- [ ] **Verifiser at TypeScript kompilerer**

```bash
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Commit**

```bash
git add lib/actions/leads.ts
git commit -m "feat: createLead sender quote_assigned-varsel hvis ansvarlig er satt"
```

---

## Task 5: Person-picker i «Ny lead»-skjemaet

**Filer:**
- Modifiser: `app/admin/leads/new/page.tsx`

- [ ] **Legg til import av `getAllProfiles` øverst**

Finn import-linjen for `createLead`:

```typescript
import { createLead } from '@/lib/actions/leads'
import { getAllProfiles } from '@/lib/actions/pipeline'
```

- [ ] **Legg til state for profiles og valgt assignee**

Finn de andre `useState`-kallene (etter `const [notes, setNotes]`):

```typescript
  const [quoteAssigneeId, setQuoteAssigneeId] = useState('')
  const [profiles, setProfiles] = useState<{ id: string; name: string | null; email: string }[]>([])
```

- [ ] **Hent profiles ved mount — legg til `useEffect` etter de andre**

```typescript
  useEffect(() => {
    getAllProfiles().then(setProfiles)
  }, [])
```

Husk å legge til `useEffect` i import fra `'react'` øverst: `import { useState, useEffect } from 'react'`

- [ ] **Send `quote_assignee_id` med i `createLead`-kallet**

Finn `createLead({`-kallet i `handleSubmit`. Legg til feltet:

```typescript
    const result = await createLead({
      name: name.trim() || company.trim(),
      company,
      email,
      phone,
      website,
      source,
      reason,
      sales_points: salesPoints.filter(s => s.trim()),
      notes,
      quote_assignee_id: quoteAssigneeId || undefined,
    })
```

- [ ] **Legg til picker-UI i Salgsinformasjon-seksjonen**

Finn slutten av Salgsinformasjon-kortet — rett etter salgspunkt-seksjonen og `+ Legg til salgspunkt`-knappen, legg til:

```tsx
              {/* Tilbud-ansvarlig */}
              <div style={{ borderTop: `1px solid rgba(124,92,252,0.2)`, paddingTop: 14, marginTop: 6, display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.accent, whiteSpace: 'nowrap' }}>
                  👤 Tilbud-ansvarlig
                </label>
                <select
                  value={quoteAssigneeId}
                  onChange={e => setQuoteAssigneeId(e.target.value)}
                  style={{ ...inputStyle, flex: 1 }}
                  onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                  onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                >
                  <option value=''>Velg hvem som sender tilbudet... (valgfritt)</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
                  ))}
                </select>
              </div>
```

- [ ] **Verifiser visuelt i nettleseren**

Start dev-server: `npm run dev`  
Gå til `http://localhost:3000/admin/leads/new`  
Sjekk at «Tilbud-ansvarlig»-dropdown vises nederst i Salgsinformasjon med faktiske teamnavn.

- [ ] **Verifiser at en valgt assignee lagres**

Fyll ut navn + velg et teammedlem → klikk «Legg til lead». Sjekk i Supabase Dashboard → `projects` at raden har riktig `quote_assignee_id`. Sjekk `notifications`-tabellen for `quote_assigned`-rad.

- [ ] **Commit**

```bash
git add app/admin/leads/new/page.tsx
git commit -m "feat: person-picker for tilbud-ansvarlig i ny lead-skjema"
```

---

## Task 6: `TilbudAssignModal` og drag-trigger i pipeline

**Filer:**
- Modifiser: `app/admin/pipeline/page.tsx`

- [ ] **Legg til import av `assignQuoteAndMove` øverst i pipeline/page.tsx**

Finn import-linjen for pipeline-actions (linje ~19):

```typescript
import {
  getProjectsForPipeline, updatePipelineStage, setProjectType,
  getTasksForProjects, getAllProfiles, toggleTaskAssignee, updateTaskStatus,
  advanceFromKontraktUnsigned, assignQuoteAndMove,
} from '@/lib/actions/pipeline'
```

- [ ] **Legg til `TilbudAssignModal`-komponenten** rett etter `KontraktWarningModal`-komponenten (ca. linje 100)

```tsx
function TilbudAssignModal({
  projectTitle,
  profiles,
  onConfirm,
  onCancel,
  loading,
}: {
  projectTitle: string
  profiles: { id: string; name: string | null; email: string }[]
  onConfirm: (assigneeId: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [selectedId, setSelectedId] = useState('')

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
      onClick={onCancel}
    >
      <div
        style={{ background: C.surface, border: `1px solid rgba(124,92,252,0.5)`, borderRadius: 12, padding: '24px 28px', width: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 700, color: C.text, marginBottom: 6 }}>
          👤 Hvem sender tilbudet?
        </p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 18 }}>
          <em>«{projectTitle}»</em> flyttes til Sende tilbud — tildel ansvarlig.
        </p>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem',
            color: selectedId ? C.text : C.text3,
            background: C.surface2, border: `1px solid rgba(124,92,252,0.4)`,
            borderRadius: 8, padding: '9px 12px', outline: 'none', marginBottom: 18,
          }}
        >
          <option value=''>Velg teammedlem...</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', padding: '9px 18px', borderRadius: 8, background: 'transparent', color: C.text3, border: `1px solid ${C.border}`, cursor: 'pointer' }}
          >
            Avbryt
          </button>
          <button
            onClick={() => selectedId && onConfirm(selectedId)}
            disabled={!selectedId || loading}
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, padding: '9px 20px', borderRadius: 8, background: C.accent, color: '#fff', border: 'none', cursor: (!selectedId || loading) ? 'default' : 'pointer', opacity: (!selectedId || loading) ? 0.5 : 1, transition: 'opacity 0.15s' }}
          >
            {loading ? 'Flytter...' : 'Flytt prosjekt →'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Legg til state for modal** i hoved-komponenten, rett etter `kontraktWarning`-statene (ca. linje 656):

```typescript
  const [tilbudAssign, setTilbudAssign] = useState<{ projectId: string; projectTitle: string } | null>(null)
  const [tilbudAssignLoading, setTilbudAssignLoading] = useState(false)
```

- [ ] **Legg til trigger-logikk i `moveProject`** — finn sjekken for `kontrakt` inne i `moveProject` (ca. linje 685):

```typescript
    if (project?.pipeline_stage === 'kontrakt' && targetIndex > currentIndex && !(project.pipeline_data as { contract_signed?: boolean } | null)?.contract_signed) {
      setKontraktWarning({ projectId, projectTitle: project.title })
      return
    }
```

Legg til **rett over** den blokken:

```typescript
    if (targetStage === 'tilbud_sendt' && !project?.quote_assignee_id) {
      setTilbudAssign({ projectId, projectTitle: project!.title })
      return
    }
```

- [ ] **Legg til confirm-handler** rett etter `handleKontraktWarningConfirm`-funksjonen:

```typescript
  async function handleTilbudAssignConfirm(assigneeId: string) {
    if (!tilbudAssign) return
    setTilbudAssignLoading(true)
    const result = await assignQuoteAndMove(tilbudAssign.projectId, assigneeId)
    setTilbudAssignLoading(false)
    setTilbudAssign(null)
    if (result.ok) {
      fetchAll()
    }
  }
```

- [ ] **Render `TilbudAssignModal`** i return-statementet, rett etter `{kontraktWarning && ...}`-blokken:

```tsx
      {tilbudAssign && (
        <TilbudAssignModal
          projectTitle={tilbudAssign.projectTitle}
          profiles={profiles}
          onConfirm={handleTilbudAssignConfirm}
          onCancel={() => setTilbudAssign(null)}
          loading={tilbudAssignLoading}
        />
      )}
```

- [ ] **Verifiser at TypeScript kompilerer**

```bash
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Test manuelt — modal vises ved drag uten assignee**

Start dev-server. Gå til `/admin/pipeline`. Dra et prosjekt uten `quote_assignee_id` til «Sende tilbud»-kolonnen. Modal skal blokkere med tittel, dropdown og knapper.

- [ ] **Test manuelt — prosjekt flyttes med varsler etter valg**

Velg et teammedlem i modalen → klikk «Flytt prosjekt». Prosjektet skal havne i «Sende tilbud». Sjekk `notifications`-tabellen i Supabase for ny rad med `type = 'quote_assigned'`.

- [ ] **Test manuelt — prosjekt med assignee kan dras direkte**

Sett `quote_assignee_id` på et prosjekt manuelt i Supabase Dashboard. Dra det til «Sende tilbud» — ingen modal, prosjektet flyttes umiddelbart.

- [ ] **Commit**

```bash
git add app/admin/pipeline/page.tsx
git commit -m "feat: TilbudAssignModal blokkerer drag til Sende tilbud uten ansvarlig"
```
