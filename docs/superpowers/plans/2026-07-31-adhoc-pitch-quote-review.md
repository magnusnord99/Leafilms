# Ad hoc pitch/tilbud-review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pre-configured fixed-reviewer + publish-blocking toggle for pitch and tilbud review with the same ad hoc pattern already used by gallery review: pick reviewer and an optional due date at send-time, every time, with no project-level setup and no blocking of customer sharing.

**Architecture:** Reuses the existing `reviews` table (already shared by pitch/quote via `subject_type`) — adds `due_date` and `admin_task_id` columns to match `gallery_reviews`' shape. `requestReview` takes an explicit `reviewerId`/`dueDate` instead of reading `project.{pitch,quote}_reviewer_id`, and creates an `admin_tasks` row for the reviewer (same as `requestGalleryReview`). `ReviewPanel.tsx` gets the reviewer/due-date inline picker UI already used by `GalleryReviewPanel`. The `pitch_review_enabled`/`quote_review_enabled` project columns and the publish-blocking check in `usePublishing.ts` are removed entirely.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), existing `lib/actions/reviews.ts` server actions.

## Global Constraints

- No automated test framework exists in this repo (no jest/vitest, no `*.test.ts` files, no `test` script in `package.json`). Every task below is verified manually — matches existing project convention.
- Design tokens for `/admin/*` come from `lib/admin-theme.ts` (`C.bg`, `C.accent`, `C.border`, etc.) — never the public cinematic palette.
- **Migration numbering is volatile right now** — multiple features have landed uncommitted migrations in quick succession this week (see project memory `feedback_migration_number_races`). Before creating the migration file in Task 1, run `ls supabase/migrations | tail` AND `git status --short | grep migration` again to get the true next-free number — do not trust the number written here if time has passed.
- `reviews` table already has RLS enabled with working policies (`authed_read_reviews`, `authed_insert_reviews`, `authed_update_reviews` from `088_task_reviews.sql`) — adding two nullable columns to it requires no RLS changes.
- This is a full replacement, not an additive option: the `pitch_review_enabled`, `pitch_reviewer_id`, `quote_review_enabled`, `quote_reviewer_id` columns on `projects` are dropped, not just unused — confirmed with Magnus.
- Existing `reviews` rows (history) are preserved as-is; they just get `due_date = null` and `admin_task_id = null` retroactively since the columns are new.

---

### Task 1: Migration — extend `reviews`, drop project review-settings columns

**Files:**
- Create: `supabase/migrations/137_adhoc_pitch_quote_review.sql` (verify this number is still free per the Global Constraints note above before writing)

**Interfaces:**
- Produces: `reviews.due_date` (DATE, nullable), `reviews.admin_task_id` (UUID, nullable, references `admin_tasks(id)` ON DELETE SET NULL). Later tasks (2, 3) read/write these by exact column name. `projects` loses `pitch_review_enabled`, `pitch_reviewer_id`, `quote_review_enabled`, `quote_reviewer_id`.

- [ ] **Step 1: Write the migration**

```sql
-- 137_adhoc_pitch_quote_review.sql
-- Pitch/tilbud-review bytter til samme ad hoc-mønster som galleri-review
-- (131_gallery_reviews.sql): reviewer og valgfri frist velges hver gang man
-- sender til review, i stedet for en fast innstilling på prosjektet. Se
-- docs/superpowers/specs/2026-07-31-adhoc-pitch-quote-review-design.md.

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS admin_task_id UUID REFERENCES admin_tasks(id) ON DELETE SET NULL;

ALTER TABLE projects DROP COLUMN IF EXISTS pitch_review_enabled;
ALTER TABLE projects DROP COLUMN IF EXISTS pitch_reviewer_id;
ALTER TABLE projects DROP COLUMN IF EXISTS quote_review_enabled;
ALTER TABLE projects DROP COLUMN IF EXISTS quote_reviewer_id;
```

- [ ] **Step 2: Apply the migration**

Run: `psql "$DATABASE_URL" -f supabase/migrations/137_adhoc_pitch_quote_review.sql` (use the pooler connection string per project memory `reference_supabase_pooler` — direct connection is IPv6-only and fails). If `psql` is blocked from this environment (a known recurring issue in this repo — see project memory `project_mobile_push_notifications`), paste the SQL into the Supabase Dashboard SQL Editor instead and ask Magnus to run it.

Expected: `ALTER TABLE` ×4, no errors.

- [ ] **Step 3: Verify manually**

Run: `psql "$DATABASE_URL" -c "\d reviews"` — expect `due_date` (date) and `admin_task_id` (uuid) columns present.
Run: `psql "$DATABASE_URL" -c "\d projects" | grep -i review` — expect no output (all 4 columns gone).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/137_adhoc_pitch_quote_review.sql
git commit -m "feat: add due_date/admin_task_id to reviews, drop project review-settings columns"
```

---

### Task 2: Update `lib/types.ts`

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `Review` type gains `due_date: string | null` and `admin_task_id: string | null` fields. `Project`-equivalent type (the type containing lines 108-111) loses the 4 review-settings fields. Later tasks (3, 4, 5, 6, 7) rely on this exact shape.

- [ ] **Step 1: Update the `Review` type**

Change (around line 158-171):
```typescript
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
to:
```typescript
export type Review = {
  id: string
  project_id: string
  subject_type: ReviewSubjectType
  status: ReviewStatus
  requested_by: string
  reviewer_id: string
  due_date: string | null
  admin_task_id: string | null
  comment: string | null
  requested_at: string
  responded_at: string | null
  created_at: string
  requester: { id: string; name: string | null; email: string } | null
  reviewer: { id: string; name: string | null; email: string } | null
}
```

- [ ] **Step 2: Remove the 4 review-settings fields from the project type**

Delete these 4 lines (around line 108-111):
```typescript
  pitch_review_enabled?: boolean
  pitch_reviewer_id?: string | null
  quote_review_enabled?: boolean
  quote_reviewer_id?: string | null
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -v "^$"`
Expected: errors will appear at every call site still using the old shape — this is expected at this point in the plan (Tasks 3-7 fix them one by one). Confirm the errors are ONLY in: `lib/actions/reviews.ts`, `components/project/ReviewPanel.tsx`, `app/admin/projects/[id]/page.tsx`, `app/admin/projects/new/page.tsx`, `hooks/project/usePublishing.ts` — no errors anywhere else. If errors appear elsewhere, stop and report — that means something else in the codebase depends on these fields that wasn't accounted for in this plan.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add due_date/admin_task_id to Review type, drop project review-settings fields"
```

---

### Task 3: Update `lib/actions/reviews.ts`

**Files:**
- Modify: `lib/actions/reviews.ts`

**Interfaces:**
- Consumes: `Review`/`ReviewSubjectType` from `lib/types.ts` (Task 2). `notifyAssignment` from `lib/notify-assignment.ts` (unchanged signature — already supports the `pitch_review_requested`/`quote_review_requested`/`*_responded` types).
- Produces: `requestReview(projectId: string, subjectType: ReviewSubjectType, reviewerId: string, dueDate?: string): Promise<{ ok: boolean; error?: string }>` (new signature — reviewer and due date now explicit arguments). `respondToReview(reviewId: string, decision: 'approved' | 'changes_requested', comment?: string): Promise<{ ok: boolean; error?: string }>` (same signature, new validation + admin_task completion). `updateReviewSettings` removed. Tasks 4, 5, 6, 7 call these by these exact names/signatures.

- [ ] **Step 1: Replace `requestReview`**

Replace the entire function (currently lines 51-98) with:

```typescript
export async function requestReview(
  projectId: string,
  subjectType: ReviewSubjectType,
  reviewerId: string,
  dueDate?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('title')
      .eq('id', projectId)
      .single()

    if (projectError || !project) return { ok: false, error: 'Fant ikke prosjektet' }

    const label = subjectType === 'pitch' ? 'pitch' : 'tilbud'
    const { data: maxOrder } = await supabase
      .from('admin_tasks')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)

    const { data: task, error: taskError } = await supabase
      .from('admin_tasks')
      .insert({
        title: `Godkjenn ${label} — ${project.title}`,
        description: `Åpne fra varselet i /admin/varsler, eller direkte: /admin/projects/${projectId}?tab=pitch`,
        assignee_id: reviewerId,
        due_date: dueDate || null,
        sort_order: (maxOrder && maxOrder.length > 0 ? maxOrder[0].sort_order : 0) + 1,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (taskError) console.error('requestReview task insert error:', taskError)

    const { error: insertError } = await supabase.from('reviews').insert({
      project_id: projectId,
      subject_type: subjectType,
      status: 'pending',
      requested_by: user.id,
      reviewer_id: reviewerId,
      due_date: dueDate || null,
      admin_task_id: task?.id ?? null,
    })

    if (insertError) {
      console.error('requestReview insert error:', insertError)
      return { ok: false, error: 'Kunne ikke sende til review' }
    }

    await notifyAssignment({
      recipientId: reviewerId,
      type: subjectType === 'pitch' ? 'pitch_review_requested' : 'quote_review_requested',
      projectId,
      preview: `Ber deg godkjenne ${label === 'pitch' ? 'pitchen' : 'tilbudet'} for "${project.title}"`,
    })

    revalidatePath(`/admin/projects/${projectId}`)
    revalidatePath('/admin/internal')
    return { ok: true }
  } catch (err) {
    console.error('requestReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
```

- [ ] **Step 2: Replace `respondToReview`**

Replace the entire function (currently lines 100-150) with:

```typescript
export async function respondToReview(
  reviewId: string,
  decision: 'approved' | 'changes_requested',
  comment?: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: review, error: fetchError } = await supabase
      .from('reviews')
      .select('id, project_id, subject_type, requested_by, reviewer_id, admin_task_id')
      .eq('id', reviewId)
      .single()

    if (fetchError || !review) return { ok: false, error: 'Fant ikke review-forespørselen' }

    if (user.id !== review.reviewer_id) {
      return { ok: false, error: 'Du er ikke satt som reviewer for denne forespørselen' }
    }

    if (decision === 'changes_requested' && !comment?.trim()) {
      return { ok: false, error: 'Kommentar er påkrevd når du ber om endringer' }
    }

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

    if (review.admin_task_id) {
      await supabase.from('admin_tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', review.admin_task_id)
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
    revalidatePath('/admin/internal')
    return { ok: true }
  } catch (err) {
    console.error('respondToReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
```

- [ ] **Step 3: Delete `updateReviewSettings`**

Remove the entire function (currently lines 152-182), including its closing brace.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "lib/actions/reviews.ts"`
Expected: no output (this file's own errors are gone; call-site errors in other files remain until Tasks 4-7).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/reviews.ts
git commit -m "feat: make requestReview take reviewer/due-date explicitly, remove updateReviewSettings"
```

---

### Task 4: Update `components/project/ReviewPanel.tsx`

**Files:**
- Modify: `components/project/ReviewPanel.tsx`

**Interfaces:**
- Consumes: `requestReview(projectId, subjectType, reviewerId, dueDate?)` and `respondToReview` from Task 3. `getAllProfiles(): Promise<{ id: string; name: string | null; email: string; color: string | null; phone: string | null }[]>` from `lib/actions/pipeline.ts` (existing, unchanged — same function `GalleryReviewPanel` uses for its picker).
- Produces: `<ReviewPanel projectId={string} subjectType={ReviewSubjectType} currentUserId={string | null} />` — no more `enabled` prop. Tasks 5 and 6 update their call sites to match.

- [ ] **Step 1: Rewrite the file**

Replace the entire file with:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { getReviewHistory, requestReview, respondToReview } from '@/lib/actions/reviews'
import { getAllProfiles } from '@/lib/actions/pipeline'
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
  currentUserId,
}: {
  projectId: string
  subjectType: ReviewSubjectType
  currentUserId: string | null
}) {
  const [history, setHistory] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [commentBoxOpen, setCommentBoxOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [profiles, setProfiles] = useState<{ id: string; name: string | null; email: string }[]>([])
  const [picking, setPicking] = useState(false)
  const [reviewerId, setReviewerId] = useState('')
  const [dueDate, setDueDate] = useState('')

  async function reload() {
    const data = await getReviewHistory(projectId, subjectType)
    setHistory(data)
    setLoading(false)
  }

  useEffect(() => {
    reload()
    getAllProfiles().then(setProfiles)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, subjectType])

  if (loading) return null

  const latest = history[0] ?? null
  const isReviewer = latest?.status === 'pending' && latest.reviewer_id === currentUserId
  const label = subjectType === 'pitch' ? 'pitchen' : 'tilbudet'

  async function handleSendReview() {
    if (!reviewerId) return
    setSubmitting(true)
    const result = await requestReview(projectId, subjectType, reviewerId, dueDate || undefined)
    if (!result.ok) alert(result.error ?? 'Kunne ikke sende til review')
    await reload()
    setSubmitting(false)
    setPicking(false)
    setReviewerId('')
    setDueDate('')
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

        {!picking && (!latest || latest.status !== 'pending') && (
          <button
            onClick={() => setPicking(true)}
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

      {picking && (
        <div style={{ marginTop: 8, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px' }}>
          <select
            value={reviewerId}
            onChange={e => setReviewerId(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 5, padding: '5px 8px', color: C.text, fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.72rem', outline: 'none', marginBottom: 6,
            }}
          >
            <option value="">Velg reviewer...</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
            ))}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            title="Ønsket frist for reviewen (valgfritt)"
            style={{
              width: '100%', boxSizing: 'border-box', background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 5, padding: '5px 8px', color: C.text, fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.72rem', outline: 'none', marginBottom: 6,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleSendReview}
              disabled={submitting || !reviewerId}
              style={{
                flex: 1, padding: '6px', borderRadius: 5, border: 'none', background: C.accent,
                color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600,
                cursor: submitting || !reviewerId ? 'default' : 'pointer', opacity: submitting || !reviewerId ? 0.6 : 1,
              }}
            >
              {submitting ? '...' : 'Send'}
            </button>
            <button
              onClick={() => { setPicking(false); setReviewerId(''); setDueDate('') }}
              style={{
                padding: '6px 10px', borderRadius: 5, border: `1px solid ${C.border}`, background: 'none',
                color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', cursor: 'pointer',
              }}
            >
              Avbryt
            </button>
          </div>
        </div>
      )}

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

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "ReviewPanel.tsx"`
Expected: no output.
Run: `npx eslint components/project/ReviewPanel.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/project/ReviewPanel.tsx
git commit -m "feat: add ad hoc reviewer/due-date picker to ReviewPanel"
```

---

### Task 5: Update `app/admin/projects/[id]/page.tsx`

**Files:**
- Modify: `app/admin/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `<ReviewPanel projectId subjectType currentUserId />` from Task 4 (no more `enabled` prop).

- [ ] **Step 1: Remove the `updateReviewSettings` import**

Delete this line (line 7):
```typescript
import { updateReviewSettings } from '@/lib/actions/reviews'
```

- [ ] **Step 2: Remove the `reviewSettings` state**

Delete (around line 708-713):
```typescript
  const [reviewSettings, setReviewSettings] = useState({
    pitch_review_enabled: false,
    pitch_reviewer_id: null as string | null,
    quote_review_enabled: false,
    quote_reviewer_id: null as string | null,
  })
```

- [ ] **Step 3: Remove the `reviewSettings` population in `fetchHub`**

Delete (around line 738-743):
```typescript
      setReviewSettings({
        pitch_review_enabled: data.project.pitch_review_enabled ?? false,
        pitch_reviewer_id: data.project.pitch_reviewer_id ?? null,
        quote_review_enabled: data.project.quote_review_enabled ?? false,
        quote_reviewer_id: data.project.quote_reviewer_id ?? null,
      })
```

- [ ] **Step 4: Remove `handleReviewSettingChange`**

Delete (around line 1181-1186):
```typescript
  async function handleReviewSettingChange(patch: Partial<typeof reviewSettings>) {
    const next = { ...reviewSettings, ...patch }
    setReviewSettings(next)
    const result = await updateReviewSettings(projectId, patch)
    if (!result.ok) setReviewSettings(reviewSettings)
  }
```

- [ ] **Step 5: Simplify the "Pitch & Tilbud" tab's Review card**

Replace (around line 1719-1765):
```tsx
        {activeTab === 'pitch' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
with:
```tsx
        {activeTab === 'pitch' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Review
              </p>
              <ReviewPanel projectId={projectId} subjectType="pitch" currentUserId={currentUserId} />
              <ReviewPanel projectId={projectId} subjectType="quote" currentUserId={currentUserId} />
            </div>
```

(This block's closing `</div>` right before `{!hasSections ? (` on the next line stays as-is — only the inner content changes.)

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "projects/\[id\]/page.tsx"`
Expected: no output.
Run: `npx eslint "app/admin/projects/[id]/page.tsx"`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/projects/[id]/page.tsx"
git commit -m "feat: simplify pitch/tilbud review UI to ad hoc send-to-review"
```

---

### Task 6: Update `app/admin/projects/new/page.tsx`

**Files:**
- Modify: `app/admin/projects/new/page.tsx`

- [ ] **Step 1: Remove the 4 fields from `formData`'s initial state**

Delete (around line 169-172):
```typescript
    pitch_review_enabled: false,
    pitch_reviewer_id: null as string | null,
    quote_review_enabled: false,
    quote_reviewer_id: null as string | null,
```

- [ ] **Step 2: Remove the 4 fields from the project insert payload**

Delete (around line 312-315):
```typescript
            pitch_review_enabled: formData.pitch_review_enabled,
            pitch_reviewer_id: formData.pitch_reviewer_id,
            quote_review_enabled: formData.quote_review_enabled,
            quote_reviewer_id: formData.quote_reviewer_id,
```

- [ ] **Step 3: Remove the entire "Section: Review" block**

Delete (around line 716-748):
```tsx
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
(Delete the whole block including the blank line that follows it, so "Section: Kontekst" directly follows "Section: Omfang" with normal single-blank-line spacing — check the surrounding whitespace matches the file's existing convention between sections.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "projects/new/page.tsx"`
Expected: no output.
Run: `npx eslint "app/admin/projects/new/page.tsx"`
Expected: clean. If `profiles` or `chipBtn` or `selectStyle` are now unused in this file as a result of this deletion, ESLint will flag them — check whether they're used elsewhere in the file before removing their declarations (they likely are, e.g. `profiles` for project lead assignment — only remove a declaration if ESLint actually flags it unused).

- [ ] **Step 5: Commit**

```bash
git add "app/admin/projects/new/page.tsx"
git commit -m "feat: remove review-settings fields from new-project wizard"
```

---

### Task 7: Update `hooks/project/usePublishing.ts`

**Files:**
- Modify: `hooks/project/usePublishing.ts`

- [ ] **Step 1: Remove the `getLatestReview` import**

Delete (line 4):
```typescript
import { getLatestReview } from '@/lib/actions/reviews'
```

- [ ] **Step 2: Remove the blocking checks**

Delete (around line 44-59, inside the `else` / PUBLISER branch, right after `// PUBLISER`):
```typescript
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

```
So the `else` branch goes directly from `// PUBLISER` to the `const token = ...` line.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "usePublishing.ts"`
Expected: no output.
Run: `npx eslint hooks/project/usePublishing.ts`
Expected: clean.

- [ ] **Step 4: Full project check**

Run: `npx tsc --noEmit`
Expected: zero errors anywhere in the project (this closes out every call site touched across Tasks 2-7).
Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 5: Commit**

```bash
git add hooks/project/usePublishing.ts
git commit -m "feat: remove pitch/tilbud review publish-blocking check"
```

---

## Self-Review Notes

- **Spec coverage:** all sections of the design spec are covered — migration (Task 1), types (Task 2), server actions incl. mandatory-comment validation and admin_task completion (Task 3), ReviewPanel ad hoc picker UI (Task 4), project page simplification (Task 5), new-project wizard cleanup (Task 6), publish-gate removal (Task 7). The spec's testing checklist maps directly to manual verification across these tasks — a full run-through (items 1-8 in the spec) should be done once Task 7 is complete, using the real UI.
- **Placeholder scan:** no TBD/TODO; every step has complete code or an exact deletion target.
- **Type consistency:** `requestReview(projectId, subjectType, reviewerId, dueDate?)` signature is identical between Task 3's definition and Task 4's call site. `Review` type's new `due_date`/`admin_task_id` fields (Task 2) are consumed consistently in Task 3's action bodies.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-31-adhoc-pitch-quote-review.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
