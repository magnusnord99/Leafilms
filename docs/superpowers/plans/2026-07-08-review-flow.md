# Review-flyt for pitch og tilbud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La en bruker kreve at en kollega godkjenner pitch og/eller tilbud før prosjektet kan publiseres til kunde — reviewer varsles, godkjenner eller sender tilbake med kommentar, med full historikk over review-runder.

**Architecture:** Én ny `reviews`-tabell (én rad per innsending, ikke per objekt — gir historikk gratis) pluss fire nye kolonner på `projects` for av/på + reviewer per type. Server actions i `lib/actions/reviews.ts` gjenbruker eksisterende `notifyAssignment`-varslingsmønster. All UI samles i den allerede eksisterende "Pitch & Tilbud"-fanen i prosjekthub-en (`app/admin/projects/[id]/page.tsx`) via én gjenbrukbar `ReviewPanel`-komponent — i stedet for å spre knapper/badges over pitch-editoren og tilbudssiden. Sperren mot publisering sitter i `usePublishing.ts`.

**Tech Stack:** Next.js 16 App Router, Supabase (PostgreSQL + RLS), TypeScript strict, `@supabase/ssr`, eksisterende `createClient`/`createServiceClient`-mønster.

## Global Constraints

- Aldri bruk `profiles!fk`-join — feiler på RLS. Hent profiler separat og slå sammen i kode (se `lib/actions/quotes.ts`).
- Server actions med `'use server'` bruker `createClient()` for brukerautentiserte operasjoner. `createServiceClient()` brukes kun for notification-inserts (service-level bypass), aldri direkte i denne planen — vi gjenbruker `notifyAssignment` som allerede gjør dette internt.
- Alle nye tabeller trenger RLS med idempotente `DO $$ ... IF NOT EXISTS ... END$$`-blokker rundt `CREATE POLICY` (se `supabase/migrations/080_quote_messages.sql`).
- `notifications_type_check`-constraint må drop+recreate ved utvidelse med nye typer.
- Neste migrasjons-prefix er `086_` (mappen er allerede oppe i `085_`, ikke `065_` som CLAUDE.md sier).
- Design-system i `app/admin/projects/[id]/page.tsx` og `app/admin/projects/new/page.tsx`: inline styles med `C`-farger fra `lib/admin-theme.ts`, font `var(--font-dm-sans)` — ingen Tailwind-klasser, ingen `components/ui`-bruk i disse filene. Følg dette i `ReviewPanel.tsx` også, for visuell konsistens med resten av hub-siden.
- Migrasjoner kjøres med `npx supabase db push`.
- Ingen automatisert testsuite i prosjektet — verifisering er `npx tsc --noEmit`, `npm run lint`, `npm run build`, og manuell test i dev-server.

---

## File Map

| Fil | Status | Ansvar |
|---|---|---|
| `supabase/migrations/086_task_reviews.sql` | Ny | `reviews`-tabell + RLS, 4 nye `projects`-kolonner, utvidet `notifications_type_check` |
| `lib/types.ts` | Endre | `Review`, `ReviewSubjectType`, `ReviewStatus`-typer, nye felter på `Project`, ny type i `Notification['type']` |
| `lib/actions/notifications.ts` | Endre | Utvid `Notification['type']`-union |
| `lib/notify-assignment.ts` | Endre | Utvid `type`-parameter med de 4 nye review-typene |
| `lib/actions/reviews.ts` | Ny | `getReviewHistory`, `getLatestReview`, `requestReview`, `respondToReview`, `updateReviewSettings` |
| `components/project/ReviewPanel.tsx` | Ny | Statusbadge, "Send til review", reviewer-banner (Godkjenn/Be om endringer), historikk |
| `app/admin/projects/[id]/page.tsx` | Endre | Review-innstillinger (av/på + reviewer-valg) og to `ReviewPanel`-instanser i "Pitch & Tilbud"-fanen |
| `hooks/project/usePublishing.ts` | Endre | Sperre publisering hvis pitch/tilbud-review ikke er godkjent |
| `app/admin/projects/new/page.tsx` | Endre | Review-seksjon ved prosjektopprettelse |
| `app/admin/varsler/VarslerClient.tsx` | Endre | Ruting + visning for de 4 nye varselstypene |

---

## Task 1: Database — reviews-tabell, projects-kolonner, types

**Files:**
- Create: `supabase/migrations/086_task_reviews.sql`
- Modify: `lib/types.ts`
- Modify: `lib/actions/notifications.ts`
- Modify: `lib/notify-assignment.ts`

**Interfaces:**
- Produces:
  - `reviews`-tabell i Supabase
  - `projects.pitch_review_enabled`, `projects.pitch_reviewer_id`, `projects.quote_review_enabled`, `projects.quote_reviewer_id`
  - `ReviewSubjectType`, `ReviewStatus`, `Review`-typer i `lib/types.ts`
  - 4 nye gyldige `notifications.type`-verdier: `pitch_review_requested`, `pitch_review_responded`, `quote_review_requested`, `quote_review_responded`

- [ ] **Steg 1: Skriv migrasjonen**

Opprett `/Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch/supabase/migrations/086_task_reviews.sql`:

```sql
-- 086_task_reviews.sql
-- Review-flyt: krev godkjenning av en kollega før pitch/tilbud kan publiseres.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pitch_review_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pitch_reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_review_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quote_reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS reviews (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  subject_type  TEXT        NOT NULL CHECK (subject_type IN ('pitch', 'quote')),
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'changes_requested')),
  requested_by  UUID        NOT NULL REFERENCES auth.users(id),
  reviewer_id   UUID        NOT NULL REFERENCES auth.users(id),
  comment       TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_project_subject ON reviews(project_id, subject_type, created_at DESC);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reviews' AND policyname = 'authed_read_reviews'
  ) THEN
    EXECUTE 'CREATE POLICY "authed_read_reviews" ON reviews FOR SELECT TO authenticated USING (true)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reviews' AND policyname = 'authed_insert_reviews'
  ) THEN
    EXECUTE 'CREATE POLICY "authed_insert_reviews" ON reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = requested_by)';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'reviews' AND policyname = 'authed_update_reviews'
  ) THEN
    EXECUTE 'CREATE POLICY "authed_update_reviews" ON reviews FOR UPDATE TO authenticated USING (auth.uid() = reviewer_id) WITH CHECK (auth.uid() = reviewer_id)';
  END IF;
END$$;

-- Utvid notifications type-constraint med de 4 nye review-typene
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention', 'quote_message',
    'pitch_review_requested', 'pitch_review_responded',
    'quote_review_requested', 'quote_review_responded'
  ));
```

- [ ] **Steg 2: Kjør migrasjonen**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch
npx supabase db push
```

Forventet output: migrasjonen kjøres uten feil. Sjekk i Supabase Dashboard at `reviews`-tabellen finnes og at `projects` har de 4 nye kolonnene.

- [ ] **Steg 3: Legg til typer i `lib/types.ts`**

Finn `QuoteMessage`-typen (rundt linje 87–96) og legg til rett etter den:

```typescript
export type ReviewSubjectType = 'pitch' | 'quote'
export type ReviewStatus = 'pending' | 'approved' | 'changes_requested'

export type Review = {
  id: string
  project_id: string
  subject_type: ReviewSubjectType
  status: ReviewStatus
  requested_by: string
  reviewer_id: string
  comment: string | null
  requested_at: string
  responded_at: string | null
  created_at: string
  requester: { id: string; name: string | null; email: string } | null
  reviewer: { id: string; name: string | null; email: string } | null
}
```

Finn `Project`-typen (linje 43–69) og legg til de 4 nye feltene rett før `created_at: string`:

```typescript
  pitch_review_enabled?: boolean
  pitch_reviewer_id?: string | null
  quote_review_enabled?: boolean
  quote_reviewer_id?: string | null
```

- [ ] **Steg 4: Utvid `Notification['type']` i `lib/actions/notifications.ts`**

I `lib/actions/notifications.ts` linje 9, erstatt:

```typescript
// Før:
  type: 'project_message' | 'task_message' | 'selection_submitted' | 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned' | 'quote_mention' | 'project_message_mention' | 'task_message_mention' | 'quote_message'

// Etter:
  type: 'project_message' | 'task_message' | 'selection_submitted' | 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned' | 'quote_mention' | 'project_message_mention' | 'task_message_mention' | 'quote_message' | 'pitch_review_requested' | 'pitch_review_responded' | 'quote_review_requested' | 'quote_review_responded'
```

- [ ] **Steg 5: Utvid `notifyAssignment` i `lib/notify-assignment.ts`**

I `lib/notify-assignment.ts` linje 9, erstatt:

```typescript
// Før:
  type: 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned' | 'quote_mention'

// Etter:
  type: 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned' | 'quote_mention' | 'pitch_review_requested' | 'pitch_review_responded' | 'quote_review_requested' | 'quote_review_responded'
```

- [ ] **Steg 6: Verifiser TypeScript**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch
npx tsc --noEmit 2>&1 | head -30
```

Forventet: ingen feil.

- [ ] **Steg 7: Commit**

```bash
git add supabase/migrations/086_task_reviews.sql lib/types.ts lib/actions/notifications.ts lib/notify-assignment.ts
git commit -m "feat: add reviews table and review settings columns for pitch/quote review flow"
```

---

## Task 2: Server actions — `lib/actions/reviews.ts`

**Files:**
- Create: `lib/actions/reviews.ts`

**Interfaces:**
- Consumes: `Review`, `ReviewSubjectType`, `ReviewStatus` fra `lib/types.ts` (Task 1), `notifyAssignment` fra `lib/notify-assignment.ts` (Task 1)
- Produces:
  - `getReviewHistory(projectId: string, subjectType: ReviewSubjectType): Promise<Review[]>`
  - `getLatestReview(projectId: string, subjectType: ReviewSubjectType): Promise<Review | null>`
  - `requestReview(projectId: string, subjectType: ReviewSubjectType): Promise<{ ok: boolean; error?: string }>`
  - `respondToReview(reviewId: string, decision: 'approved' | 'changes_requested', comment?: string): Promise<{ ok: boolean; error?: string }>`
  - `updateReviewSettings(projectId: string, settings: { pitch_review_enabled?: boolean; pitch_reviewer_id?: string | null; quote_review_enabled?: boolean; quote_reviewer_id?: string | null }): Promise<{ ok: boolean; error?: string }>`

- [ ] **Steg 1: Skriv `lib/actions/reviews.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { notifyAssignment } from '@/lib/notify-assignment'
import type { Review, ReviewSubjectType } from '@/lib/types'

type ProfileRow = { id: string; name: string | null; email: string }

async function attachProfiles(supabase: Awaited<ReturnType<typeof createClient>>, rows: Omit<Review, 'requester' | 'reviewer'>[]): Promise<Review[]> {
  if (rows.length === 0) return []
  const userIds = [...new Set(rows.flatMap(r => [r.requested_by, r.reviewer_id]))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', userIds)
  const profileMap = Object.fromEntries(((profiles ?? []) as ProfileRow[]).map(p => [p.id, p]))
  return rows.map(r => ({
    ...r,
    requester: profileMap[r.requested_by] ?? null,
    reviewer: profileMap[r.reviewer_id] ?? null,
  }))
}

export async function getReviewHistory(projectId: string, subjectType: ReviewSubjectType): Promise<Review[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('reviews')
      .select('id, project_id, subject_type, status, requested_by, reviewer_id, comment, requested_at, responded_at, created_at')
      .eq('project_id', projectId)
      .eq('subject_type', subjectType)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('getReviewHistory error:', error)
      return []
    }
    return attachProfiles(supabase, (data ?? []) as Omit<Review, 'requester' | 'reviewer'>[])
  } catch (err) {
    console.error('getReviewHistory unexpected error:', err)
    return []
  }
}

export async function getLatestReview(projectId: string, subjectType: ReviewSubjectType): Promise<Review | null> {
  const history = await getReviewHistory(projectId, subjectType)
  return history[0] ?? null
}

export async function requestReview(projectId: string, subjectType: ReviewSubjectType): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const reviewerColumn = subjectType === 'pitch' ? 'pitch_reviewer_id' : 'quote_reviewer_id'
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`${reviewerColumn}, title`)
      .eq('id', projectId)
      .single()

    if (projectError || !project) return { ok: false, error: 'Fant ikke prosjektet' }

    const reviewerId = (project as unknown as Record<string, string | null>)[reviewerColumn]
    if (!reviewerId) {
      return { ok: false, error: 'Ingen reviewer valgt for denne typen ennå — velg en i prosjektinnstillingene' }
    }

    const { error: insertError } = await supabase.from('reviews').insert({
      project_id: projectId,
      subject_type: subjectType,
      status: 'pending',
      requested_by: user.id,
      reviewer_id: reviewerId,
    })

    if (insertError) {
      console.error('requestReview insert error:', insertError)
      return { ok: false, error: 'Kunne ikke sende til review' }
    }

    const label = subjectType === 'pitch' ? 'pitchen' : 'tilbudet'
    await notifyAssignment({
      recipientId: reviewerId,
      type: subjectType === 'pitch' ? 'pitch_review_requested' : 'quote_review_requested',
      projectId,
      preview: `Ber deg godkjenne ${label} for "${(project as unknown as { title: string }).title}"`,
    })

    revalidatePath(`/admin/projects/${projectId}`)
    return { ok: true }
  } catch (err) {
    console.error('requestReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function respondToReview(reviewId: string, decision: 'approved' | 'changes_requested', comment?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: review, error: fetchError } = await supabase
      .from('reviews')
      .select('id, project_id, subject_type, requested_by, reviewer_id')
      .eq('id', reviewId)
      .single()

    if (fetchError || !review) return { ok: false, error: 'Fant ikke review-forespørselen' }

    const { error: updateError } = await supabase
      .from('reviews')
      .update({
        status: decision,
        comment: comment?.trim() || null,
        responded_at: new Date().toISOString(),
      })
      .eq('id', reviewId)

    if (updateError) {
      console.error('respondToReview update error:', updateError)
      return { ok: false, error: 'Kunne ikke lagre svaret' }
    }

    const label = review.subject_type === 'pitch' ? 'pitchen' : 'tilbudet'
    const preview = decision === 'approved'
      ? `Godkjente ${label}`
      : `Ba om endringer på ${label}${comment ? `: ${comment}` : ''}`

    await notifyAssignment({
      recipientId: review.requested_by,
      type: review.subject_type === 'pitch' ? 'pitch_review_responded' : 'quote_review_responded',
      projectId: review.project_id,
      preview,
    })

    revalidatePath(`/admin/projects/${review.project_id}`)
    return { ok: true }
  } catch (err) {
    console.error('respondToReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function updateReviewSettings(projectId: string, settings: {
  pitch_review_enabled?: boolean
  pitch_reviewer_id?: string | null
  quote_review_enabled?: boolean
  quote_reviewer_id?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('projects')
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq('id', projectId)

    if (error) {
      console.error('updateReviewSettings error:', error)
      return { ok: false, error: 'Kunne ikke oppdatere review-innstillinger' }
    }

    revalidatePath(`/admin/projects/${projectId}`)
    return { ok: true }
  } catch (err) {
    console.error('updateReviewSettings unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
```

**Merk:** `notifyAssignment` hopper allerede over selv-varsling (`user.id === opts.recipientId`) og svelger feil internt — ingen ekstra try/catch trengs rundt disse kallene.

- [ ] **Steg 2: Verifiser TypeScript**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch
npx tsc --noEmit 2>&1 | grep "reviews.ts"
```

Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add lib/actions/reviews.ts
git commit -m "feat: add review server actions (request, respond, history, settings)"
```

---

## Task 3: `ReviewPanel`-komponent

**Files:**
- Create: `components/project/ReviewPanel.tsx`

**Interfaces:**
- Consumes: `getReviewHistory`, `requestReview`, `respondToReview` fra `lib/actions/reviews.ts` (Task 2), `Review`, `ReviewSubjectType` fra `lib/types.ts` (Task 1)
- Produces: `<ReviewPanel projectId subjectType enabled currentUserId onSettingsChanged? />` — selvforsynt, henter egen data, ingen props for review-data sendes inn utenfra

- [ ] **Steg 1: Skriv `components/project/ReviewPanel.tsx`**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { getReviewHistory, requestReview, respondToReview } from '@/lib/actions/reviews'
import type { Review, ReviewSubjectType } from '@/lib/types'
import { C } from '@/lib/admin-theme'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('nb-NO', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const STATUS_LABEL: Record<Review['status'], string> = {
  pending: 'Venter på review',
  approved: 'Godkjent',
  changes_requested: 'Endringer ønsket',
}

const STATUS_COLOR: Record<Review['status'], string> = {
  pending: '#F0A500',
  approved: '#4CAF7D',
  changes_requested: C.danger,
}

export default function ReviewPanel({
  projectId,
  subjectType,
  enabled,
  currentUserId,
}: {
  projectId: string
  subjectType: ReviewSubjectType
  enabled: boolean
  currentUserId: string | null
}) {
  const [history, setHistory] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [commentBoxOpen, setCommentBoxOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function reload() {
    const data = await getReviewHistory(projectId, subjectType)
    setHistory(data)
    setLoading(false)
  }

  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, subjectType, enabled])

  if (!enabled) return null
  if (loading) return null

  const latest = history[0] ?? null
  const isReviewer = latest?.status === 'pending' && latest.reviewer_id === currentUserId
  const label = subjectType === 'pitch' ? 'pitchen' : 'tilbudet'

  async function handleRequestReview() {
    setSubmitting(true)
    const result = await requestReview(projectId, subjectType)
    if (!result.ok) alert(result.error ?? 'Kunne ikke sende til review')
    await reload()
    setSubmitting(false)
  }

  async function handleApprove() {
    if (!latest) return
    setSubmitting(true)
    const result = await respondToReview(latest.id, 'approved')
    if (!result.ok) alert(result.error ?? 'Kunne ikke godkjenne')
    await reload()
    setSubmitting(false)
  }

  async function handleRequestChanges() {
    if (!latest || !comment.trim()) return
    setSubmitting(true)
    const result = await respondToReview(latest.id, 'changes_requested', comment.trim())
    if (!result.ok) alert(result.error ?? 'Kunne ikke sende tilbakemelding')
    setComment('')
    setCommentBoxOpen(false)
    await reload()
    setSubmitting(false)
  }

  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {latest && (
          <span style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500,
            color: STATUS_COLOR[latest.status], background: `${STATUS_COLOR[latest.status]}18`,
            padding: '2px 8px', borderRadius: 4,
          }}>
            {STATUS_LABEL[latest.status]}
            {latest.reviewer?.name || latest.reviewer?.email ? ` — ${latest.reviewer.name ?? latest.reviewer.email}` : ''}
          </span>
        )}
        {!latest && (
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
            Ikke sendt til review ennå
          </span>
        )}

        {(!latest || latest.status !== 'pending') && (
          <button
            onClick={handleRequestReview}
            disabled={submitting}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500,
              padding: '3px 10px', borderRadius: 5, cursor: submitting ? 'default' : 'pointer',
              background: 'none', color: C.accent, border: `1px solid ${C.accent}`,
              opacity: submitting ? 0.5 : 1,
            }}
          >
            Send til review
          </button>
        )}

        {history.length > 0 && (
          <button
            onClick={() => setHistoryOpen(o => !o)}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem',
              background: 'none', border: 'none', color: C.text3, cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            {historyOpen ? 'Skjul historikk' : `Historikk (${history.length})`}
          </button>
        )}
      </div>

      {isReviewer && (
        <div style={{
          marginTop: 8, padding: '10px 12px', borderRadius: 6,
          background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.3)',
        }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: '#F0A500', marginBottom: 8 }}>
            {latest?.requester?.name ?? latest?.requester?.email ?? 'Noen'} ber deg godkjenne {label}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleApprove}
              disabled={submitting}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600,
                padding: '5px 12px', borderRadius: 5, cursor: submitting ? 'default' : 'pointer',
                background: '#4CAF7D', color: '#fff', border: 'none', opacity: submitting ? 0.5 : 1,
              }}
            >
              Godkjenn
            </button>
            <button
              onClick={() => setCommentBoxOpen(o => !o)}
              disabled={submitting}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500,
                padding: '5px 12px', borderRadius: 5, cursor: submitting ? 'default' : 'pointer',
                background: 'none', color: C.text2, border: `1px solid ${C.border}`,
              }}
            >
              Be om endringer
            </button>
          </div>
          {commentBoxOpen && (
            <div style={{ marginTop: 8 }}>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={2}
                placeholder="Hva bør endres?"
                style={{
                  width: '100%', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem',
                  padding: '6px 10px', borderRadius: 5, resize: 'vertical',
                  background: C.surface, border: `1px solid ${C.border}`, color: C.text, outline: 'none',
                }}
              />
              <button
                onClick={handleRequestChanges}
                disabled={submitting || !comment.trim()}
                style={{
                  marginTop: 6, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600,
                  padding: '5px 12px', borderRadius: 5,
                  cursor: submitting || !comment.trim() ? 'default' : 'pointer',
                  background: C.danger, color: '#fff', border: 'none',
                  opacity: submitting || !comment.trim() ? 0.5 : 1,
                }}
              >
                Send tilbakemelding
              </button>
            </div>
          )}
        </div>
      )}

      {historyOpen && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {history.map(r => (
            <div key={r.id} style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3,
              padding: '6px 10px', background: C.surface2, borderRadius: 5,
            }}>
              <span style={{ color: C.text2 }}>{r.requester?.name ?? r.requester?.email ?? 'Ukjent'}</span>
              {' → '}
              <span style={{ color: C.text2 }}>{r.reviewer?.name ?? r.reviewer?.email ?? 'Ukjent'}</span>
              {' · '}
              <span style={{ color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
              {' · '}
              {formatTime(r.requested_at)}
              {r.comment && <div style={{ marginTop: 3, fontStyle: 'italic' }}>&ldquo;{r.comment}&rdquo;</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Steg 2: Verifiser TypeScript**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch
npx tsc --noEmit 2>&1 | grep "ReviewPanel.tsx"
```

Forventet: ingen feil. **Merk:** `lib/admin-theme.ts` sin `C` har `danger` men ikke `success` (kun `app/admin/projects/[id]/page.tsx` sin egen lokale `C`, linje 17–29, har `success: '#4CAF7D'`). Siden `ReviewPanel.tsx` importerer den delte `lib/admin-theme.ts`, brukes literal-hex `'#4CAF7D'` for godkjent-status i stedet for `C.success`, som over.

- [ ] **Steg 3: Commit**

```bash
git add components/project/ReviewPanel.tsx
git commit -m "feat: add ReviewPanel component for review status, request, and approve/reject UI"
```

---

## Task 4: Wire inn i prosjekthub-en — innstillinger + ReviewPanel

**Files:**
- Modify: `app/admin/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `ReviewPanel` (Task 3), `updateReviewSettings` fra `lib/actions/reviews.ts` (Task 2), eksisterende `profiles`-state (linje 603) og `currentUserId`-state (linje 662)
- Produces: Review-innstillinger og statuspaneler synlige i "Pitch & Tilbud"-fanen

- [ ] **Steg 1: Importer nye avhengigheter**

Øverst i `app/admin/projects/[id]/page.tsx`, finn import-linjen for `lib/actions/pipeline` (linje 6) og legg til rett under:

```typescript
import { updateReviewSettings } from '@/lib/actions/reviews'
import ReviewPanel from '@/components/project/ReviewPanel'
```

- [ ] **Steg 2: Legg til lokal state for innstillingene**

Finn `const [currentUserId, setCurrentUserId] = useState<string | null>(null)` (linje 662) og legg til rett etter:

```typescript
  const [reviewSettings, setReviewSettings] = useState({
    pitch_review_enabled: false,
    pitch_reviewer_id: null as string | null,
    quote_review_enabled: false,
    quote_reviewer_id: null as string | null,
  })
```

- [ ] **Steg 3: Initialiser state fra prosjektdata**

Finn stedet der `hubData` settes etter `getProjectHub`-kallet i `loadAll`/`useEffect` (samme sted som `setProjectLead_(data.project.project_lead ?? null)` på linje 682) og legg til rett etter:

```typescript
      setReviewSettings({
        pitch_review_enabled: data.project.pitch_review_enabled ?? false,
        pitch_reviewer_id: data.project.pitch_reviewer_id ?? null,
        quote_review_enabled: data.project.quote_review_enabled ?? false,
        quote_reviewer_id: data.project.quote_reviewer_id ?? null,
      })
```

- [ ] **Steg 4: Handler for å endre innstillinger**

Legg til rett etter `handleSetLead` (linje 887–893):

```typescript
  async function handleReviewSettingChange(patch: Partial<typeof reviewSettings>) {
    const next = { ...reviewSettings, ...patch }
    setReviewSettings(next)
    const result = await updateReviewSettings(projectId, patch)
    if (!result.ok) setReviewSettings(reviewSettings)
  }
```

- [ ] **Steg 5: Legg til innstillinger + paneler i "Pitch & Tilbud"-fanen**

Finn `{activeTab === 'pitch' && (` (linje 1363) og `<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>` rett under (linje 1364). Legg til en ny blokk som **første barn** inni denne diven, før `{!hasSections ? (`:

```typescript
            {/* Review-innstillinger */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Review
              </p>
              {([
                { key: 'pitch' as const, label: 'Krev godkjenning av pitch', enabledKey: 'pitch_review_enabled' as const, reviewerKey: 'pitch_reviewer_id' as const },
                { key: 'quote' as const, label: 'Krev godkjenning av tilbud', enabledKey: 'quote_review_enabled' as const, reviewerKey: 'quote_reviewer_id' as const },
              ]).map(row => (
                <div key={row.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={reviewSettings[row.enabledKey]}
                        onChange={e => handleReviewSettingChange({ [row.enabledKey]: e.target.checked })}
                      />
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>{row.label}</span>
                    </label>
                    {reviewSettings[row.enabledKey] && (
                      <select
                        value={reviewSettings[row.reviewerKey] ?? ''}
                        onChange={e => handleReviewSettingChange({ [row.reviewerKey]: e.target.value || null })}
                        style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
                          padding: '4px 8px', borderRadius: 5,
                          background: C.surface2, border: `1px solid ${C.border}`, color: C.text,
                        }}
                      >
                        <option value="">Velg reviewer...</option>
                        {profiles.map(p => (
                          <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <ReviewPanel
                    projectId={projectId}
                    subjectType={row.key}
                    enabled={reviewSettings[row.enabledKey]}
                    currentUserId={currentUserId}
                  />
                </div>
              ))}
            </div>
```

**Merk:** `ReviewPanel` returnerer `null` internt når `enabled` er `false`, så den kan trygt monteres alltid — ingen ekstra betinget rendering trengs rundt den. `profiles` og `currentUserId` er allerede tilgjengelige i denne komponenten fra eksisterende state.

- [ ] **Steg 6: Verifiser TypeScript**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch
npx tsc --noEmit 2>&1 | grep "page.tsx"
```

Forventet: ingen feil relatert til denne filen.

- [ ] **Steg 7: Manuell test**

1. `npm run dev`, åpne et prosjekt, gå til "Pitch & Tilbud"-fanen.
2. Kryss av "Krev godkjenning av pitch" → velg en reviewer i dropdownen → sjekk at valget lagres (last siden på nytt, sjekk at kryss + reviewer fortsatt er satt).
3. Trykk "Send til review" → badge skal endre seg til "Venter på review — [navn]".
4. Logg inn som den valgte reviewer-brukeren (annen nettleser/inkognito) → åpne samme prosjekt → "Pitch & Tilbud"-fanen skal vise banner "... ber deg godkjenne pitchen" med Godkjenn/Be om endringer.
5. Trykk "Godkjenn" → badge skal bli "Godkjent" hos begge brukere (last på nytt for å bekrefte).
6. Gjenta med "Be om endringer" + kommentar → badge blir "Endringer ønsket", kommentaren vises i historikken.

- [ ] **Steg 8: Commit**

```bash
git add app/admin/projects/[id]/page.tsx
git commit -m "feat: wire review settings and ReviewPanel into Pitch & Tilbud tab"
```

---

## Task 5: Sperre publisering på ikke-godkjent review

**Files:**
- Modify: `hooks/project/usePublishing.ts`

**Interfaces:**
- Consumes: `getLatestReview` fra `lib/actions/reviews.ts` (Task 2), `project.pitch_review_enabled`, `project.quote_review_enabled` (Task 1)

- [ ] **Steg 1: Importer `getLatestReview`**

Øverst i `hooks/project/usePublishing.ts`:

```typescript
import { getLatestReview } from '@/lib/actions/reviews'
```

- [ ] **Steg 2: Legg til sperresjekk i PUBLISER-grenen**

Finn `} else {` (linje 41, starten av PUBLISER-grenen) og legg til rett etter, før `// PUBLISER`-kommentaren gjør noe:

```typescript
      } else {
        // PUBLISER
        if (project?.pitch_review_enabled) {
          const latest = await getLatestReview(projectId, 'pitch')
          if (latest?.status !== 'approved') {
            alert(`Pitchen må godkjennes${latest?.reviewer ? ' av ' + (latest.reviewer.name ?? latest.reviewer.email) : ''} først.`)
            setPublishing(false)
            return
          }
        }
        if (project?.quote_review_enabled) {
          const latest = await getLatestReview(projectId, 'quote')
          if (latest?.status !== 'approved') {
            alert(`Tilbudet må godkjennes${latest?.reviewer ? ' av ' + (latest.reviewer.name ?? latest.reviewer.email) : ''} først.`)
            setPublishing(false)
            return
          }
        }

        const token = Math.random().toString(36).substring(2, 15) +
                      Math.random().toString(36).substring(2, 15)
```

(Resten av PUBLISER-grenen er uendret — fjern kun den gamle første linjen `const token = ...` fra sin opprinnelige plass siden den nå flyttes ned rett etter sperresjekken.)

- [ ] **Steg 3: Verifiser TypeScript**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch
npx tsc --noEmit 2>&1 | grep "usePublishing.ts"
```

Forventet: ingen feil.

- [ ] **Steg 4: Manuell test**

1. På et prosjekt med "Krev godkjenning av pitch" på og siste review ≠ `approved`: gå til pitch-editoren (`/edit`), trykk "Publiser" → skal blokkeres med alert, prosjektet forblir `draft`.
2. Godkjenn pitchen (som reviewer, se Task 4 steg 7) → trykk "Publiser" på nytt → skal fungere normalt.
3. Skru på "Krev godkjenning av tilbud" også, men ikke godkjenn den → "Publiser" skal fortsatt blokkeres selv om pitch er godkjent.
4. Skru av begge review-kravene → "Publiser" skal fungere uten noen sjekk, som i dag.
5. Bekreft at "Avpubliser" (når prosjektet allerede er `published`) fungerer uendret, uavhengig av review-status.

- [ ] **Steg 5: Commit**

```bash
git add hooks/project/usePublishing.ts
git commit -m "feat: block project publishing until required pitch/quote reviews are approved"
```

---

## Task 6: Review-seksjon ved prosjektopprettelse

**Files:**
- Modify: `app/admin/projects/new/page.tsx`

**Interfaces:**
- Consumes: `profiles`-liste (ny fetch, samme mønster som eksisterende `customers`-fetch i denne filen)
- Produces: `projects.insert()`-kallet inkluderer de 4 review-feltene når nytt prosjekt opprettes (ikke ved gjenbruk av eksisterende prosjekt — se merknad i steg 4)

- [ ] **Steg 1: Legg til profiles-state og -fetch**

Finn `const [customers, setCustomers] = useState<Customer[]>([])` (linje 149) og legg til rett etter:

```typescript
  const [profiles, setProfiles] = useState<{ id: string; name: string | null; email: string }[]>([])
```

Finn `fetchCustomers()`-funksjonen (linje 192–198) og legg til en tilsvarende funksjon rett etter:

```typescript
  async function fetchProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .order('name', { ascending: true })
    if (!error && data) setProfiles(data as { id: string; name: string | null; email: string }[])
  }
```

Finn `useEffect(() => { fetchCustomers() ...` (linje 170) og legg til kallet:

```typescript
  useEffect(() => {
    fetchCustomers()
    fetchProfiles()
    // resten av useEffect-bodyen uendret
```

- [ ] **Steg 2: Legg til review-felter i `formData`**

Finn `formData`-objektet (linje 155–166) og legg til før `pipeline_stage: 'lead' as PipelineStage,`:

```typescript
    pitch_review_enabled: false,
    pitch_reviewer_id: null as string | null,
    quote_review_enabled: false,
    quote_reviewer_id: null as string | null,
```

- [ ] **Steg 3: Legg til review-seksjon i skjemaet**

Finn `{/* Section: Kontekst */}`-blokken (linje 696) og legg til en ny seksjon rett før den:

```typescript
          {/* Section: Review */}
          <div>
            {sectionDivider('Review')}
            <div className="space-y-6">
              {([
                { key: 'pitch' as const, label: 'Krev godkjenning av pitch', enabledField: 'pitch_review_enabled' as const, reviewerField: 'pitch_reviewer_id' as const },
                { key: 'quote' as const, label: 'Krev godkjenning av tilbud', enabledField: 'quote_review_enabled' as const, reviewerField: 'quote_reviewer_id' as const },
              ]).map(row => (
                <div key={row.key} className="flex items-center gap-3 flex-wrap">
                  {chipBtn(
                    formData[row.enabledField],
                    () => setFormData({ ...formData, [row.enabledField]: !formData[row.enabledField] }),
                    row.label
                  )}
                  {formData[row.enabledField] && (
                    <select
                      value={formData[row.reviewerField] ?? ''}
                      onChange={e => setFormData({ ...formData, [row.reviewerField]: e.target.value || null })}
                      style={selectStyle}
                    >
                      <option value="">Velg reviewer...</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, letterSpacing: '0.06em' }}>
                Valgfritt — kan endres senere på prosjektsiden
              </p>
            </div>
          </div>

```

- [ ] **Steg 4: Send med i `.insert()`-kallet**

Finn `.insert({` i `handleSubmit` (linje 285–297, den nye-prosjekt-grenen — **ikke** `existingProjectId`-grenen på linje 259–276, siden gjenbruk av eksisterende prosjekt ikke skal overskrive review-innstillinger som allerede kan være satt) og legg til før `metadata`:

```typescript
        const { data: inserted, error: projectError } = await supabase
          .from('projects')
          .insert({
            title: formData.title,
            slug,
            client_name: clientName,
            customer_id: customerId,
            status: 'draft',
            language: formData.language,
            project_type: formData.project_type || null,
            pipeline_stage: formData.pipeline_stage,
            pitch_review_enabled: formData.pitch_review_enabled,
            pitch_reviewer_id: formData.pitch_reviewer_id,
            quote_review_enabled: formData.quote_review_enabled,
            quote_reviewer_id: formData.quote_reviewer_id,
            metadata
          })
          .select()
          .single()
```

- [ ] **Steg 5: Verifiser TypeScript**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch
npx tsc --noEmit 2>&1 | grep "projects/new/page.tsx"
```

Forventet: ingen feil.

- [ ] **Steg 6: Manuell test**

1. Gå til `/admin/projects/new`, fyll ut skjemaet, kryss av "Krev godkjenning av pitch", velg en reviewer.
2. Opprett prosjektet → gå til prosjektets "Pitch & Tilbud"-fane → bekreft at kravet og reviewer allerede står riflet inn (fra Task 4-panelet).

- [ ] **Steg 7: Commit**

```bash
git add app/admin/projects/new/page.tsx
git commit -m "feat: add review requirement fields to new project form"
```

---

## Task 7: Varsel-ruting og -visning for review-typene

**Files:**
- Modify: `app/admin/varsler/VarslerClient.tsx`

**Interfaces:**
- Consumes: `Notification['type']`-union (Task 1, allerede utvidet)

- [ ] **Steg 1: Legg til ruting i `handleClick`**

Finn `else if (n.type === 'invoice_assigned') {` (linje 86) i `handleClick` og legg til en ny `else if`-gren rett før den:

```typescript
    } else if (n.type === 'pitch_review_requested' || n.type === 'pitch_review_responded' || n.type === 'quote_review_requested' || n.type === 'quote_review_responded') {
      router.push(`/admin/projects/${n.project_id}?tab=pitch`)
    } else if (n.type === 'invoice_assigned') {
```

- [ ] **Steg 2: Legg til label i tekst-visningen**

Finn `switch`/if-kjeden for meldingsteksten (linje 193–201, `n.type === 'project_message' ? '...' : ...`) og legg til nye grener rett før den avsluttende `: 'i en oppgave'}`:

```typescript
                      {n.type === 'project_message' ? 'i prosjekt-chatten'
                        : n.type === 'project_message_mention' ? 'nevnte deg i prosjekt-chatten'
                        : n.type === 'task_message_mention' ? 'nevnte deg i en oppgave'
                        : n.type === 'task_assigned' ? 'tildelte deg en oppgave'
                        : n.type === 'lead_assigned' ? 'satte deg som ansvarlig for en lead'
                        : n.type === 'selection_submitted' ? 'sendte inn bildevalg'
                        : n.type === 'quote_mention' ? 'tagget deg i tilbud'
                        : n.type === 'quote_message' ? 'i tilbudschatten'
                        : n.type === 'pitch_review_requested' ? 'ber deg godkjenne pitchen'
                        : n.type === 'pitch_review_responded' ? 'svarte på review av pitchen'
                        : n.type === 'quote_review_requested' ? 'ber deg godkjenne tilbudet'
                        : n.type === 'quote_review_responded' ? 'svarte på review av tilbudet'
                        : 'i en oppgave'}
```

- [ ] **Steg 3: Legg til ikon for review-typene**

Finn ikon-conditionalen (linje 165–183) og legg til en ny gren rett før den siste `) : (` (default-ikonet):

```typescript
                  {n.type === 'task_assigned' || n.type === 'lead_assigned' ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                  ) : n.type === 'project_message_mention' || n.type === 'task_message_mention' || n.type === 'quote_mention' ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5" />
                    </svg>
                  ) : n.type === 'project_message' || n.type === 'quote_message' ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  ) : n.type === 'pitch_review_requested' || n.type === 'pitch_review_responded' || n.type === 'quote_review_requested' || n.type === 'quote_review_responded' ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />
                    </svg>
                  ) : (
```

- [ ] **Steg 4: Verifiser TypeScript**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch
npx tsc --noEmit 2>&1 | grep "VarslerClient.tsx"
```

Forventet: ingen feil.

- [ ] **Steg 5: Manuell test**

1. Trigger en `pitch_review_requested` (Task 4 steg 7.3) → gå til `/admin/varsler` → sjekk at varselet viser riktig ikon, "... ber deg godkjenne pitchen", og at klikk ruter til `/admin/projects/[id]?tab=pitch` med "Pitch & Tilbud"-fanen aktiv.
2. Gjenta for de tre andre typene (`pitch_review_responded`, `quote_review_requested`, `quote_review_responded`).

- [ ] **Steg 6: Commit**

```bash
git add app/admin/varsler/VarslerClient.tsx
git commit -m "feat: route and display review notifications in varsler page"
```

---

## Task 8: Full byggverifisering

**Files:** Ingen nye — kun verifisering av hele endringssettet.

- [ ] **Steg 1: Full TypeScript-sjekk**

```bash
cd /Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch
npx tsc --noEmit
```

Forventet: ingen feil i hele prosjektet.

- [ ] **Steg 2: Lint**

```bash
npm run lint
```

Forventet: ingen nye feil (eksisterende warnings i urelaterte filer er OK).

- [ ] **Steg 3: Full build**

```bash
npm run build
```

Forventet: bygget fullføres uten feil.

- [ ] **Steg 4: End-to-end manuell test av hele flyten**

Følg testsekvensen fra spec-en (`docs/superpowers/specs/2026-07-08-review-flow-design.md`, "Testing"-seksjonen), punkt 1–8, på et ekte testprosjekt.

- [ ] **Steg 5: Commit (kun hvis noe måtte rettes i stegene over)**

```bash
git add -A
git commit -m "fix: address build/lint issues from review flow implementation"
```

---

## Spec Coverage Check

| Spec-punkt | Task |
|---|---|
| `reviews`-tabell, 4 nye `projects`-kolonner, RLS | Task 1 |
| `notifications_type_check` utvidet med 4 nye typer | Task 1 |
| `Review`, `ReviewSubjectType`, `ReviewStatus`-typer | Task 1 |
| `getReviewHistory`, `getLatestReview` | Task 2 |
| `requestReview` (med manglende-reviewer-håndtering) | Task 2 |
| `respondToReview` (godkjenn / endringer ønsket + kommentar) | Task 2 |
| `updateReviewSettings` | Task 2 |
| Varsling ved forespørsel og svar (gjenbruk av `notifyAssignment`) | Task 2 |
| Statusbadge (4 tilstander) | Task 3 |
| "Send til review"-knapp | Task 3 |
| Reviewer-banner med Godkjenn/Be om endringer | Task 3 |
| Full review-historikk, ekspanderbar | Task 3 |
| Review-innstillinger (av/på + reviewer) redigerbare senere | Task 4 |
| Paneler synlige i "Pitch & Tilbud"-fanen | Task 4 |
| Sperre publisering til godkjent (pitch og tilbud uavhengig) | Task 5 |
| Godkjenning forblir gyldig ved senere redigering (ingen auto-reset) | Task 5 (ingen kode trengs — bekreftes ved fravær av reset-logikk) |
| Review-innstillinger ved prosjektopprettelse | Task 6 |
| Varsel-ruting til riktig fane | Task 7 |
| Varsel-visning (ikon + tekst) for alle 4 typer | Task 7 |
| `tsc`/`lint`/`build` grønt | Task 8 |
