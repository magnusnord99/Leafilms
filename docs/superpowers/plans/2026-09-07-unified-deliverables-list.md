# Én samlet leveranseliste — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two disconnected deliverables lists (`sections.content.deliverableItems` and `DeliverableItem[]`/`projects.deliverables`) with one — `projects.deliverables`, extended with `format`/`description`/`quantity` — read and written by the pitch page, the pitch editor, the postprod "Info om levering" modal, the quote builder, AI generation, translation, and project transfers.

**Architecture:** `projects.deliverables` (column already exists, migration 128) becomes the single live list every surface reads from and writes to. `contracts.deliverables` keeps its existing role as the frozen, immutable snapshot at signing (mechanism unchanged). The three editing surfaces (pitch editor, postprod modal, quote builder) stay visually/technically separate components — only the data they read/write is unified. A one-time script backfills existing projects' `sections.content.deliverableItems` into `projects.deliverables` (`type: 'annet'` default) so no published pitch page goes blank.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-09-07-unified-deliverables-list-design.md`

## Global Constraints

- `type: 'video'` deliverables are always one row = one named item — never a `quantity`. Photo/annet keep `quantity` (Spec §3).
- The three editing UIs (pitch editor, postprod modal, quote builder) are NOT merged into one shared component — each keeps its own look, only the underlying field (`projects.deliverables`) is shared (Spec §4).
- Migration defaults every backfilled row to `type: 'annet'` — never guess `'video'`, to avoid unintentionally activating postprod video tabs on old projects (Spec §6).
- No automated test runner exists in this repo — verification is `npx tsc --noEmit -p .`, targeted Node scripts against Supabase with the service-role key, and manual/browser checks. Every task's steps say exactly which.
- `contracts.deliverables` freezing mechanism in `app/api/contracts/sign/route.ts` is UNCHANGED — only what feeds `quoteData.deliverables` before signing changes (it can now be pre-filled from `project.deliverables`).

---

### Task 1: Extend `DeliverableItem` type

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DeliverableItem` gains `format?: string`, `description?: string`, `quantity?: number` — every later task imports this extended type from `@/lib/types`.

- [ ] **Step 1: Add the three fields**

Find:

```ts
export type DeliverableItem = {
  id: string
  type: 'video' | 'photo' | 'annet'
  name: string
}
```

Replace with:

```ts
export type DeliverableItem = {
  id: string
  type: 'video' | 'photo' | 'annet'
  name: string
  /** Fritekst, dekker format og lengde sammen — f.eks. "16:9, 20 sek", "1:1". Se docs/superpowers/specs/2026-09-07-unified-deliverables-list-design.md §2.1. */
  format?: string
  description?: string
  /** Kun meningsfullt for 'photo'/'annet' — video er alltid én rad = ett navngitt element, se spec §3. */
  quantity?: number
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no new errors (the field additions are optional, so existing code that constructs a `DeliverableItem` without them still compiles).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: extend DeliverableItem with format, description, quantity"
```

---

### Task 2: `updateProjectDeliverables` server action

**Files:**
- Modify: `lib/actions/pipeline.ts`

**Interfaces:**
- Consumes: `DeliverableItem[]` from `@/lib/types` (Task 1).
- Produces: `updateProjectDeliverables(projectId: string, items: DeliverableItem[]): Promise<{ error?: string }>` — Task 3 (postprod modal) calls this. Replaces `updateProjectDeliverablesSection`/`getProjectDeliverablesSection`, which are deleted in this task (their only caller, the postprod page, is rewired in Task 3 — both edits must land together or the page won't compile in between; that's fine since they're one PR).

- [ ] **Step 1: Replace the two section-based functions with one project-based function**

Find:

```ts
export async function getProjectDeliverablesSection(projectId: string): Promise<{ items: NonNullable<SectionContent['deliverableItems']> } | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('sections')
      .select('content')
      .eq('project_id', projectId)
      .eq('type', 'deliverables')
      .maybeSingle()
    if (error || !data) return null
    return { items: (data.content as SectionContent | null)?.deliverableItems ?? [] }
  } catch {
    return null
  }
}

export async function updateProjectDeliverablesSection(
  projectId: string,
  items: NonNullable<SectionContent['deliverableItems']>
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient()
    const { data: section, error: fetchError } = await supabase
      .from('sections')
      .select('id, content')
      .eq('project_id', projectId)
      .eq('type', 'deliverables')
      .maybeSingle()
    if (fetchError) return { error: fetchError.message }
    if (!section) {
      const { error: insertError } = await supabase
        .from('sections')
        .insert({ project_id: projectId, type: 'deliverables', content: { deliverableItems: items } })
      if (insertError) return { error: insertError.message }
    } else {
      const { error: updateError } = await supabase
        .from('sections')
        .update({ content: { ...(section.content as object), deliverableItems: items }, updated_at: new Date().toISOString() })
        .eq('id', section.id)
      if (updateError) return { error: updateError.message }
    }
    return {}
  } catch {
    return { error: 'Noe gikk galt' }
  }
}
```

Replace with:

```ts
// Erstatter getProjectDeliverablesSection/updateProjectDeliverablesSection (leste/skrev
// sections.content.deliverableItems) — leveranselisten er nå ett felt, projects.deliverables,
// lest/skrevet direkte. Se docs/superpowers/specs/2026-09-07-unified-deliverables-list-design.md.
export async function updateProjectDeliverables(
  projectId: string,
  items: DeliverableItem[]
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('projects')
      .update({ deliverables: items, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (error) return { error: error.message }
    return {}
  } catch {
    return { error: 'Noe gikk galt' }
  }
}
```

- [ ] **Step 2: Import `DeliverableItem` if not already imported**

Check the top of `lib/actions/pipeline.ts` for an existing `import type { ... } from '@/lib/types'` line containing `DeliverableItem` (Task 5 of the July 27 plan already added this import for the postprod-board work). If it's already there, skip this step. If not, add `DeliverableItem` to that import list.

- [ ] **Step 3: Typecheck — expect errors in the postprod page, fixed in Task 3**

Run: `npx tsc --noEmit -p .`
Expected: errors in `app/admin/postprod/[id]/page.tsx` (`getProjectDeliverablesSection`/`updateProjectDeliverablesSection` no longer exist). Confirm no errors anywhere else — if there are, something else imports these functions and Task 3's scope needs to grow to cover it (there shouldn't be — verified during planning that the postprod page is the only caller).

- [ ] **Step 4: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: add updateProjectDeliverables, remove section-based deliverables actions"
```

---

### Task 3: Postprod page — "Info om levering" modal reads/writes `projects.deliverables`

**Files:**
- Modify: `app/admin/postprod/[id]/page.tsx`

**Interfaces:**
- Consumes: `updateProjectDeliverables` (Task 2); `project.deliverables` — already fetched by `getPostProdProjects()` into the page's `projects` state (used since the July 27 work for `videoDeliverables`), no new fetch needed.
- Produces: nothing consumed elsewhere — this is a leaf.

- [ ] **Step 1: Replace the local `DeliverableItem` type with the shared one**

Find:

```ts
  type DeliverableItem = {
    id?: string
    title?: string
    description?: string
    quantity?: number | string
    format?: string
  }
```

Replace with nothing (delete these lines) — the shared `DeliverableItem` from `@/lib/types` is used instead (already imported as `SignedDeliverableItem`, see Step 2).

- [ ] **Step 2: Use the shared type for local state, drop the `getProjectDeliverablesSection` fetch**

Find:

```ts
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [editingDeliverables, setEditingDeliverables] = useState(false)
  const [draftDeliverables, setDraftDeliverables] = useState<DeliverableItem[]>([])
  const [savingDeliverables, setSavingDeliverables] = useState(false)
  const [deliverablesError, setDeliverablesError] = useState<string | null>(null)
```

Replace with:

```ts
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [editingDeliverables, setEditingDeliverables] = useState(false)
  const [draftDeliverables, setDraftDeliverables] = useState<SignedDeliverableItem[]>([])
  const [savingDeliverables, setSavingDeliverables] = useState(false)
  const [deliverablesError, setDeliverablesError] = useState<string | null>(null)
```

Find:

```ts
  const [deliverableItems, setDeliverableItems] = useState<DeliverableItem[]>([])
```

Replace with:

```ts
  const [deliverableItems, setDeliverableItems] = useState<SignedDeliverableItem[]>([])
```

Find (in `fetchAll`):

```ts
    const [allProjects, projectTasks, userProfile, allProfiles, delivSection, selImgs, gallerySumm] = await Promise.all([
      getPostProdProjects(),
      getTasksForProject(projectId, 'post_prod'),
      getCurrentUserProfile(),
      getAllProfiles(),
      getProjectDeliverablesSection(projectId),
      getSelectedImagesForProject(projectId),
      getGalleryIdForProject(projectId),
    ])
    setSelectionImages(selImgs)
    setGallerySummary(gallerySumm)
    setDeliverableItems(delivSection?.items ?? [])
    setProfiles(allProfiles)

    const allProj = allProjects as PostProdProject[]
    const currentProj = allProj.find(p => p.id === projectId)
```

Replace with:

```ts
    const [allProjects, projectTasks, userProfile, allProfiles, selImgs, gallerySumm] = await Promise.all([
      getPostProdProjects(),
      getTasksForProject(projectId, 'post_prod'),
      getCurrentUserProfile(),
      getAllProfiles(),
      getSelectedImagesForProject(projectId),
      getGalleryIdForProject(projectId),
    ])
    setSelectionImages(selImgs)
    setGallerySummary(gallerySumm)
    setProfiles(allProfiles)

    const allProj = allProjects as PostProdProject[]
    const currentProj = allProj.find(p => p.id === projectId)
    setDeliverableItems(((currentProj?.deliverables ?? []) as SignedDeliverableItem[]))
```

- [ ] **Step 3: Remove the now-unused import**

Find:

```ts
  getProjectDeliverablesSection,
  updateProjectDeliverablesSection,
```

Replace with:

```ts
  updateProjectDeliverables,
```

(This is inside the multi-line `import { ... } from '@/lib/actions/pipeline'` near the top of the file — keep every other imported name on the surrounding lines unchanged, only these two lines change.)

- [ ] **Step 4: Add a type selector to the edit rows, rename `title` → `name`**

Find:

```tsx
                        {draftDeliverables.map((item, i) => (
                          <div key={item.id ?? i} style={{ background: C.surface2, borderRadius: 8, padding: '12px 14px', position: 'relative' }}>
                            <button
                              onClick={() => setDraftDeliverables(prev => prev.filter((_, idx) => idx !== i))}
                              style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1rem', lineHeight: 1, padding: '2px 5px' }}
                              title="Fjern"
                            >×</button>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 80px', gap: 8, marginBottom: 8 }}>
                              <input
                                value={item.title ?? ''}
                                onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, title: e.target.value } : it))}
                                placeholder="Tittel"
                                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none' }}
                              />
                              <input
                                type="number"
                                min={1}
                                value={item.quantity ?? ''}
                                onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: e.target.value } : it))}
                                placeholder="Ant."
                                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none', textAlign: 'center' }}
                              />
                              <input
                                value={item.format ?? ''}
                                onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, format: e.target.value } : it))}
                                placeholder="Format"
                                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none' }}
                              />
                            </div>
                            <textarea
                              value={item.description ?? ''}
                              onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))}
                              placeholder="Beskrivelse (valgfri)"
                              rows={2}
                              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', width: '100%', resize: 'vertical', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text3, outline: 'none', boxSizing: 'border-box' }}
                            />
                          </div>
                        ))}
                        <button
                          onClick={() => setDraftDeliverables(prev => [...prev, { id: String(Date.now()), title: '', quantity: 1, format: '', description: '' }])}
                          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.accent, background: 'none', border: `1px dashed ${C.accent}`, borderRadius: 6, padding: '8px', cursor: 'pointer', width: '100%', marginTop: 4 }}
                        >
                          + Legg til leveranse
                        </button>
```

Replace with:

```tsx
                        {draftDeliverables.map((item, i) => (
                          <div key={item.id ?? i} style={{ background: C.surface2, borderRadius: 8, padding: '12px 14px', position: 'relative' }}>
                            <button
                              onClick={() => setDraftDeliverables(prev => prev.filter((_, idx) => idx !== i))}
                              style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1rem', lineHeight: 1, padding: '2px 5px' }}
                              title="Fjern"
                            >×</button>
                            <div style={{ display: 'grid', gridTemplateColumns: item.type === 'video' ? '90px 1fr 80px' : '90px 1fr 56px 80px', gap: 8, marginBottom: 8 }}>
                              <select
                                value={item.type}
                                onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, type: e.target.value as SignedDeliverableItem['type'] } : it))}
                                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 6px', color: C.text, outline: 'none' }}
                              >
                                <option value="video">Video</option>
                                <option value="photo">Foto</option>
                                <option value="annet">Annet</option>
                              </select>
                              <input
                                value={item.name ?? ''}
                                onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, name: e.target.value } : it))}
                                placeholder="Navn"
                                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none' }}
                              />
                              {item.type !== 'video' && (
                                <input
                                  type="number"
                                  min={1}
                                  value={item.quantity ?? ''}
                                  onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: parseInt(e.target.value, 10) || undefined } : it))}
                                  placeholder="Ant."
                                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none', textAlign: 'center' }}
                                />
                              )}
                              <input
                                value={item.format ?? ''}
                                onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, format: e.target.value } : it))}
                                placeholder="Format"
                                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none' }}
                              />
                            </div>
                            <textarea
                              value={item.description ?? ''}
                              onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))}
                              placeholder="Beskrivelse (valgfri)"
                              rows={2}
                              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', width: '100%', resize: 'vertical', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text3, outline: 'none', boxSizing: 'border-box' }}
                            />
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          <button
                            onClick={() => setDraftDeliverables(prev => [...prev, { id: String(Date.now()), type: 'annet', name: '', quantity: 1, format: '', description: '' }])}
                            style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.accent, background: 'none', border: `1px dashed ${C.accent}`, borderRadius: 6, padding: '8px', cursor: 'pointer' }}
                          >
                            + Legg til leveranse
                          </button>
                          <button
                            onClick={() => {
                              const count = parseInt(prompt('Hvor mange videoer?') ?? '', 10)
                              if (!count || count < 1) return
                              const existingVideoCount = draftDeliverables.filter(d => d.type === 'video').length
                              const newRows: SignedDeliverableItem[] = Array.from({ length: count }, (_, idx) => ({
                                id: `${Date.now()}-${idx}`, type: 'video', name: `Reel ${existingVideoCount + idx + 1}`,
                              }))
                              setDraftDeliverables(prev => [...prev, ...newRows])
                            }}
                            style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.accent, background: 'none', border: `1px dashed ${C.accent}`, borderRadius: 6, padding: '8px', cursor: 'pointer' }}
                          >
                            + Legg til flere videoer
                          </button>
                        </div>
```

- [ ] **Step 5: Rename `title` → `name` in the read-only display and the save handler**

Find:

```ts
                              const items = draftDeliverables.map(it => ({
                                id: it.id ?? String(Date.now()),
                                title: it.title,
                                quantity: typeof it.quantity === 'string' ? (parseInt(it.quantity, 10) || undefined) : it.quantity,
                                format: it.format,
                                description: it.description,
                              }))
                              const res = await updateProjectDeliverablesSection(projectId, items)
```

Replace with:

```ts
                              const items: SignedDeliverableItem[] = draftDeliverables.map(it => ({
                                id: it.id ?? String(Date.now()),
                                type: it.type,
                                name: it.name,
                                quantity: it.type === 'video' ? undefined : it.quantity,
                                format: it.format,
                                description: it.description,
                              }))
                              const res = await updateProjectDeliverables(projectId, items)
```

Find:

```tsx
                        {deliverableItems.map((item, i) => {
                          const qty = typeof item.quantity === 'number'
                            ? item.quantity
                            : (item.quantity != null ? parseInt(item.quantity as string, 10) || null : null)
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: i < deliverableItems.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                              {qty != null && (
                                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 700, color: C.accent, minWidth: 24, textAlign: 'right', flexShrink: 0, paddingTop: 1 }}>
                                  {qty}
                                </span>
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text, display: 'block', wordBreak: 'break-word' }}>
                                  {item.title || '—'}
                                </span>
```

Replace with:

```tsx
                        {deliverableItems.map((item, i) => {
                          const qty = item.type === 'video' ? null : (item.quantity ?? null)
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: i < deliverableItems.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                              {qty != null && (
                                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 700, color: C.accent, minWidth: 24, textAlign: 'right', flexShrink: 0, paddingTop: 1 }}>
                                  {qty}
                                </span>
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text, display: 'block', wordBreak: 'break-word' }}>
                                  {item.name || '—'}
                                </span>
```

- [ ] **Step 6: Update the "Rediger" button's snapshot to match field names**

Find:

```ts
                          onClick={() => { setDraftDeliverables(deliverableItems.map((it, i) => ({ ...it, id: it.id ?? String(i) }))); setEditingDeliverables(true); setDeliverablesError(null) }}
```

This line already just spreads `it` (no field names hardcoded) — no change needed. Skip.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 8: Manual verification**

Start the dev server, open `/admin/postprod/07c15c68-ada5-4b73-ab6b-5c8e947c7996` (the project fixed manually for feedback ae748caf — already has 4 video deliverables). Click "Info om levering", click "Rediger". Confirm all 4 rows show `type: Video` with no quantity field, names editable. Add one "annet" row with a quantity, save, reload the page, confirm it persisted and the 4 video tabs at the top of the stepper are unaffected (still 4, same names).

- [ ] **Step 9: Commit**

```bash
git add "app/admin/postprod/[id]/page.tsx"
git commit -m "feat: point postprod's Info om levering modal at projects.deliverables"
```

---

### Task 4: Pitch editor — `DeliverablesSection`/`DeliverableGrid`/`DeliverableCard` read/write `project.deliverables`

**Files:**
- Modify: `components/project/SectionRenderer.tsx`
- Modify: `components/sections/DeliverablesSection.tsx`
- Modify: `components/project/DeliverableGrid.tsx`
- Modify: `components/project/DeliverableCard.tsx`
- Modify: `app/admin/projects/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `DeliverableItem` from `@/lib/types` (Task 1); `project.deliverables` (already on `Project`, passed into `SectionRenderer` as the existing `project` prop — no query change needed, the edit page already fetches the full project row).
- Produces: nothing consumed elsewhere — this is the pitch-page-facing leaf. `app/p/[token]` (the published pitch) also renders through `SectionRenderer`/`DeliverablesSection` and picks up this change automatically — verified manually in Step 8.

- [ ] **Step 1: `SectionRenderer` passes `project.deliverables` + an updater instead of relying on `section.content`**

Find:

```tsx
        {/* Deliverables Section */}
        {section.type === 'deliverables' && (
          <DeliverablesSection
            section={section}
            editMode={editMode}
            language={project?.language ?? 'no'}
            sectionImages={sectionImages}
            sectionImageData={sectionImageData}
            editingImageSectionId={editingImageSectionId}
            imagePosition={imagePosition}
            getBackgroundStyle={getBackgroundStyle}
            getSectionTitle={getSectionTitle}
            updateSectionContent={updateSectionContent}
            saveBackgroundPosition={saveBackgroundPosition}
            setImagePosition={setImagePosition}
            onImageClick={() => handleImageClick(section.id)}
            onEditPositionClick={(e) => handleEditPositionClick(e, section.id)}
            onImagePickerOpen={() => handleImagePickerOpen(section.id)}
```

Replace with:

```tsx
        {/* Deliverables Section */}
        {section.type === 'deliverables' && (
          <DeliverablesSection
            section={section}
            editMode={editMode}
            language={project?.language ?? 'no'}
            projectDeliverables={project?.deliverables ?? []}
            onProjectDeliverablesChange={onProjectDeliverablesChange}
            sectionImages={sectionImages}
            sectionImageData={sectionImageData}
            editingImageSectionId={editingImageSectionId}
            imagePosition={imagePosition}
            getBackgroundStyle={getBackgroundStyle}
            getSectionTitle={getSectionTitle}
            updateSectionContent={updateSectionContent}
            saveBackgroundPosition={saveBackgroundPosition}
            setImagePosition={setImagePosition}
            onImageClick={() => handleImageClick(section.id)}
            onEditPositionClick={(e) => handleEditPositionClick(e, section.id)}
            onImagePickerOpen={() => handleImagePickerOpen(section.id)}
```

(Only the two new lines are added — every other prop on this call stays exactly as-is, including the closing `/>` and remaining props not shown here.)

- [ ] **Step 2: Add `onProjectDeliverablesChange` to `SectionRenderer`'s own props**

Find:

```ts
import { Section, Image, SectionImage, CaseStudy, TeamMember, CollagePreset, Project } from '@/lib/types'
```

Replace with:

```ts
import { Section, Image, SectionImage, CaseStudy, TeamMember, CollagePreset, Project, DeliverableItem } from '@/lib/types'
```

Find (the last line of `SectionRendererProps`, right before its closing brace):

```ts
  onImageClick: (position?: string) => void
  onOpenPresetPicker: () => void
  project: Project
}
```

Replace with:

```ts
  onImageClick: (position?: string) => void
  onOpenPresetPicker: () => void
  project: Project
  onProjectDeliverablesChange: (items: DeliverableItem[]) => void
}
```

Find (the last line of the destructured parameter list, right before `}: SectionRendererProps) {`):

```ts
  onImageClick,
  onOpenPresetPicker,
  project
}: SectionRendererProps) {
```

Replace with:

```ts
  onImageClick,
  onOpenPresetPicker,
  project,
  onProjectDeliverablesChange
}: SectionRendererProps) {
```

- [ ] **Step 3: `DeliverablesSection` takes the new props, passes them to `DeliverableGrid` instead of `section.content`/`updateSectionContent`**

Find:

```ts
type DeliverablesSectionProps = {
  section: Section
  editMode: boolean
  language?: 'no' | 'en'
  sectionImages: Record<string, Image[]>
```

Replace with:

```ts
type DeliverablesSectionProps = {
  section: Section
  editMode: boolean
  language?: 'no' | 'en'
  projectDeliverables: DeliverableItem[]
  onProjectDeliverablesChange: (items: DeliverableItem[]) => void
  sectionImages: Record<string, Image[]>
```

Find:

```ts
export function DeliverablesSection({
  section,
  editMode,
  language = 'no',
  sectionImages,
```

Replace with:

```ts
export function DeliverablesSection({
  section,
  editMode,
  language = 'no',
  projectDeliverables,
  onProjectDeliverablesChange,
  sectionImages,
```

Find:

```tsx
          {/* Deliverables grid */}
          <div onClick={(e) => e.stopPropagation()} className="min-h-[120px]">
            <DeliverableGrid
              items={section.content.deliverableItems}
              editMode={editMode}
              language={language}
              onItemsChange={(newItems) => {
                updateSectionContent(section.id, 'deliverableItems', newItems)
              }}
            />
          </div>
```

Replace with:

```tsx
          {/* Deliverables grid */}
          <div onClick={(e) => e.stopPropagation()} className="min-h-[120px]">
            <DeliverableGrid
              items={projectDeliverables}
              editMode={editMode}
              language={language}
              onItemsChange={onProjectDeliverablesChange}
            />
          </div>
```

Add the import:

Find:

```ts
import { Section, Image, SectionImage } from '@/lib/types'
```

Replace with:

```ts
import { Section, Image, SectionImage, DeliverableItem } from '@/lib/types'
```

- [ ] **Step 4: `DeliverableGrid` uses the shared `DeliverableItem` type, adds a type selector and bulk-video button, drops the local type/heuristic**

Find:

```ts
'use client'

import { DeliverableCard } from './DeliverableCard'

export interface DeliverableItem {
  id: string
  title?: string
  quantity?: number
  format?: string // "16:9", "9:16", "1:1", "2:30 min", etc.
  aspectRatio?: string // Beholder for bakoverkompatibilitet
  description?: string
}

interface DeliverableGridProps {
  items?: DeliverableItem[]
  editMode?: boolean
  language?: 'no' | 'en'
  onItemsChange?: (items: DeliverableItem[]) => void
}
```

Replace with:

```ts
'use client'

import { DeliverableCard } from './DeliverableCard'
import type { DeliverableItem } from '@/lib/types'

interface DeliverableGridProps {
  items?: DeliverableItem[]
  editMode?: boolean
  language?: 'no' | 'en'
  onItemsChange?: (items: DeliverableItem[]) => void
}
```

Find:

```ts
  const defaultItems: DeliverableItem[] = [
    {
      id: '1',
      title: 'HOVEDFILM',
      quantity: 1,
      format: '16:9 - 2:00 min',
      description: 'Ferdig redigert hovedfilm med fargekorrigering og lyddesign.'
    },
    {
      id: '2',
      title: 'CUTDOWNS',
      quantity: 3,
      format: '30 sek',
      description: 'Kortere versjoner tilpasset ulike plattformer.'
    },
    {
      id: '3',
      title: 'BILDER',
      quantity: 15,
      format: '1:1',
      description: 'Profesjonelle bilder med retusjering.'
    }
  ]
```

Replace with:

```ts
  const defaultItems: DeliverableItem[] = [
    {
      id: '1',
      type: 'video',
      name: 'HOVEDFILM',
      format: '16:9 - 2:00 min',
      description: 'Ferdig redigert hovedfilm med fargekorrigering og lyddesign.'
    },
    {
      id: '2',
      type: 'photo',
      name: 'BILDER',
      quantity: 15,
      format: '1:1',
      description: 'Profesjonelle bilder med retusjering.'
    }
  ]
```

Find:

```ts
  const handleAdd = () => {
    if (!onItemsChange) return
    const newId = String(Date.now())
    const newItems = [...displayItems, {
      id: newId,
      title: 'NY LEVERANSE',
      quantity: 1,
      format: '',
      description: ''
    }]
    onItemsChange(newItems)
  }

  const handleFieldChange = (id: string, field: 'title' | 'quantity' | 'format' | 'description', value: string) => {
    if (!onItemsChange) return
    const parsed = field === 'quantity' ? (parseInt(value, 10) || 1) : value
    const newItems = displayItems.map(item =>
      item.id === id ? { ...item, [field]: parsed } : item
    )
    onItemsChange(newItems)
  }
```

Replace with:

```ts
  const handleAdd = () => {
    if (!onItemsChange) return
    const newId = String(Date.now())
    const newItems: DeliverableItem[] = [...displayItems, {
      id: newId,
      type: 'annet',
      name: 'NY LEVERANSE',
      quantity: 1,
      format: '',
      description: ''
    }]
    onItemsChange(newItems)
  }

  // "+ Legg til flere videoer" — video er alltid individuelt navngitte rader (ingen quantity),
  // så bulk-tillegg oppretter N rader med placeholder-navn i stedet for ett antall-felt. Se
  // docs/superpowers/specs/2026-09-07-unified-deliverables-list-design.md §3.
  const handleAddVideos = () => {
    if (!onItemsChange) return
    const count = parseInt(prompt('Hvor mange videoer?') ?? '', 10)
    if (!count || count < 1) return
    const existingVideoCount = displayItems.filter(item => item.type === 'video').length
    const newRows: DeliverableItem[] = Array.from({ length: count }, (_, idx) => ({
      id: `${Date.now()}-${idx}`,
      type: 'video',
      name: `Reel ${existingVideoCount + idx + 1}`,
    }))
    onItemsChange([...displayItems, ...newRows])
  }

  const handleFieldChange = (id: string, field: 'type' | 'name' | 'quantity' | 'format' | 'description', value: string) => {
    if (!onItemsChange) return
    const parsed = field === 'quantity' ? (parseInt(value, 10) || 1) : value
    const newItems = displayItems.map(item =>
      item.id === id ? { ...item, [field]: parsed } : item
    )
    onItemsChange(newItems)
  }
```

Find:

```tsx
      {displayItems.map((item) => (
        <DeliverableCard
          key={item.id}
          title={item.title}
          quantity={item.quantity}
          format={item.format}
          aspectRatio={item.aspectRatio}
          description={item.description}
          onRemove={editMode && onItemsChange ? () => handleRemove(item.id) : undefined}
          onChange={editMode && onItemsChange ? (field, value) => handleFieldChange(item.id, field, value) : undefined}
          editMode={editMode}
        />
      ))}
      
      {/* Legg til-knapp i edit mode */}
      {editMode && onItemsChange && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleAdd()
          }}
          className="p-4 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer w-full md:w-[140px] min-h-[160px] flex-shrink-0"
          style={{
            border: '1px dashed #38332A',
            background: 'transparent',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#C49434' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#38332A' }}
        >
          <span style={{ fontSize: '1.5rem', color: '#38332A', lineHeight: 1 }}>+</span>
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#62594E',
            marginTop: '0.5rem',
          }}>Legg til</span>
        </button>
      )}
```

Replace with:

```tsx
      {displayItems.map((item) => (
        <DeliverableCard
          key={item.id}
          type={item.type}
          name={item.name}
          quantity={item.quantity}
          format={item.format}
          description={item.description}
          onRemove={editMode && onItemsChange ? () => handleRemove(item.id) : undefined}
          onChange={editMode && onItemsChange ? (field, value) => handleFieldChange(item.id, field, value) : undefined}
          editMode={editMode}
        />
      ))}
      
      {/* Legg til-knapper i edit mode */}
      {editMode && onItemsChange && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleAdd()
          }}
          className="p-4 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer w-full md:w-[140px] min-h-[160px] flex-shrink-0"
          style={{
            border: '1px dashed #38332A',
            background: 'transparent',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#C49434' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#38332A' }}
        >
          <span style={{ fontSize: '1.5rem', color: '#38332A', lineHeight: 1 }}>+</span>
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#62594E',
            marginTop: '0.5rem',
          }}>Legg til</span>
        </button>
      )}
      {editMode && onItemsChange && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            handleAddVideos()
          }}
          className="p-4 flex flex-col items-center justify-center transition-all duration-300 cursor-pointer w-full md:w-[140px] min-h-[160px] flex-shrink-0"
          style={{
            border: '1px dashed #38332A',
            background: 'transparent',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#C49434' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#38332A' }}
        >
          <span style={{ fontSize: '1.5rem', color: '#38332A', lineHeight: 1 }}>+N</span>
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#62594E',
            marginTop: '0.5rem',
            textAlign: 'center',
          }}>Flere videoer</span>
        </button>
      )}
```

- [ ] **Step 5: `DeliverableCard` uses `type`/`name` instead of the title-keyword heuristic**

Find:

```ts
interface DeliverableCardProps {
  title?: string
  quantity?: number
  format?: string // "16:9", "9:16", "1:1", "2:30 min", etc.
  aspectRatio?: string // Beholder for bakoverkompatibilitet
  description?: string
  onRemove?: () => void
  onChange?: (field: 'title' | 'quantity' | 'format' | 'description', value: string) => void
  editMode?: boolean
}

/** Avgjør om leveransen er video eller bilde basert på tittel og format */
export function getDeliverableType(title: string, format: string): 'video' | 'image' {
  const t = (title || '').toLowerCase()
  const f = (format || '').toLowerCase()
  const videoKeywords = ['film', 'video', 'cutdown', 'reklame', 'spot', 'klipp', 'redigering', 'teaser', 'reel']
  const imageKeywords = ['bilde', 'bilder', 'foto', 'produktbilde', 'portrett']
  if (videoKeywords.some(kw => t.includes(kw))) return 'video'
  if (imageKeywords.some(kw => t.includes(kw))) return 'image'
  if (/\d+\s*(min|sek)/.test(f) || f.includes('min') || f.includes('sek')) return 'video'
  return 'image'
}

export function DeliverableCard({
  title = 'LEVERANSE',
  quantity,
  format,
  aspectRatio,
  description,
  onRemove,
  onChange,
  editMode = false
}: DeliverableCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const displayFormat = format || aspectRatio
  const deliverableType = getDeliverableType(title, displayFormat || '')
```

Replace with:

```ts
interface DeliverableCardProps {
  type: 'video' | 'photo' | 'annet'
  name?: string
  quantity?: number
  format?: string // "16:9", "9:16", "1:1", "2:30 min", etc.
  description?: string
  onRemove?: () => void
  onChange?: (field: 'type' | 'name' | 'quantity' | 'format' | 'description', value: string) => void
  editMode?: boolean
}

export function DeliverableCard({
  type,
  name = 'LEVERANSE',
  quantity,
  format,
  description,
  onRemove,
  onChange,
  editMode = false
}: DeliverableCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const displayFormat = format
```

Every remaining reference to `title` inside this component's JSX (the contentEditable title, the `onChange('title', ...)` calls, `confirm(...title...)`) becomes `name`/`onChange('name', ...)`, and every reference to `deliverableType === 'video' ? ... : ...` for the icon becomes `type === 'video' ? ... : ...` (the icon branch for `'photo'`/`'annet'` both fall into the existing "else" branch — no third icon needed). Apply these mechanically through the rest of the file:

- `{title}` → `{name}`
- `onChange('title', e.currentTarget.innerText || '')` → `onChange('name', e.currentTarget.innerText || '')`
- `` confirm(`Fjerne leveransen «${title}»?`) `` → `` confirm(`Fjerne leveransen «${name}»?`) ``
- `deliverableType === 'video'` (both occurrences, the two icon-picking ternaries) → `type === 'video'`
- `title={deliverableType === 'video' ? 'Video' : 'Bilde'}` → `title={type === 'video' ? 'Video' : type === 'photo' ? 'Bilde' : 'Annet'}`

- [ ] **Step 6: Wire `onProjectDeliverablesChange` in the pitch editor page**

**Files:** also modify `app/admin/projects/[id]/edit/page.tsx` in this step.

Find (the existing project-field update handler this page uses as its established pattern — `handleToggleContractHidden` calls a server action and updates `project` state optimistically; the new handler follows the same shape):

```ts
  const handleToggleContractHidden = async () => {
    if (!project) return
    const nextHidden = !(project.pipeline_data as { contract_hidden_from_pitch?: boolean } | null)?.contract_hidden_from_pitch
    setProject(prev => prev ? { ...prev, pipeline_data: { ...prev.pipeline_data, contract_hidden_from_pitch: nextHidden } } : prev)
    try {
      await setContractHiddenFromPitch(id, nextHidden)
    } catch (err) {
      console.error('Toggle contract hidden error:', err)
      setProject(prev => prev ? { ...prev, pipeline_data: { ...prev.pipeline_data, contract_hidden_from_pitch: !nextHidden } } : prev)
      alert('Kunne ikke oppdatere synlighet for kontrakten. Prøv igjen.')
    }
  }
```

Replace with the same block plus a new handler appended after it:

```ts
  const handleToggleContractHidden = async () => {
    if (!project) return
    const nextHidden = !(project.pipeline_data as { contract_hidden_from_pitch?: boolean } | null)?.contract_hidden_from_pitch
    setProject(prev => prev ? { ...prev, pipeline_data: { ...prev.pipeline_data, contract_hidden_from_pitch: nextHidden } } : prev)
    try {
      await setContractHiddenFromPitch(id, nextHidden)
    } catch (err) {
      console.error('Toggle contract hidden error:', err)
      setProject(prev => prev ? { ...prev, pipeline_data: { ...prev.pipeline_data, contract_hidden_from_pitch: !nextHidden } } : prev)
      alert('Kunne ikke oppdatere synlighet for kontrakten. Prøv igjen.')
    }
  }

  const handleDeliverablesChange = async (items: DeliverableItem[]) => {
    if (!project) return
    const previous = project.deliverables ?? []
    setProject(prev => prev ? { ...prev, deliverables: items } : prev)
    const res = await updateProjectDeliverables(id, items)
    if (res.error) {
      console.error('Update deliverables error:', res.error)
      setProject(prev => prev ? { ...prev, deliverables: previous } : prev)
      alert('Kunne ikke lagre leveranser. Prøv igjen.')
    }
  }
```

Add the imports — this file has no existing import from `@/lib/actions/pipeline` (verified during planning; `setContractHiddenFromPitch` above comes from `@/lib/actions/contracts`, a different file), so add a new line, and extend the existing `@/lib/types` import.

Find:

```ts
import { Section, CollagePreset, Image } from '@/lib/types'
```

Replace with:

```ts
import { Section, CollagePreset, Image, DeliverableItem } from '@/lib/types'
import { updateProjectDeliverables } from '@/lib/actions/pipeline'
```

Find:

```tsx
                  onOpenPresetPicker={() => setShowPresetPicker(true)}
                  project={project}
                />
```

Replace with:

```tsx
                  onOpenPresetPicker={() => setShowPresetPicker(true)}
                  project={project}
                  onProjectDeliverablesChange={handleDeliverablesChange}
                />
```

- [ ] **Step 7: `DeliverableListItem.tsx` — leave untouched**

`components/project/DeliverableListItem.tsx` has no importers anywhere in the codebase (confirmed during planning via `grep -rln "DeliverableListItem" app components`) — it's dead code. Do not modify it as part of this task; it still imports `getDeliverableType` from `DeliverableCard.tsx` which Step 5 removes, so it will fail to compile if left as-is and imported — but since nothing imports it, it's never included in any build graph that matters. Confirm this in Step 7's typecheck (if it errors, that's a real problem — investigate before proceeding).

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors. If `DeliverableListItem.tsx` produces an error, `tsc --noEmit -p .` type-checks every file in the project regardless of import graph — fix it too (same mechanical `title`→`name`, `getDeliverableType`→`type` substitution as Step 5, or delete the file if truly unused — confirm with `grep -rln DeliverableListItem` one more time first).

- [ ] **Step 9: Manual verification**

Start the dev server. Open `/admin/projects/07c15c68-ada5-4b73-ab6b-5c8e947c7996/edit`, find the "Leveranser" section, enable edit mode. Confirm it shows the 4 video deliverables (The Climb, Coffee at Altitude, Hygge Games Vol. 2, Behind the Scenes) with no quantity field. Add an "annet" item with quantity 5, confirm it saves (reload, still there). Then open the published pitch page for this project (`/p/<token>` — find the token via the project's edit page share link) and confirm the same 5 items render there.

- [ ] **Step 10: Commit**

```bash
git add components/project/SectionRenderer.tsx components/sections/DeliverablesSection.tsx components/project/DeliverableGrid.tsx components/project/DeliverableCard.tsx "app/admin/projects/[id]/edit/page.tsx"
git commit -m "feat: pitch editor and published pitch page read/write projects.deliverables"
```

---

### Task 5: Quote builder — richer fields, bulk-video add, prefill from `project.deliverables`

**Files:**
- Modify: `components/quote/QuoteBuilder.tsx`
- Modify: `app/admin/projects/[id]/quote/page.tsx`

**Interfaces:**
- Consumes: `DeliverableItem` (Task 1); `project.deliverables` (already fetched via `select('*')` on the quote page).
- Produces: nothing new consumed elsewhere — `quote_data.deliverables` still flows into `app/api/contracts/sign/route.ts` exactly as before (Task 4 of the July 27 plan), unchanged by this task.

- [ ] **Step 1: Extend the `DeliverablesSection` component in `QuoteBuilder.tsx` with format/description/quantity and bulk-video add**

Find:

```tsx
function DeliverablesSection({
  items, onChange,
}: {
  items: DeliverableItem[]
  onChange: (items: DeliverableItem[]) => void
}) {
  const update = (id: string, field: 'type' | 'name', value: string) =>
    onChange(items.map(i => (i.id === id ? { ...i, [field]: value } : i)))
  const add = () => onChange([...items, { id: newId(), type: 'video', name: '' }])
  const remove = (id: string) => onChange(items.filter(i => i.id !== id))

  return (
    <div>
      <div style={sectionHeaderStyle}>
        <span style={sectionLabelStyle}>Leveranser (video/foto)</span>
        <Button size="sm" variant="ghost" onClick={add} type="button">+ Legg til leveranse</Button>
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <div key={item.id} className="group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <select
                style={{ ...inputBase, width: 100, flexShrink: 0 }}
                value={item.type}
                onChange={e => update(item.id, 'type', e.target.value)}
              >
                <option value="video">Video</option>
                <option value="photo">Foto</option>
                <option value="annet">Annet</option>
              </select>
              <input
                style={{ ...inputBase, flex: 1 }}
                value={item.name}
                onChange={e => update(item.id, 'name', e.target.value)}
                placeholder="F.eks. Hovedfilm, Reel, Produktbilder"
              />
              <button type="button" onClick={() => remove(item.id)} style={{ color: C.text3, background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
                title="Fjern">×</button>
            </div>
          ))}
        </div>
      )}
      {items.length === 0 && <p style={{ color: C.text3, fontSize: '0.72rem', padding: '8px 0', fontFamily: 'var(--font-dm-sans)' }}>Ingen leveranser lagt til ennå — én video antas som default.</p>}
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 10 }}>
        Fryses som fasit når kontrakten signeres. 2+ videoer gir egne faner i post-produksjon (Logging/Ferdig delt, resten per video).
      </p>
    </div>
  )
}
```

Replace with:

```tsx
function DeliverablesSection({
  items, onChange,
}: {
  items: DeliverableItem[]
  onChange: (items: DeliverableItem[]) => void
}) {
  const update = (id: string, field: 'type' | 'name' | 'format' | 'description' | 'quantity', value: string) =>
    onChange(items.map(i => (i.id === id ? { ...i, [field]: field === 'quantity' ? (parseInt(value, 10) || undefined) : value } : i)))
  const add = () => onChange([...items, { id: newId(), type: 'video', name: '' }])
  const remove = (id: string) => onChange(items.filter(i => i.id !== id))
  // Video er alltid individuelt navngitte rader (ingen quantity) — bulk-tillegg lager N rader
  // med placeholder-navn i stedet for ett antall-felt. Se
  // docs/superpowers/specs/2026-09-07-unified-deliverables-list-design.md §3.
  const addVideos = () => {
    const count = parseInt(prompt('Hvor mange videoer?') ?? '', 10)
    if (!count || count < 1) return
    const existingVideoCount = items.filter(i => i.type === 'video').length
    const newRows: DeliverableItem[] = Array.from({ length: count }, (_, idx) => ({
      id: newId(), type: 'video', name: `Reel ${existingVideoCount + idx + 1}`,
    }))
    onChange([...items, ...newRows])
  }

  return (
    <div>
      <div style={sectionHeaderStyle}>
        <span style={sectionLabelStyle}>Leveranser (video/foto)</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" variant="ghost" onClick={add} type="button">+ Legg til leveranse</Button>
          <Button size="sm" variant="ghost" onClick={addVideos} type="button">+ Legg til flere videoer</Button>
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(item => (
            <div key={item.id} className="group" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px', border: `1px solid ${C.border}`, borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <select
                  style={{ ...inputBase, width: 100, flexShrink: 0 }}
                  value={item.type}
                  onChange={e => update(item.id, 'type', e.target.value)}
                >
                  <option value="video">Video</option>
                  <option value="photo">Foto</option>
                  <option value="annet">Annet</option>
                </select>
                <input
                  style={{ ...inputBase, flex: 1 }}
                  value={item.name}
                  onChange={e => update(item.id, 'name', e.target.value)}
                  placeholder="F.eks. Hovedfilm, Reel, Produktbilder"
                />
                {item.type !== 'video' && (
                  <input
                    type="number"
                    min={1}
                    style={{ ...inputBase, width: 64, flexShrink: 0 }}
                    value={item.quantity ?? ''}
                    onChange={e => update(item.id, 'quantity', e.target.value)}
                    placeholder="Ant."
                  />
                )}
                <input
                  style={{ ...inputBase, width: 120, flexShrink: 0 }}
                  value={item.format ?? ''}
                  onChange={e => update(item.id, 'format', e.target.value)}
                  placeholder="Format"
                />
                <button type="button" onClick={() => remove(item.id)} style={{ color: C.text3, background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
                  title="Fjern">×</button>
              </div>
              <input
                style={{ ...inputBase, fontSize: '0.7rem' }}
                value={item.description ?? ''}
                onChange={e => update(item.id, 'description', e.target.value)}
                placeholder="Beskrivelse (valgfri)"
              />
            </div>
          ))}
        </div>
      )}
      {items.length === 0 && <p style={{ color: C.text3, fontSize: '0.72rem', padding: '8px 0', fontFamily: 'var(--font-dm-sans)' }}>Ingen leveranser lagt til ennå — én video antas som default.</p>}
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 10 }}>
        Fryses som fasit når kontrakten signeres. 2+ videoer gir egne faner i post-produksjon (Logging/Ferdig delt, resten per video).
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Prefill `data.deliverables` from `project.deliverables` when creating a new quote**

Find (in `app/admin/projects/[id]/quote/page.tsx`, the "No existing quote" branch):

```ts
        // No existing quote — create initial data pre-populated from project team section
        const initial = createEmptyBuilderData(proj?.title || '')
        if (proj?.delivery_description) {
          initial.deliveryDescription = proj.delivery_description
        }
```

Replace with:

```ts
        // No existing quote — create initial data pre-populated from project team section
        const initial = createEmptyBuilderData(proj?.title || '')
        if (proj?.delivery_description) {
          initial.deliveryDescription = proj.delivery_description
        }
        // Prefyll fra pitchens leveranseliste hvis den allerede er satt (samme felt som
        // postprod/pitch-siden leser — se docs/superpowers/specs/2026-09-07-unified-deliverables-list-design.md §5).
        if (proj?.deliverables && proj.deliverables.length > 0) {
          initial.deliverables = proj.deliverables
        }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Open the tilbudsbygger for a project whose `deliverables` was already set via the pitch editor (e.g. project 07c15c68, which has 4 videos from Task-4's verification plus whatever "annet" row you added). If that project already has an accepted/existing quote, its `deliverables` won't be touched by this prefill (only the "no existing quote yet" path uses it) — instead, use `+ Nytt tilbud` to create a fresh quote version and confirm the new version's "Leveranser" list starts pre-filled with the same items. Add a photo item with quantity 3 and a description, save, reload, confirm it persisted on that quote version specifically (switching back to an older version shows the older version's own list, unaffected).

- [ ] **Step 5: Commit**

```bash
git add components/quote/QuoteBuilder.tsx "app/admin/projects/[id]/quote/page.tsx"
git commit -m "feat: quote builder gets format/description/quantity fields and prefills from project.deliverables"
```

---

### Task 6: Migration script — backfill existing projects

**Files:**
- Create: `scripts/migrate-deliverables.mjs` (temporary — delete after running, per Step 4)

**Interfaces:**
- Consumes: nothing from earlier tasks except the final shape of `DeliverableItem` (Task 1) — this is a plain data script, not app code, so it doesn't import from the app.
- Produces: `projects.deliverables` populated for every project that had `sections.content.deliverableItems` but an empty/null `projects.deliverables`.

- [ ] **Step 1: Write the script**

```js
// scripts/migrate-deliverables.mjs
// Engangs-databerikelse: kopier sections.content.deliverableItems (den gamle,
// kundevendte "Info om levering"-listen) inn i projects.deliverables (den nye,
// samlede listen) for alle prosjekter som mangler det. type settes til 'annet'
// for alt — gammel data har ingen type, og en nøytral default hindrer at noe
// prosjekt utilsiktet får video-faner det ikke ba om. Se
// docs/superpowers/specs/2026-09-07-unified-deliverables-list-design.md §6.
//
// Kjør: export $(grep -E "^NEXT_PUBLIC_SUPABASE_URL|^SUPABASE_SERVICE_ROLE_KEY" .env.local | xargs) && node scripts/migrate-deliverables.mjs
// Kjør med --dry-run først for å se hva som ville blitt skrevet uten å skrive noe.

import { createClient } from '@supabase/supabase-js'

const dryRun = process.argv.includes('--dry-run')
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('project_id, content')
    .eq('type', 'deliverables')
  if (sectionsError) throw sectionsError

  const withItems = sections.filter(s => Array.isArray(s.content?.deliverableItems) && s.content.deliverableItems.length > 0)
  console.log(`${sections.length} deliverables-seksjoner totalt, ${withItems.length} med innhold.`)

  const projectIds = withItems.map(s => s.project_id)
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, deliverables')
    .in('id', projectIds)
  if (projectsError) throw projectsError

  const alreadySet = new Map(projects.map(p => [p.id, Array.isArray(p.deliverables) && p.deliverables.length > 0]))

  let migrated = 0
  let skipped = 0
  for (const section of withItems) {
    if (alreadySet.get(section.project_id)) {
      skipped++
      continue
    }
    const items = section.content.deliverableItems.map(old => ({
      id: old.id,
      type: 'annet',
      name: old.title ?? '',
      format: old.format ?? old.aspectRatio ?? undefined,
      description: old.description ?? undefined,
      quantity: old.quantity ?? undefined,
    }))
    console.log(`Prosjekt ${section.project_id}: ${items.length} leveranser${dryRun ? ' (dry-run, ikke skrevet)' : ''}`)
    if (!dryRun) {
      const { error } = await supabase.from('projects').update({ deliverables: items }).eq('id', section.project_id)
      if (error) {
        console.error(`  Feil: ${error.message}`)
        continue
      }
    }
    migrated++
  }
  console.log(`\nFerdig. ${migrated} prosjekter migrert, ${skipped} hoppet over (hadde allerede projects.deliverables satt).`)
}

main()
```

- [ ] **Step 2: Dry run**

Run: `export $(grep -E "^NEXT_PUBLIC_SUPABASE_URL|^SUPABASE_SERVICE_ROLE_KEY" .env.local | xargs) && node scripts/migrate-deliverables.mjs --dry-run`

Read through the output — confirm the project count looks reasonable (roughly matches how many projects have ever had a pitch built) and spot-check a couple of project IDs against the admin UI to confirm their "Info om levering" content matches what the script would write.

- [ ] **Step 3: Run it for real**

Run: `export $(grep -E "^NEXT_PUBLIC_SUPABASE_URL|^SUPABASE_SERVICE_ROLE_KEY" .env.local | xargs) && node scripts/migrate-deliverables.mjs`

Expected: same project count as the dry run, all migrated (0 errors). Spot-check 2-3 projects' published pitch pages (`/p/<token>`) before and after to confirm the deliverables section still renders identically (same names/quantities/formats — just now sourced from `projects.deliverables` after Task 4 lands, or from `sections.content.deliverableItems` still if Task 4 hasn't landed yet in your execution order — either way nothing should look different to a viewer).

- [ ] **Step 4: Delete the script**

```bash
rm scripts/migrate-deliverables.mjs
git add -A
git commit -m "chore: run one-time deliverables migration (script removed, see commit message for what ran)"
```

Note in the commit message body how many projects were migrated (from Step 3's output).

---

### Task 7: AI generation — `generate-project` produces `type`, writes to `projects.deliverables`

**Files:**
- Modify: `app/api/generate-project/route.ts`

**Interfaces:**
- Consumes: `DeliverableItem` shape (Task 1).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Ask the AI prompt for `type` too**

Find:

```ts
async function generateDeliverables(
  projectContext: string,
  contentType: string,
  mediums: string[],
  scope: string,
  context: string,
  language: string = 'no'
): Promise<Array<{ id: string; title: string; quantity: number; format: string; description: string }>> {
```

Replace with:

```ts
async function generateDeliverables(
  projectContext: string,
  contentType: string,
  mediums: string[],
  scope: string,
  context: string,
  language: string = 'no'
): Promise<Array<{ id: string; type: 'video' | 'photo' | 'annet'; name: string; quantity?: number; format: string; description: string }>> {
```

Find the English prompt template:

```ts
  const prompt = language === 'en'
    ? `${projectContext}\n\nTASK: Based on the project information above, suggest 3-5 concrete deliverables for this project.\n\nEach deliverable should have:\n- title: Short name (e.g. "PRODUCT PHOTOS", "MAIN FILM", "INSTAGRAM REELS", "DOCUMENTATION")\n- quantity: Integer number only (e.g. 20, 1, 5) — no units, no text\n- format: Format/aspect ratio/duration (e.g. "16:9", "9:16", "1:1", "2:30 min", "30 sec")\n- description: A short description (1-2 sentences) of what the deliverable entails\n\nAdapt to:\n- Content type: ${contentTypeLabel}\n- Platforms: ${mediums?.join(', ') || 'Not specified'}\n- Scope: ${scope || 'Not specified'}\n\n${context ? 'Pay special attention to any specific wishes in the context.' : ''}\n\nRespond ONLY with valid JSON:\n[\n  { "id": "1", "title": "TITLE", "quantity": 1, "format": "format", "description": "Short description" },\n  ...\n]`
    : `${projectContext}

OPPGAVE: Basert på prosjektinformasjonen over, foreslå 3-5 konkrete leveranser (deliverables) for dette prosjektet.

Hver leveranse skal ha:
- title: Kort navn på leveransen (f.eks. "PRODUKTBILDER", "HOVEDFILM", "INSTAGRAM REELS", "DOKUMENTASJON")
- quantity: Kun et heltall (f.eks. 20, 1, 5) — ingen tekst, ingen enheter
- format: Format/aspect ratio/varighet (f.eks. "16:9", "9:16", "1:1", "2:30 min", "30 sek")
- description: En kort beskrivelse (1-2 setninger) av hva leveransen innebærer

Tilpass leveransene til:
- Innholdstype: ${contentTypeLabel}
- Plattformer: ${mediums?.join(', ') || 'Ikke spesifisert'}
- Omfang: ${scope || 'Ikke spesifisert'}

${context ? `Legg spesielt merke til eventuelle spesifikke ønsker i konteksten.` : ''}

Svar BARE med gyldig JSON i dette formatet:
[
  { "id": "1", "title": "TITTEL", "quantity": 1, "format": "format", "description": "Kort beskrivelse" },
  ...
]`
```

Replace with:

```ts
  const prompt = language === 'en'
    ? `${projectContext}\n\nTASK: Based on the project information above, suggest 3-5 concrete deliverables for this project.\n\nEach deliverable should have:\n- type: One of "video", "photo", "annet" (other)\n- name: Short name (e.g. "PRODUCT PHOTOS", "MAIN FILM", "INSTAGRAM REELS", "DOCUMENTATION"). For type "video", if there would naturally be more than one separate video (e.g. several distinct reels), create ONE ROW PER VIDEO with its own name — never bundle multiple videos into one row with a quantity.\n- quantity: Integer number only (e.g. 20, 5) — ONLY for type "photo" or "annet", omit entirely for type "video"\n- format: Format/aspect ratio/duration (e.g. "16:9, 20 sec", "9:16, 30 sec", "1:1")\n- description: A short description (1-2 sentences) of what the deliverable entails\n\nAdapt to:\n- Content type: ${contentTypeLabel}\n- Platforms: ${mediums?.join(', ') || 'Not specified'}\n- Scope: ${scope || 'Not specified'}\n\n${context ? 'Pay special attention to any specific wishes in the context.' : ''}\n\nRespond ONLY with valid JSON:\n[\n  { "id": "1", "type": "video", "name": "NAME", "format": "format", "description": "Short description" },\n  { "id": "2", "type": "photo", "name": "NAME", "quantity": 10, "format": "format", "description": "Short description" },\n  ...\n]`
    : `${projectContext}

OPPGAVE: Basert på prosjektinformasjonen over, foreslå 3-5 konkrete leveranser (deliverables) for dette prosjektet.

Hver leveranse skal ha:
- type: Én av "video", "photo", "annet"
- name: Kort navn på leveransen (f.eks. "PRODUKTBILDER", "HOVEDFILM", "INSTAGRAM REELS", "DOKUMENTASJON"). For type "video", hvis det naturlig blir flere separate videoer (f.eks. flere ulike reels), lag ÉN RAD PER VIDEO med eget navn — aldri slå sammen flere videoer i én rad med et antall.
- quantity: Kun et heltall (f.eks. 20, 5) — KUN for type "photo" eller "annet", utelat helt for type "video"
- format: Format/aspect ratio/varighet (f.eks. "16:9, 20 sek", "9:16, 30 sek", "1:1")
- description: En kort beskrivelse (1-2 setninger) av hva leveransen innebærer

Tilpass leveransene til:
- Innholdstype: ${contentTypeLabel}
- Plattformer: ${mediums?.join(', ') || 'Ikke spesifisert'}
- Omfang: ${scope || 'Ikke spesifisert'}

${context ? `Legg spesielt merke til eventuelle spesifikke ønsker i konteksten.` : ''}

Svar BARE med gyldig JSON i dette formatet:
[
  { "id": "1", "type": "video", "name": "NAVN", "format": "format", "description": "Kort beskrivelse" },
  { "id": "2", "type": "photo", "name": "NAVN", "quantity": 10, "format": "format", "description": "Kort beskrivelse" },
  ...
]`
```

- [ ] **Step 2: Write the AI's output to `projects.deliverables` instead of the section**

Find:

```ts
    // 4.5 LEVERANSER-seksjon (dynamisk basert på kontekst)
    const deliverablesSection = sections?.find(s => s.type === 'deliverables')
    if (deliverablesSection) {
      const deliverableItems = await generateDeliverables(projectContext, contentType, mediums, scope, context, language)
      generatedContent.deliverables = { 
        ...generatedContent.deliverables,
        deliverableItems 
      }
    }
```

Replace with:

```ts
    // 4.5 LEVERANSER — skrives direkte til projects.deliverables (den samlede listen
    // postprod/pitch-siden/tilbudsbyggeren leser fra), ikke lenger til seksjonens content.
    // Se docs/superpowers/specs/2026-09-07-unified-deliverables-list-design.md.
    const deliverablesSection = sections?.find(s => s.type === 'deliverables')
    let generatedDeliverables: Awaited<ReturnType<typeof generateDeliverables>> | null = null
    if (deliverablesSection) {
      generatedDeliverables = await generateDeliverables(projectContext, contentType, mediums, scope, context, language)
      await supabase.from('projects').update({ deliverables: generatedDeliverables }).eq('id', projectId)
    }
```

(`projectId` is destructured from the request body near the top of the `POST` handler, line ~73; `supabase` is assigned via `createServiceClient()` a few lines later, line ~92 — both are in scope at the "4.5 LEVERANSER" block, confirmed during planning.)

- [ ] **Step 3: Remove the now-dead image-linking reference to `generatedContent.deliverables`**

Find:

```ts
          generatedContent.deliverables = { ...generatedContent.deliverables, imageId: deliverableImageId }
```

This line still needs to work — it attaches a hero image to the deliverables section's content, which is unrelated to the deliverable items list and stays section-scoped. Leave this line unchanged. Confirm in Step 4 that `generatedContent.deliverables` (now only ever holding `{ imageId }`, never `{ deliverableItems }`) still gets written to the section correctly in the "Oppdater seksjonene i databasen" loop further down.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Create a new project via `/admin/projects/new` using the AI-generation flow (whatever entry point triggers `generate-project`). After generation completes, open the project's edit page and confirm the "Leveranser" section shows AI-suggested items with a mix of `type`s, and video items have no quantity shown. Confirm the section's background image (if one was generated) still attached correctly (Step 3's concern).

- [ ] **Step 6: Commit**

```bash
git add app/api/generate-project/route.ts
git commit -m "feat: AI-generated deliverables get a type, write to projects.deliverables"
```

---

### Task 8: Translation — `translate-project` translates `projects.deliverables`

**Files:**
- Modify: `app/api/translate-project/route.ts`

**Interfaces:**
- Consumes: `DeliverableItem` shape (Task 1).
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Translate the project-level list instead of the section's**

Find:

```ts
      // Translate deliverable items
      if (section.type === 'deliverables' && Array.isArray(content.deliverableItems)) {
        content.deliverableItems = await Promise.all(
          content.deliverableItems.map(async (item: { id: string; title: string; quantity: number; format: string; description: string }) => ({
            ...item,
            title: item.title ? await translateText(item.title, targetLanguage, openai) : item.title,
            description: item.description ? await translateText(item.description, targetLanguage, openai) : item.description,
          }))
        )
        changed = true
      }
```

Replace with nothing (delete this block) — it operated on the now-unused `section.content.deliverableItems`. Deliverables translation moves to a one-time pass over `project.deliverables`, added in Step 2, run once per project regardless of how many sections exist (deliverables is no longer a section-content field).

- [ ] **Step 2: Add a single project-level deliverables translation pass**

This route handler (`POST`, `app/api/translate-project/route.ts`) never fetches the full project row today — only `projectId`/`targetLanguage` (destructured from the request body) and `supabase`/`openai` (both declared near the top of `POST`) are in scope where the `sections` loop runs. Fetch `deliverables` fresh in this new block.

Find (the very end of the sections loop, right before the function updates the project's language and returns):

```ts
    // Update project language
    await supabase
      .from('projects')
      .update({ language: targetLanguage, updated_at: new Date().toISOString() })
      .eq('id', projectId)

    return Response.json({ success: true, language: targetLanguage })
```

Replace with:

```ts
    // Leveranselisten er nå ett felt på selve prosjektet (projects.deliverables), ikke
    // lenger seksjons-innhold — oversettes én gang her i stedet for inni sections-loopen over.
    // Se docs/superpowers/specs/2026-09-07-unified-deliverables-list-design.md.
    const { data: projectRow } = await supabase
      .from('projects')
      .select('deliverables')
      .eq('id', projectId)
      .single()

    if (Array.isArray(projectRow?.deliverables) && projectRow.deliverables.length > 0) {
      const translatedDeliverables = await Promise.all(
        projectRow.deliverables.map(async (item: { id: string; type: 'video' | 'photo' | 'annet'; name: string; format?: string; description?: string; quantity?: number }) => ({
          ...item,
          name: item.name ? await translateText(item.name, targetLanguage, openai) : item.name,
          description: item.description ? await translateText(item.description, targetLanguage, openai) : item.description,
        }))
      )
      await supabase.from('projects').update({ deliverables: translatedDeliverables }).eq('id', projectId)
    }

    // Update project language
    await supabase
      .from('projects')
      .update({ language: targetLanguage, updated_at: new Date().toISOString() })
      .eq('id', projectId)

    return Response.json({ success: true, language: targetLanguage })
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manual verification**

On a project with `deliverables` set (e.g. 07c15c68), trigger the translate action (check the edit page for the "Oversett"/translate button used in `handleTranslate`, seen in `app/admin/projects/[id]/page.tsx` earlier this session). Confirm the deliverables' names/descriptions come back translated, types/formats/quantities unchanged.

- [ ] **Step 5: Commit**

```bash
git add app/api/translate-project/route.ts
git commit -m "feat: translate projects.deliverables directly instead of section content"
```

---

### Task 9: Transfers — read `projects.deliverables`, rename `title` → `name`

**Files:**
- Modify: `lib/actions/transfers.ts`
- Modify: `app/admin/transfers/new/TransferUploadClient.tsx`

**Interfaces:**
- Consumes: `project.deliverables` directly (no more `sections` join).
- Produces: `ProjectForTransfer.deliverables` field renamed `title`→`name` — Step 2 updates the one consumer.

- [ ] **Step 1: Read `projects.deliverables` directly, drop the `sections` join**

Find:

```ts
export type ProjectForTransfer = {
  id: string
  title: string
  language: 'no' | 'en'
  customer: {
    name: string
    company: string | null
    email: string | null
  } | null
  deliverables: Array<{
    title?: string
    quantity?: number | null
    format?: string
    description?: string
  }>
}

// Henter prosjekt + kunde + leveranseinfo for pre-utfylling av leveringssiden
export async function getProjectForTransfer(projectId: string): Promise<ProjectForTransfer | null> {
```

Replace with:

```ts
export type ProjectForTransfer = {
  id: string
  title: string
  language: 'no' | 'en'
  customer: {
    name: string
    company: string | null
    email: string | null
  } | null
  deliverables: Array<{
    name?: string
    quantity?: number | null
    format?: string
    description?: string
  }>
}

// Henter prosjekt + kunde + leveranseinfo for pre-utfylling av leveringssiden
export async function getProjectForTransfer(projectId: string): Promise<ProjectForTransfer | null> {
```

Find:

```ts
    .from('projects')
    .select(`
      id, title, language,
      customers (id, name, company, email)
    `)
    .eq('id', projectId)
    .single()

  if (!project) return null

  // Hent leveranseliste fra sections (type = deliverables)
  const { data: section } = await supabase
    .from('sections')
    .select('content')
    .eq('project_id', projectId)
    .eq('type', 'deliverables')
    .maybeSingle()

  type DeliverableContent = { deliverableItems?: ProjectForTransfer['deliverables'] }
  const deliverables = (section?.content as DeliverableContent | null)?.deliverableItems ?? []
```

Replace with:

```ts
    .from('projects')
    .select(`
      id, title, language, deliverables,
      customers (id, name, company, email)
    `)
    .eq('id', projectId)
    .single()

  if (!project) return null

  const deliverables = (project as { deliverables?: ProjectForTransfer['deliverables'] }).deliverables ?? []
```

- [ ] **Step 2: Rename `title` → `name` in the email-body builder**

Find:

```ts
  const delivLines = project.deliverables
    .filter(d => d.title)
    .map(d => `• ${d.quantity ? `${d.quantity}× ` : ''}${d.title}${d.format ? ` (${d.format})` : ''}`)
    .join('\n')
```

Replace with:

```ts
  const delivLines = project.deliverables
    .filter(d => d.name)
    .map(d => `• ${d.quantity ? `${d.quantity}× ` : ''}${d.name}${d.format ? ` (${d.format})` : ''}`)
    .join('\n')
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Open `/admin/transfers/new` for a project with `deliverables` set, confirm the default email message body lists the deliverables by name correctly.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/transfers.ts app/admin/transfers/new/TransferUploadClient.tsx
git commit -m "feat: read projects.deliverables directly in transfer flow"
```

---

### Task 10: End-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors anywhere in the project.

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Fresh project, no quote yet — confirm 0/1-deliverable behavior is unchanged**

Create a brand new project, don't touch its "Leveranser" section at all. Confirm its postprod board/stepper (once it reaches post-prod) still shows the old single flat lane, no tabs — matching the "0 deliverables" case from the July 27 spec, completely unaffected by this work.

- [ ] **Step 4: Full lifecycle on a fresh project — pitch → tilbud → signering → postprod**

Create a new project. In the pitch editor, add 3 video deliverables via "+ Legg til flere videoer" (name them individually) plus one photo deliverable with quantity 8. Build a quote — confirm the tilbudsbygger's "Leveranser" list is pre-filled with all 4 items. Publish and sign the contract (test flow, not a real customer). Confirm: `contracts.deliverables` has the 4 frozen items; `projects.deliverables` has the same 4; postprod (once the project reaches post_prod) shows 3 video tabs + the photo lane unaffected (photo never tabs). Edit one deliverable's name directly on the postprod page's "Info om levering" modal after signing — confirm it saves and `contracts.deliverables` (the historical snapshot) is untouched.

- [ ] **Step 5: Report**

Summarize in the final commit or a chat message: migration script's project count (from Task 6), and confirmation that all steps above passed.
