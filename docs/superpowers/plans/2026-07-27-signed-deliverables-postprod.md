# Signert leveranse som fasit — flere video-leveranser med egne faner i post-prod — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed contract freezes a structured `type + name` deliverables list; post-prod's video section reads it and, when 2+ videos exist, splits into a shared area (Logging/Ferdig by default) plus one tab per video (Grovklipp→Klipp→Farger→Lyd each), while staying pixel-identical to today for every project with 0-1 videos.

**Architecture:** New `deliverables` JSONB columns on `quotes.quote_data` (draft, via `QuoteBuilderData`), `contracts` (frozen snapshot at signing) and `projects` (live copy of the latest signed snapshot, what everything else reads). `tasks.deliverable_id` (nullable text, matches a deliverable's stable id) and `task_templates.default_scope` (`shared` | `per_deliverable`, video templates only) drive which post-prod cards are shared vs. per-video. `getPostProdBoard` branches on `projects.deliverables` video count; the board UI and its "add task" form gain a `video_deliverable` destination alongside the existing `video`/`photo`/`custom`/`parallel` ones.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS), TypeScript strict, `@dnd-kit` for the board's drag-and-drop.

## Global Constraints

- Photo is never split into tabs — only video. (Spec §3, confirmed with Magnus 2026-07-27.)
- Projects with 0 or 1 video deliverable must render and behave exactly as today — no visual or data change. (Spec §3, §4.)
- No existing task rows are ever deleted or silently reassigned except the one documented 1→2+ transition case (Spec §3, "Overgangen fra 1 → 2+").
- `delivery_description` (free text) is untouched — it still drives the contract PDF's legal wording. (Spec §2, "Utkast-steget".)
- No automated test runner exists in this repo (`package.json` has no `test` script) — verification is `npx tsc --noEmit`, targeted Node scripts against Supabase with the service-role key (pattern already used throughout this project's migrations), and manual/browser checks for UI. Every task's steps say exactly which to use.
- Spec: `docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md`.

---

### Task 1: Migration — new columns

**Files:**
- Create: `supabase/migrations/128_signed_deliverables.sql`

**Interfaces:**
- Produces: `contracts.deliverables` (jsonb, nullable), `projects.deliverables` (jsonb, nullable), `tasks.deliverable_id` (text, nullable), `task_templates.default_scope` (text, nullable, check `'shared'|'per_deliverable'`), with `Logging`/`Ferdig` video post_prod templates backfilled to `shared` and the rest to `per_deliverable`.

- [ ] **Step 1: Write the migration file**

```sql
-- 128_signed_deliverables.sql
-- Signert leveranse som fasit: strukturert liste over video-/foto-elementer,
-- fryst på contracts ved signering, med en levende kopi på projects som
-- post-prod og resten av systemet leser fra. Se
-- docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md

ALTER TABLE contracts ADD COLUMN IF NOT EXISTS deliverables JSONB;
ALTER TABLE projects  ADD COLUMN IF NOT EXISTS deliverables JSONB;
ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS deliverable_id TEXT;

ALTER TABLE task_templates ADD COLUMN IF NOT EXISTS default_scope TEXT
  CHECK (default_scope IN ('shared', 'per_deliverable'));

-- Kun video-malene i post_prod-steget får en verdi — foto splittes aldri i
-- egne faner (avklart med Magnus), photo-maler forblir NULL/urørt.
UPDATE task_templates SET default_scope = 'shared'
WHERE pipeline_stage = 'post_prod' AND project_type = 'video' AND title IN ('Logging', 'Ferdig');

UPDATE task_templates SET default_scope = 'per_deliverable'
WHERE pipeline_stage = 'post_prod' AND project_type = 'video' AND title NOT IN ('Logging', 'Ferdig');
```

- [ ] **Step 2: Ask Magnus to run it**

This session has repeatedly hit a pre-existing migration-history drift in this repo (several duplicate-numbered files confuse `supabase db push`). The reliable path all session has been: paste the migration's SQL into the Supabase SQL editor directly, then run `supabase migration repair --status applied 128` afterward so the local file and remote history agree. Ask Magnus to run the SQL above, then run:

```bash
supabase migration repair --status applied 128
```

- [ ] **Step 3: Verify the columns and backfill**

Create a throwaway script (delete after running):

```js
// /tmp/verify-128.js
const { createClient } = require("@supabase/supabase-js")
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const r1 = await sb.from("projects").select("deliverables").limit(1)
  console.log("projects.deliverables:", r1.error ?? "OK")
  const r2 = await sb.from("contracts").select("deliverables").limit(1)
  console.log("contracts.deliverables:", r2.error ?? "OK")
  const r3 = await sb.from("tasks").select("deliverable_id").limit(1)
  console.log("tasks.deliverable_id:", r3.error ?? "OK")
  const { data } = await sb.from("task_templates")
    .select("title, default_scope")
    .eq("pipeline_stage", "post_prod").eq("project_type", "video")
    .order("sort_order")
  console.log(data)
})()
```

Run: `export $(grep -E "^NEXT_PUBLIC_SUPABASE_URL|^SUPABASE_SERVICE_ROLE_KEY" .env.local | xargs) && node /tmp/verify-128.js`

Expected: all three column checks print `OK` (no error), and the printed list shows `Logging` and `Ferdig` with `default_scope: 'shared'`, and `Grovklipp`/`Klipp`/`Farger`/`Lyd`/`Venter på tilbakemelding` with `default_scope: 'per_deliverable'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/128_signed_deliverables.sql
git commit -m "feat: add deliverables columns for signed-contract post-prod tabs"
```

---

### Task 2: Types

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: nothing (pure type addition).
- Produces: `DeliverableItem` (`{ id: string; type: 'video' | 'photo'; name: string }`), `Project.deliverables?: DeliverableItem[] | null`, `Contract.deliverables: DeliverableItem[] | null`, `QuoteBuilderData.deliverables: DeliverableItem[]` — every later task imports `DeliverableItem` from `@/lib/types`.

- [ ] **Step 1: Add `DeliverableItem` and the `Project` field**

In `lib/types.ts`, find:

```ts
export type Project = {
  id: string
  title: string
```

Replace with:

```ts
export type DeliverableItem = {
  id: string
  type: 'video' | 'photo'
  name: string
}

export type Project = {
  id: string
  title: string
```

Then find (still inside `Project`):

```ts
  delivery_description?: string | null
  delivery_video?: string | null
  delivery_photo?: string | null
  post_prod_days?: number | null
```

Replace with:

```ts
  delivery_description?: string | null
  delivery_video?: string | null
  delivery_photo?: string | null
  /** Levende kopi av leveranselisten fra siste signerte kontrakt — se Contract.deliverables for den uforanderlige historikken. */
  deliverables?: DeliverableItem[] | null
  post_prod_days?: number | null
```

- [ ] **Step 2: Add the `Contract` field**

Find:

```ts
export type Contract = {
  id: string
  quote_id: string
  project_id: string
  pdf_path: string | null
  status: 'pending' | 'sent' | 'signed' | 'cancelled'
```

Replace with:

```ts
export type Contract = {
  id: string
  quote_id: string
  project_id: string
  pdf_path: string | null
  /** Uforanderlig kopi av leveranselisten på signeringstidspunktet — satt kun ved signering, aldri oppdatert igjen. */
  deliverables: DeliverableItem[] | null
  status: 'pending' | 'sent' | 'signed' | 'cancelled'
```

- [ ] **Step 3: Add the `QuoteBuilderData` field**

Find:

```ts
  deliveryDate: string
  deliveryDescription: string
  terms: string
```

Replace with:

```ts
  deliveryDate: string
  deliveryDescription: string
  /** Strukturert leveranseliste, separat fra deliveryDescription-friteksten — fryses til contracts/projects.deliverables ved signering. */
  deliverables: DeliverableItem[]
  terms: string
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: new errors in `components/quote/QuoteBuilder.tsx` (missing `deliverables` in `createEmptyBuilderData` — a required field on `QuoteBuilderData` now) and possibly nowhere else yet. That's expected — Task 3 fixes it. Confirm no *other* file errors.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add DeliverableItem type for signed-contract deliverables"
```

---

### Task 3: Quote builder — deliverables editor

**Files:**
- Modify: `components/quote/QuoteBuilder.tsx`

**Interfaces:**
- Consumes: `DeliverableItem` from `@/lib/types` (Task 2).
- Produces: `createEmptyBuilderData()` now includes `deliverables: []`; the builder UI reads/writes `data.deliverables` via the existing `set('deliverables', ...)` helper — Task 4 (sign route) reads this same field off the saved `quote_data`.

- [ ] **Step 1: Import the type**

Find:

```ts
import { QuoteBuilderData, CrewMember, QuoteBuilderItem, OptionalAddon, OptionalAddonCategory, TeamMember, Customer, PriceCatalogItem, DiscountFactor, EquipmentGroupWithItems } from '@/lib/types'
```

Replace with:

```ts
import { QuoteBuilderData, CrewMember, QuoteBuilderItem, OptionalAddon, OptionalAddonCategory, TeamMember, Customer, PriceCatalogItem, DiscountFactor, EquipmentGroupWithItems, DeliverableItem } from '@/lib/types'
```

- [ ] **Step 2: Default it in `createEmptyBuilderData`**

Find:

```ts
    deliveryDate: '',
    deliveryDescription: '',
    terms: DEFAULT_TERMS,
```

Replace with:

```ts
    deliveryDate: '',
    deliveryDescription: '',
    deliverables: [],
    terms: DEFAULT_TERMS,
```

- [ ] **Step 3: Normalize it for quotes saved before this feature existed**

Find:

```ts
  const [data, setData] = useState<QuoteBuilderData>({
    ...initialData,
    startupCrew: initialData.startupCrew ?? [],
    shootDays: initialData.shootDays ?? 1,
    postProductionCrew: initialData.postProductionCrew ?? [],
    discountFactor: initialData.discountFactor ?? 0,
    companyEmail: initialData.companyEmail ?? 'eivind@leafilms.no',
    optionalAddons: initialData.optionalAddons ?? [],
  })
```

Replace with:

```ts
  const [data, setData] = useState<QuoteBuilderData>({
    ...initialData,
    startupCrew: initialData.startupCrew ?? [],
    shootDays: initialData.shootDays ?? 1,
    postProductionCrew: initialData.postProductionCrew ?? [],
    discountFactor: initialData.discountFactor ?? 0,
    companyEmail: initialData.companyEmail ?? 'eivind@leafilms.no',
    optionalAddons: initialData.optionalAddons ?? [],
    deliverables: initialData.deliverables ?? [],
  })
```

- [ ] **Step 4: Add the `DeliverablesSection` component**

Find the end of `AddonsSection` (it ends with a lone closing brace right after the closing `</div>` of its returned JSX — search for this exact block to anchor on):

```ts
      {items.length === 0 && <p style={{ color: C.text3, fontSize: '0.72rem', padding: '8px 0', fontFamily: 'var(--font-dm-sans)' }}>Ingen tillegg lagt til ennå</p>}
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 10 }}>
        Vises som avkrysningsbokser for kunden på det publiserte tilbudet. Et tillegg kan fordeles på flere poster samtidig
        (f.eks. Opptak + Post-produksjon) — kun MVA legges på hvis kunden haker av.
      </p>
    </div>
  )
}
```

Replace with the same block plus a new component appended right after:

```ts
      {items.length === 0 && <p style={{ color: C.text3, fontSize: '0.72rem', padding: '8px 0', fontFamily: 'var(--font-dm-sans)' }}>Ingen tillegg lagt til ennå</p>}
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 10 }}>
        Vises som avkrysningsbokser for kunden på det publiserte tilbudet. Et tillegg kan fordeles på flere poster samtidig
        (f.eks. Opptak + Post-produksjon) — kun MVA legges på hvis kunden haker av.
      </p>
    </div>
  )
}

// Fryses til contracts/projects.deliverables ved signering (se
// docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md).
// Separat fra deliveryDescription-friteksten over — denne listen driver kun
// post-prod-brettets struktur, ikke kontraktens juridiske ordlyd.
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

- [ ] **Step 5: Render it next to "Hva leveres til kunden"**

Find:

```tsx
            <div>
              <label style={labelStyle}>Hva leveres til kunden</label>
              <textarea
                style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6 }}
                rows={3}
                value={data.deliveryDescription ?? ''}
                onChange={e => set('deliveryDescription', e.target.value)}
                placeholder={'F.eks.\n2 kampanjefilmer á 90 sek\n30 retuserte produktbilder'}
              />
            </div>
            {customers.length > 0 && (
```

Replace with:

```tsx
            <div>
              <label style={labelStyle}>Hva leveres til kunden</label>
              <textarea
                style={{ ...fieldStyle, resize: 'vertical', fontFamily: 'var(--font-dm-sans)', lineHeight: 1.6 }}
                rows={3}
                value={data.deliveryDescription ?? ''}
                onChange={e => set('deliveryDescription', e.target.value)}
                placeholder={'F.eks.\n2 kampanjefilmer á 90 sek\n30 retuserte produktbilder'}
              />
            </div>
            <DeliverablesSection
              items={data.deliverables ?? []}
              onChange={v => set('deliverables', v)}
            />
            {customers.length > 0 && (
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Start the dev server (`npm run dev`), open any project's `/admin/projects/[id]/quote` page. Confirm: a "Leveranser (video/foto)" section appears below "Hva leveres til kunden" with a "+ Legg til leveranse" button. Add two rows (e.g. type Video / name "Hovedfilm", type Video / name "Reel"), wait for autosave, reload the page, confirm both rows persisted with their type and name intact.

- [ ] **Step 8: Commit**

```bash
git add components/quote/QuoteBuilder.tsx
git commit -m "feat: add structured deliverables list to quote builder"
```

---

### Task 4: Freeze the list at signing

**Files:**
- Modify: `app/api/contracts/sign/route.ts`

**Interfaces:**
- Consumes: `quoteData?.deliverables` (already loaded in this file as `QuoteBuilderData | null`, Task 3 guarantees the field exists on new quotes; older quotes without it simply have `undefined`, handled by `?? []`).
- Produces: `contracts.deliverables` and `projects.deliverables` populated at the moment of signing — Task 5 (`getPostProdBoard`) reads `projects.deliverables`.

- [ ] **Step 1: Snapshot onto the `contracts` row**

Find:

```ts
    const { error: updateContractError } = await supabase
      .from('contracts')
      .update({
        status: 'signed',
        signed_at: signedAt,
        signed_by: signerEmail,
        signature_data: {
          signerName,
          signerEmail,
          signedAt,
          contractSnapshot,
          ip,
          signatureImage,
        },
        updated_at: signedAt,
        ...(finalContractText !== baseContractText ? { contract_text: finalContractText } : {}),
      })
      .eq('id', contract.id)
```

Replace with:

```ts
    const { error: updateContractError } = await supabase
      .from('contracts')
      .update({
        status: 'signed',
        signed_at: signedAt,
        signed_by: signerEmail,
        signature_data: {
          signerName,
          signerEmail,
          signedAt,
          contractSnapshot,
          ip,
          signatureImage,
        },
        // Fryst kopi av leveranselisten på signeringstidspunktet — aldri
        // oppdatert igjen etter dette (se
        // docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md).
        deliverables: quoteData?.deliverables ?? [],
        updated_at: signedAt,
        ...(finalContractText !== baseContractText ? { contract_text: finalContractText } : {}),
      })
      .eq('id', contract.id)
```

- [ ] **Step 2: Copy it onto `projects` too**

Find:

```ts
    const { data: updatedProject, error: updateProjectError } = await supabase
      .from('projects')
      .update({
        ...(shouldAdvanceStage ? { pipeline_stage: 'pre_prod' } : {}),
        pipeline_data: { ...existingPipelineData, contract_signed: true, contract_signed_at: signedAt },
        updated_at: signedAt,
      })
      .eq('id', projectId)
      .select('title')
      .maybeSingle()
```

Replace with:

```ts
    const { data: updatedProject, error: updateProjectError } = await supabase
      .from('projects')
      .update({
        ...(shouldAdvanceStage ? { pipeline_stage: 'pre_prod' } : {}),
        pipeline_data: { ...existingPipelineData, contract_signed: true, contract_signed_at: signedAt },
        // Levende kopi av siste signerte leveranseliste — dette er hva
        // post-prod og resten av systemet leser fra, ikke
        // contracts.deliverables (den uforanderlige historikken).
        deliverables: quoteData?.deliverables ?? [],
        updated_at: signedAt,
      })
      .eq('id', projectId)
      .select('title')
      .maybeSingle()
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Verify the write logic in isolation (no real sign flow)**

This endpoint sends real customer/team emails and generates a PDF on success — don't hit it directly with a scripted fake request. Instead verify just the two update statements' *shape* against a disposable project, mimicking exactly what the route now does. This is a live production database — do **not** grab an arbitrary real project (no `.limit(1)` on the whole table); target a specific project id you know is safe to touch (a test/internal project, e.g. the "Innhold nettside" project already used earlier as scratch space, id `3a790512-eb8a-4296-9c70-7022f6be30d1` — verify it's still a safe non-customer-critical target before reusing it, or substitute a project you've created for this purpose), and revert immediately after reading back:

```js
// /tmp/verify-freeze.js
const { createClient } = require("@supabase/supabase-js")
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const TEST_PROJECT_ID = "3a790512-eb8a-4296-9c70-7022f6be30d1" // known safe scratch project — confirm before running
  const { data: project } = await sb.from("projects").select("id").eq("id", TEST_PROJECT_ID).single()
  const testDeliverables = [{ id: "t1", type: "video", name: "Hovedfilm" }, { id: "t2", type: "video", name: "Reel" }]

  const { error: projErr } = await sb.from("projects").update({ deliverables: testDeliverables }).eq("id", project.id)
  console.log("project update error:", projErr)
  const { data: readBack } = await sb.from("projects").select("deliverables").eq("id", project.id).single()
  console.log("read back:", readBack.deliverables)

  // revert — this was a disposable write against a real project
  await sb.from("projects").update({ deliverables: null }).eq("id", project.id)
})()
```

Run: `export $(grep -E "^NEXT_PUBLIC_SUPABASE_URL|^SUPABASE_SERVICE_ROLE_KEY" .env.local | xargs) && node /tmp/verify-freeze.js`
Expected: no error, `read back` prints the two-item array. This confirms the `deliverables` column round-trips correctly through Supabase's JSONB handling — the actual sign-route code path (Task 10 covers full end-to-end with a real signed contract).

- [ ] **Step 5: Commit**

```bash
git add "app/api/contracts/sign/route.ts"
git commit -m "feat: freeze deliverables list onto contracts and projects at signing"
```

---

### Task 5: `getPostProdBoard` — shared/tabs for video

**Files:**
- Modify: `lib/actions/pipeline.ts`

**Interfaces:**
- Consumes: `DeliverableItem` from `@/lib/types`; `projects.deliverables` (Task 1/4); existing `shouldMaterializeDefaults`/`materializeDefaultLane`/`SequenceRow` helpers already in this file.
- Produces: `VideoDeliverableTab` (`{ id: string; name: string; lane: PostProdBoardLane }`), `PostProdBoard.videoShared: PostProdBoardLane | null`, `PostProdBoard.videoTabs: VideoDeliverableTab[] | null` — Task 7/8 (client components) consume these two new fields; `PostProdBoard.lanes` no longer contains a `'video'`-kind entry when `videoTabs` is non-null (it does, unchanged, when 0-1 video deliverables).

- [ ] **Step 1: Import `DeliverableItem`**

Find:

```ts
import type { PipelineStage, ProjectType, Task, TaskMessage, ProjectWithPipeline, Quote, PipelineData, SectionContent, AssigneeJoin, TaskRow, ProjectRow } from '@/lib/types'
```

Replace with:

```ts
import type { PipelineStage, ProjectType, Task, TaskMessage, ProjectWithPipeline, Quote, PipelineData, SectionContent, AssigneeJoin, TaskRow, ProjectRow, DeliverableItem } from '@/lib/types'
```

- [ ] **Step 2: Extend the board types**

Find:

```ts
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
```

Replace with:

```ts
export type PostProdBoardLane = {
  kind: 'video' | 'photo' | 'custom'
  laneId: string | null
  name: string
  color: string | null
  deadline: string | null
  cards: PostProdBoardCard[]
}

// Én per video i projects.deliverables, kun bygget når det er 2+ videoer —
// se PostProdBoard.videoTabs. lane.laneId er alltid null her (id-en for
// dra-og-slipp-ruting er tab.id, ikke lane.laneId — se laneIdToDestination
// i PostProdBoard.tsx).
export type VideoDeliverableTab = {
  id: string
  name: string
  lane: PostProdBoardLane
}

export type PostProdBoard = {
  projectType: ProjectType | null
  lanes: PostProdBoardLane[]
  // Ikke-null kun når prosjektet har 2+ video-leveranser — da inneholder
  // `lanes` IKKE lenger noen 'video'-kind lane (den er erstattet av disse to).
  videoShared: PostProdBoardLane | null
  videoTabs: VideoDeliverableTab[] | null
  parallel: PostProdBoardCard[]
}

type BoardTaskRow = {
  id: string
  title: string
  description: string | null
  sub_type: 'video' | 'photo' | null
  deliverable_id: string | null
  custom_lane_id: string | null
  is_parallel: boolean
  color: string | null
  icon: string | null
  due_date: string | null
  task_assignees: { profile: { id: string; name: string | null; email: string } | null }[]
}
```

- [ ] **Step 3: Add `ensureVideoDeliverablesSeeded`**

Find (the function directly above `getPostProdBoard`):

```ts
async function materializeDefaultLane(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  dbSubType: 'video' | 'photo' | null,
  templateProjectType: ProjectType
): Promise<void> {
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
      sub_type: dbSubType,
      custom_lane_id: null,
      is_parallel: false,
      is_custom: false,
      created_by: null,
      due_date: null,
      priority: null,
    }))
  )
}
```

Replace with the same function, plus the new one appended after it:

```ts
async function materializeDefaultLane(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  dbSubType: 'video' | 'photo' | null,
  templateProjectType: ProjectType
): Promise<void> {
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
      sub_type: dbSubType,
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
 * Seeder video-post-prod for prosjekter med 2+ video-leveranser. Idempotent —
 * trygt å kalle på hver getPostProdBoard-forespørsel:
 * 1. Kort som matcher en `per_deliverable`-mal og fortsatt har
 *    deliverable_id=NULL tilhørte den gamle flate lanen (1 video) — de
 *    reassignes til den FØRSTE leveransen. Kjøres dette igjen senere finnes
 *    ingen slike kort lenger, så UPDATE treffer 0 rader.
 * 2. Delt-seksjonen (`shared`-maler) seedes kun hvis prosjektet aldri har
 *    hatt video-kort i det hele tatt.
 * 3. Hver leveranse uten egne kort ennå (helt ny, eller lagt til i en senere
 *    re-signering) får friskt seedede per-leveranse-steg.
 * Se docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md §3.
 */
async function ensureVideoDeliverablesSeeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  // Typet identisk med dbSubTypeFor()s returtype i getPostProdBoard (ikke bare
  // 'video' | null) — TS narrower ikke dbSubTypeFor('video') sin returtype til
  // undermengden basert på det bokstavelige argumentet, siden funksjonen alltid
  // er deklarert til å returnere hele unionen uansett input.
  videoDbSubType: 'video' | 'photo' | null,
  videoDeliverables: DeliverableItem[]
): Promise<void> {
  const { data: scopedTemplates } = await supabase
    .from('task_templates')
    .select('title, description, default_scope, sort_order')
    .eq('pipeline_stage', 'post_prod')
    .eq('project_type', 'video')
    .order('sort_order', { ascending: true })

  const sharedTemplates = (scopedTemplates ?? []).filter(
    (t: { default_scope: string | null }) => t.default_scope === 'shared'
  )
  const perDeliverableTemplates = (scopedTemplates ?? []).filter(
    (t: { default_scope: string | null }) => t.default_scope === 'per_deliverable'
  )

  let videoTaskQuery = supabase
    .from('tasks')
    .select('id, title, deliverable_id')
    .eq('project_id', projectId)
    .eq('pipeline_stage', 'post_prod')
    .eq('is_custom', false)
    .eq('is_parallel', false)
    .is('custom_lane_id', null)
  videoTaskQuery = videoDbSubType === null
    ? videoTaskQuery.is('sub_type', null)
    : videoTaskQuery.eq('sub_type', videoDbSubType)
  const { data: existingVideoTasks } = await videoTaskQuery

  const perDeliverableTitles = new Set(perDeliverableTemplates.map((t: { title: string }) => t.title))
  const unassigned = (existingVideoTasks ?? []).filter(
    (t: { title: string; deliverable_id: string | null }) =>
      t.deliverable_id === null && perDeliverableTitles.has(t.title)
  )

  if (unassigned.length > 0) {
    const firstId = videoDeliverables[0].id
    await supabase.from('tasks')
      .update({ deliverable_id: firstId })
      .in('id', unassigned.map((t: { id: string }) => t.id))
  }

  if ((existingVideoTasks ?? []).length === 0 && sharedTemplates.length > 0) {
    await supabase.from('tasks').insert(
      sharedTemplates.map((t: { title: string; description: string | null }, i: number) => ({
        project_id: projectId,
        pipeline_stage: 'post_prod',
        title: t.title,
        description: t.description,
        status: 'todo' as const,
        sort_order: i + 1,
        sub_type: videoDbSubType,
        deliverable_id: null,
        custom_lane_id: null,
        is_parallel: false,
        is_custom: false,
        created_by: null,
        due_date: null,
        priority: null,
      }))
    )
  }

  for (const deliverable of videoDeliverables) {
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('deliverable_id', deliverable.id)

    if ((count ?? 0) === 0 && perDeliverableTemplates.length > 0) {
      await supabase.from('tasks').insert(
        perDeliverableTemplates.map((t: { title: string; description: string | null }, i: number) => ({
          project_id: projectId,
          pipeline_stage: 'post_prod',
          title: t.title,
          description: t.description,
          status: 'todo' as const,
          sort_order: i + 1,
          sub_type: videoDbSubType,
          deliverable_id: deliverable.id,
          custom_lane_id: null,
          is_parallel: false,
          is_custom: false,
          created_by: null,
          due_date: null,
          priority: null,
        }))
      )
    }
  }
}
```

- [ ] **Step 4: Rewrite `getPostProdBoard`**

Find the entire function:

```ts
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

    // Ikke-mixed prosjekter lagrer sub_type=null i DB — samme konvensjon som
    // seedTasksFromTemplates/reseedPostProdTasks/getTasksForProject bruker
    // overalt ellers i kodebasen. Kun mixed-prosjekter skiller video/foto via
    // sub_type. 'video'/'photo' i subTypes over er kun en UI-nøkkel for
    // hvilken lane som vises, ikke nødvendigvis den faktiske DB-verdien.
    const dbSubTypeFor = (uiSubType: 'video' | 'photo'): 'video' | 'photo' | null =>
      projectType === 'mixed' ? uiSubType : null

    if (await shouldMaterializeDefaults(supabase, projectId)) {
      await Promise.all(
        subTypes.map(uiSubType =>
          materializeDefaultLane(
            supabase,
            projectId,
            dbSubTypeFor(uiSubType),
            projectType === 'mixed' ? uiSubType : projectType
          )
        )
      )
    }

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

    const rows = (taskRows ?? []) as unknown as BoardTaskRow[]

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

    const builtinLanes: PostProdBoardLane[] = subTypes.map(uiSubType => ({
      kind: uiSubType,
      laneId: null,
      name: uiSubType === 'video' ? 'Video' : 'Foto',
      color: uiSubType === 'video' ? '#C49434' : '#4A9EFF',
      deadline: null,
      cards: rows
        .filter(t => t.sub_type === dbSubTypeFor(uiSubType) && !t.is_parallel && !t.custom_lane_id)
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

Replace with:

```ts
export async function getPostProdBoard(projectId: string): Promise<PostProdBoard> {
  try {
    const supabase = await createClient()

    const { data: proj } = await supabase
      .from('projects')
      .select('project_type, deliverables')
      .eq('id', projectId)
      .single()

    const projectType = (proj?.project_type ?? null) as ProjectType | null
    if (!projectType) return { projectType: null, lanes: [], videoShared: null, videoTabs: null, parallel: [] }

    const deliverables = (proj?.deliverables ?? []) as DeliverableItem[]
    const videoDeliverables = deliverables.filter(d => d.type === 'video')
    const hasVideoTabs = videoDeliverables.length >= 2

    const subTypes: ('video' | 'photo')[] =
      projectType === 'photo' ? ['photo'] : projectType === 'mixed' ? ['video', 'photo'] : ['video']

    // Ikke-mixed prosjekter lagrer sub_type=null i DB — samme konvensjon som
    // seedTasksFromTemplates/reseedPostProdTasks/getTasksForProject bruker
    // overalt ellers i kodebasen. Kun mixed-prosjekter skiller video/foto via
    // sub_type. 'video'/'photo' i subTypes over er kun en UI-nøkkel for
    // hvilken lane som vises, ikke nødvendigvis den faktiske DB-verdien.
    const dbSubTypeFor = (uiSubType: 'video' | 'photo'): 'video' | 'photo' | null =>
      projectType === 'mixed' ? uiSubType : null

    // Når video splittes i faner, seedes den via ensureVideoDeliverablesSeeded
    // under i stedet for her — å inkludere 'video' i denne loopen ville seedet
    // hele video-malsettet en gang til, uavhengig av delt/per-leveranse.
    const materializeSubTypes = hasVideoTabs ? subTypes.filter(t => t !== 'video') : subTypes

    if (materializeSubTypes.length > 0 && await shouldMaterializeDefaults(supabase, projectId)) {
      await Promise.all(
        materializeSubTypes.map(uiSubType =>
          materializeDefaultLane(
            supabase,
            projectId,
            dbSubTypeFor(uiSubType),
            projectType === 'mixed' ? uiSubType : projectType
          )
        )
      )
    }

    if (hasVideoTabs && subTypes.includes('video')) {
      await ensureVideoDeliverablesSeeded(supabase, projectId, dbSubTypeFor('video'), videoDeliverables)
    }

    const [{ data: taskRows }, { data: laneRows }] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, description, sub_type, deliverable_id, custom_lane_id, is_parallel, color, icon, due_date, task_assignees(profile:profiles(id, name, email))')
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

    const rows = (taskRows ?? []) as unknown as BoardTaskRow[]

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

    let videoShared: PostProdBoardLane | null = null
    let videoTabs: VideoDeliverableTab[] | null = null

    const builtinLanes: PostProdBoardLane[] = subTypes
      .filter(t => t !== 'video')
      .map(uiSubType => ({
        kind: uiSubType,
        laneId: null,
        name: uiSubType === 'video' ? 'Video' : 'Foto',
        color: uiSubType === 'video' ? '#C49434' : '#4A9EFF',
        deadline: null,
        cards: rows
          .filter(t => t.sub_type === dbSubTypeFor(uiSubType) && !t.is_parallel && !t.custom_lane_id)
          .map(toCard),
      }))

    if (subTypes.includes('video')) {
      const videoDbSubType = dbSubTypeFor('video')
      const videoRows = rows.filter(t => t.sub_type === videoDbSubType && !t.is_parallel && !t.custom_lane_id)

      if (hasVideoTabs) {
        videoShared = {
          kind: 'video', laneId: null, name: 'Video — Delt', color: '#C49434', deadline: null,
          cards: videoRows.filter(t => t.deliverable_id === null).map(toCard),
        }
        videoTabs = videoDeliverables.map(d => ({
          id: d.id,
          name: d.name,
          lane: {
            kind: 'video', laneId: null, name: d.name, color: '#C49434', deadline: null,
            cards: videoRows.filter(t => t.deliverable_id === d.id).map(toCard),
          },
        }))
      } else {
        builtinLanes.unshift({
          kind: 'video', laneId: null, name: 'Video', color: '#C49434', deadline: null,
          cards: videoRows.map(toCard),
        })
      }
    }

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

    return { projectType, lanes: [...builtinLanes, ...customLanes], videoShared, videoTabs, parallel }
  } catch (err) {
    console.error('getPostProdBoard error:', err)
    return { projectType: null, lanes: [], videoShared: null, videoTabs: null, parallel: [] }
  }
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: errors in `PostProdBoard.tsx` and `PostProdTaskForm.tsx` (they destructure/pass the old shape) — expected, fixed in Task 7/8. Confirm no errors *inside* `lib/actions/pipeline.ts` itself.

- [ ] **Step 6: Verify 0/1-deliverable case is unchanged (no DB writes needed)**

```js
// /tmp/verify-board-flat.js
const { createClient } = require("@supabase/supabase-js")
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data: projects } = await sb.from("projects").select("id, title, project_type, deliverables").not("project_type", "is", null).limit(5)
  console.log(projects)
})()
```

Run it, pick one project id with `project_type` set and `deliverables` null/empty, then in a Node REPL or small script `require`-import is not possible for a `'use server'` file directly — instead verify through the running app: open `/admin/preprod/<that project id>` in the browser (dev server running), confirm the post-prod board renders exactly as before (single Video/Foto lane, no tabs, no "Delt" heading). This is the regression check for the overwhelming majority of existing projects.

- [ ] **Step 7: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: branch getPostProdBoard into shared+tabs for 2+ video deliverables"
```

---

### Task 6: Destination routing — `video_deliverable`

**Files:**
- Modify: `lib/actions/pipeline.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PostProdDestination` gains `{ kind: 'video_deliverable'; deliverableId: string }` — Task 7/8 construct and pass this variant.

- [ ] **Step 1: Extend `PostProdDestination`**

Find:

```ts
export type PostProdDestination =
  | { kind: 'video' }
  | { kind: 'photo' }
  | { kind: 'custom'; laneId: string }
  | { kind: 'parallel' }
```

Replace with:

```ts
export type PostProdDestination =
  | { kind: 'video' }
  | { kind: 'video_deliverable'; deliverableId: string }
  | { kind: 'photo' }
  | { kind: 'custom'; laneId: string }
  | { kind: 'parallel' }
```

- [ ] **Step 2: Update `addPostProdBoardTask`**

Find:

```ts
    let dbSubType: 'video' | 'photo' | null = null
    if (input.destination.kind === 'video' || input.destination.kind === 'photo') {
      const { data: destProj } = await supabase
        .from('projects')
        .select('project_type')
        .eq('id', input.projectId)
        .single()
      dbSubType = destProj?.project_type === 'mixed' ? input.destination.kind : null
    }
```

Replace with:

```ts
    let dbSubType: 'video' | 'photo' | null = null
    if (input.destination.kind === 'video' || input.destination.kind === 'video_deliverable' || input.destination.kind === 'photo') {
      const { data: destProj } = await supabase
        .from('projects')
        .select('project_type')
        .eq('id', input.projectId)
        .single()
      const uiKind = input.destination.kind === 'video_deliverable' ? 'video' : input.destination.kind
      dbSubType = destProj?.project_type === 'mixed' ? uiKind : null
    }
```

Find:

```ts
    } else {
      const subType = input.destination.kind === 'custom' ? null : dbSubType
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
        : subType === null
          ? existingQuery.is('sub_type', null).is('custom_lane_id', null)
          : existingQuery.eq('sub_type', subType).is('custom_lane_id', null)

      const { data: existingRows, error: existingError } = await existingQuery
```

Replace with:

```ts
    } else {
      const subType = input.destination.kind === 'custom' ? null : dbSubType
      const customLaneId = input.destination.kind === 'custom' ? input.destination.laneId : null
      const deliverableId = input.destination.kind === 'video_deliverable' ? input.destination.deliverableId : null

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
        : subType === null
          ? existingQuery.is('sub_type', null).is('custom_lane_id', null)
          : existingQuery.eq('sub_type', subType).is('custom_lane_id', null)

      existingQuery = deliverableId === null
        ? existingQuery.is('deliverable_id', null)
        : existingQuery.eq('deliverable_id', deliverableId)

      const { data: existingRows, error: existingError } = await existingQuery
```

Find the insert inside the `for (const row of merged)` loop:

```ts
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
```

Replace with:

```ts
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
              deliverable_id: deliverableId,
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
```

Find the library-save block:

```ts
      const { error: libraryError } = await supabase.from('post_prod_task_library').insert({
        created_by: user.id,
        title: input.title,
        description: input.description ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        lane_type: input.destination.kind,
        custom_lane_name: customLaneName,
      })
```

Replace with:

```ts
      // 'video_deliverable' finnes ikke i post_prod_task_library.lane_type sin
      // CHECK-constraint (kun 'video'|'photo'|'custom'|'parallel') — biblioteket
      // er prosjekt-uavhengig, så «hvilken navngitt video» gir ingen mening der.
      const libraryLaneType = input.destination.kind === 'video_deliverable' ? 'video' : input.destination.kind
      const { error: libraryError } = await supabase.from('post_prod_task_library').insert({
        created_by: user.id,
        title: input.title,
        description: input.description ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        lane_type: libraryLaneType,
        custom_lane_name: customLaneName,
      })
```

- [ ] **Step 3: Update `moveBoardTask`**

Find:

```ts
    let dbSubType: 'video' | 'photo' | null = null
    if (destination.kind === 'video' || destination.kind === 'photo') {
      const { data: destProj } = await supabase
        .from('projects')
        .select('project_type')
        .eq('id', task.project_id)
        .single()
      dbSubType = destProj?.project_type === 'mixed' ? destination.kind : null
    }

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
      : dbSubType === null
        ? destQuery.is('sub_type', null).is('custom_lane_id', null)
        : destQuery.eq('sub_type', dbSubType).is('custom_lane_id', null)

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
        patch.sub_type = destination.kind === 'custom' ? null : dbSubType
      }
      const { error } = await supabase.from('tasks').update(patch).eq('id', finalIds[i])
      if (error) return { ok: false, error: 'Kunne ikke oppdatere rekkefølgen' }
    }
```

Replace with:

```ts
    let dbSubType: 'video' | 'photo' | null = null
    if (destination.kind === 'video' || destination.kind === 'video_deliverable' || destination.kind === 'photo') {
      const { data: destProj } = await supabase
        .from('projects')
        .select('project_type')
        .eq('id', task.project_id)
        .single()
      const uiKind = destination.kind === 'video_deliverable' ? 'video' : destination.kind
      dbSubType = destProj?.project_type === 'mixed' ? uiKind : null
    }

    if (destination.kind === 'parallel') {
      const { error } = await supabase
        .from('tasks')
        .update({ is_parallel: true, sub_type: null, custom_lane_id: null, deliverable_id: null, sort_order: 0 })
        .eq('id', taskId)

      if (error) return { ok: false, error: 'Kunne ikke flytte oppgaven' }
      revalidatePath('/admin/preprod')
      revalidatePath('/admin/postprod')
      return { ok: true }
    }

    const deliverableId = destination.kind === 'video_deliverable' ? destination.deliverableId : null

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
      : dbSubType === null
        ? destQuery.is('sub_type', null).is('custom_lane_id', null)
        : destQuery.eq('sub_type', dbSubType).is('custom_lane_id', null)

    destQuery = deliverableId === null
      ? destQuery.is('deliverable_id', null)
      : destQuery.eq('deliverable_id', deliverableId)

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
        patch.sub_type = destination.kind === 'custom' ? null : dbSubType
        patch.deliverable_id = deliverableId
      }
      const { error } = await supabase.from('tasks').update(patch).eq('id', finalIds[i])
      if (error) return { ok: false, error: 'Kunne ikke oppdatere rekkefølgen' }
    }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: same pre-existing `PostProdBoard.tsx`/`PostProdTaskForm.tsx` errors as Task 5 (not yet fixed), no new errors elsewhere.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: support video_deliverable destination in board task actions"
```

---

### Task 7: `PostProdBoard.tsx` — tabs UI

**Files:**
- Modify: `app/admin/preprod/[id]/PostProdBoard.tsx`

**Interfaces:**
- Consumes: `board.videoShared`, `board.videoTabs` (Task 5); `{ kind: 'video_deliverable', deliverableId }` (Task 6).
- Produces: passes `videoShared`/`videoTabs` through to `PostProdTaskForm` (Task 8).

- [ ] **Step 1: Import the new type**

Find:

```ts
import {
  getPostProdBoard, addTaskToLibrary, deleteTask, toggleTaskAssignee, getAllProfiles, getTaskMessageCounts,
  createCustomLane, updateLaneDeadline, moveBoardTask, getTaskLibrary, addPostProdBoardTask,
  type PostProdBoard as PostProdBoardData, type PostProdBoardCard, type PostProdBoardLane, type PostProdDestination,
} from '@/lib/actions/pipeline'
```

Replace with:

```ts
import {
  getPostProdBoard, addTaskToLibrary, deleteTask, toggleTaskAssignee, getAllProfiles, getTaskMessageCounts,
  createCustomLane, updateLaneDeadline, moveBoardTask, getTaskLibrary, addPostProdBoardTask,
  type PostProdBoard as PostProdBoardData, type PostProdBoardCard, type PostProdBoardLane, type PostProdDestination,
  type VideoDeliverableTab,
} from '@/lib/actions/pipeline'
```

- [ ] **Step 2: Add tab-selection state**

Find:

```ts
  const [board, setBoard] = useState<PostProdBoardData>({ projectType: null, lanes: [], parallel: [] })
```

Replace with:

```ts
  const [board, setBoard] = useState<PostProdBoardData>({ projectType: null, lanes: [], videoShared: null, videoTabs: null, parallel: [] })
  const [activeVideoTabId, setActiveVideoTabId] = useState<string | null>(null)
```

Find (the click-outside effect for the assignee picker, to anchor a new effect right after it):

```ts
  useEffect(() => {
    if (!openAssigneeFor) return
    function handleClickOutside(e: MouseEvent) {
      if (assigneePickerRef.current && !assigneePickerRef.current.contains(e.target as Node)) {
        setOpenAssigneeFor(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openAssigneeFor])
```

Replace with the same block plus a new effect appended right after:

```ts
  useEffect(() => {
    if (!openAssigneeFor) return
    function handleClickOutside(e: MouseEvent) {
      if (assigneePickerRef.current && !assigneePickerRef.current.contains(e.target as Node)) {
        setOpenAssigneeFor(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openAssigneeFor])

  // Default til første fane når fanelisten endres og ingen gyldig fane er valgt.
  useEffect(() => {
    if (!board.videoTabs || board.videoTabs.length === 0) { setActiveVideoTabId(null); return }
    if (!board.videoTabs.some(t => t.id === activeVideoTabId)) setActiveVideoTabId(board.videoTabs[0].id)
  }, [board.videoTabs, activeVideoTabId])
```

- [ ] **Step 3: Update `laneIdToDestination` and `findContainerId`**

Find:

```ts
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
```

Replace with:

```ts
  function laneIdToDestination(laneKey: string): PostProdDestination | null {
    if (laneKey === 'parallel') return { kind: 'parallel' }
    if (laneKey === 'video') return { kind: 'video' }
    if (laneKey === 'photo') return { kind: 'photo' }
    if (laneKey.startsWith('video-tab:')) return { kind: 'video_deliverable', deliverableId: laneKey.slice('video-tab:'.length) }
    return { kind: 'custom', laneId: laneKey }
  }

  function findContainerId(cardId: string): string | null {
    if (board.parallel.some(c => c.id === cardId)) return 'parallel'
    if (board.videoShared?.cards.some(c => c.id === cardId)) return 'video'
    for (const tab of board.videoTabs ?? []) {
      if (tab.lane.cards.some(c => c.id === cardId)) return `video-tab:${tab.id}`
    }
    for (const lane of board.lanes) {
      if (lane.cards.some(c => c.id === cardId)) return lane.laneId ?? lane.kind
    }
    return null
  }
```

- [ ] **Step 4: Factor lane rendering into `renderLaneBlock`, add the tabs JSX**

Find:

```tsx
  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
        Post-produksjon
      </p>

      <div>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent, marginBottom: 6 }}>
          Parallelt gjennom hele post-produksjonen
        </p>
        <SortableContext items={board.parallel.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <DroppableLane id="parallel">
            {board.parallel.map(renderCard)}
          </DroppableLane>
        </SortableContext>
      </div>

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
          <SortableContext items={lane.cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
            <DroppableLane id={lane.laneId ?? lane.kind}>
              {lane.cards.map(renderCard)}
            </DroppableLane>
          </SortableContext>
        </div>
      ))}
```

Replace with:

```tsx
  // Delt av board.lanes-loopen under OG av videoShared/faner — én kilde til
  // sannhet for lane-header + dra-og-slipp-container. droppableId er eksplisitt
  // (ikke lane.laneId ?? lane.kind) fordi hver fane bruker samme lane.kind='video'
  // men trenger sin egen unike drop-container-id (video-tab:<deliverableId>).
  function renderLaneBlock(lane: PostProdBoardLane, droppableId: string) {
    return (
      <div key={droppableId}>
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
        <SortableContext items={lane.cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <DroppableLane id={droppableId}>
            {lane.cards.map(renderCard)}
          </DroppableLane>
        </SortableContext>
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
        Post-produksjon
      </p>

      <div>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent, marginBottom: 6 }}>
          Parallelt gjennom hele post-produksjonen
        </p>
        <SortableContext items={board.parallel.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <DroppableLane id="parallel">
            {board.parallel.map(renderCard)}
          </DroppableLane>
        </SortableContext>
      </div>

      {board.videoTabs && board.videoTabs.length > 0 && (
        <>
          {board.videoShared && renderLaneBlock(board.videoShared, 'video')}

          <div>
            <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 10 }}>
              {board.videoTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveVideoTabId(tab.id)}
                  style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600,
                    padding: '7px 14px', background: 'none', border: 'none', cursor: 'pointer',
                    color: activeVideoTabId === tab.id ? C.accent : C.text3,
                    borderBottom: activeVideoTabId === tab.id ? `2px solid ${C.accent}` : '2px solid transparent',
                  }}
                >
                  {tab.name}
                </button>
              ))}
            </div>
            {board.videoTabs
              .filter(tab => tab.id === activeVideoTabId)
              .map(tab => <div key={tab.id}>{renderLaneBlock(tab.lane, `video-tab:${tab.id}`)}</div>)}
          </div>
        </>
      )}

      {board.lanes.map(lane => renderLaneBlock(lane, lane.laneId ?? lane.kind))}
```

- [ ] **Step 5: Pass the new props to `PostProdTaskForm`**

Find:

```tsx
      <PostProdTaskForm projectId={projectId} lanes={board.lanes} profiles={profiles} onAdded={refetch} />
```

Replace with:

```tsx
      <PostProdTaskForm
        projectId={projectId}
        lanes={board.lanes}
        videoShared={board.videoShared}
        videoTabs={board.videoTabs}
        profiles={profiles}
        onAdded={refetch}
      />
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: an error in `PostProdTaskForm.tsx` (doesn't accept `videoShared`/`videoTabs` props yet — fixed in Task 8). No errors in `PostProdBoard.tsx` itself.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/preprod/[id]/PostProdBoard.tsx"
git commit -m "feat: render video Delt-section and tabs in post-prod board"
```

---

### Task 8: `PostProdTaskForm.tsx` — destination options

**Files:**
- Modify: `app/admin/preprod/[id]/PostProdTaskForm.tsx`

**Interfaces:**
- Consumes: `VideoDeliverableTab` from `@/lib/actions/pipeline` (Task 5); `board.videoShared`/`board.videoTabs` (Task 7).
- Produces: nothing new consumed elsewhere — this is the leaf of the chain.

- [ ] **Step 1: Import the type and accept the new props**

Find:

```tsx
import { addPostProdBoardTask, type PostProdDestination } from '@/lib/actions/pipeline'
import type { PostProdBoardLane } from '@/lib/actions/pipeline'
```

Replace with:

```tsx
import { addPostProdBoardTask, type PostProdDestination } from '@/lib/actions/pipeline'
import type { PostProdBoardLane, VideoDeliverableTab } from '@/lib/actions/pipeline'
```

Find:

```tsx
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
```

Replace with:

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
  const videoOptions: DestinationOption[] = videoTabs && videoTabs.length > 0
    ? [
        ...(videoShared ? [{ key: 'video', label: videoShared.name, destination: { kind: 'video' as const } }] : []),
        ...videoTabs.map(tab => ({
          key: `video-tab:${tab.id}`,
          label: `Video — ${tab.name}`,
          destination: { kind: 'video_deliverable' as const, deliverableId: tab.id },
        })),
      ]
    : []

  const options: DestinationOption[] = [
    ...videoOptions,
    ...lanes.map(lane => ({
      key: lane.laneId ?? lane.kind,
      label: lane.name,
      destination: (lane.kind === 'custom'
        ? { kind: 'custom' as const, laneId: lane.laneId as string }
        : { kind: lane.kind as 'video' | 'photo' }),
    })),
    { key: 'parallel', label: 'Parallell (hele post-produksjonen)', destination: { kind: 'parallel' as const } },
  ]
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors anywhere in the project.

- [ ] **Step 3: Manual verification**

With the dev server running, open a project's post-prod page whose `project_type` includes video and which has 0-1 deliverables set — confirm the "+ Legg til i post-produksjon" dropdown looks exactly as before (no extra "Video — ..." options).

- [ ] **Step 4: Commit**

```bash
git add "app/admin/preprod/[id]/PostProdTaskForm.tsx"
git commit -m "feat: add video Delt/tab destinations to post-prod add-task form"
```

---

### Task 9: End-to-end verification with a real 2-video project

**Files:**
- None (verification only — no code changes).

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: confidence the full chain works before calling this done.

- [ ] **Step 1: Set up a test project with 2 video deliverables**

This is a live production database — do not grab an arbitrary real project (no `.limit(1)` on the whole table). Either reuse a known scratch project you also control (e.g. the "Innhold nettside" project used earlier in this work, id `3a790512-eb8a-4296-9c70-7022f6be30d1` — confirm its `project_type` is `'video'` first, or set it to `'video'` yourself since it's a scratch project) or create a fresh disposable project for this test. Paste that exact id below rather than querying `.limit(1)`:

```js
// /tmp/verify-e2e.js
const { createClient } = require("@supabase/supabase-js")
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const TEST_PROJECT_ID = "<paste a known scratch project id here — do not query .limit(1)>"
  const { data: project } = await sb.from("projects").select("id, title, project_type").eq("id", TEST_PROJECT_ID).single()
  console.log("using project:", project)
  if (project.project_type !== "video") throw new Error("test project must have project_type='video' before running this")

  const deliverables = [
    { id: "e2e-1", type: "video", name: "E2E Hovedfilm" },
    { id: "e2e-2", type: "video", name: "E2E Reel" },
  ]
  await sb.from("projects").update({ deliverables }).eq("id", project.id)
  console.log("set deliverables on project", project.id)
})()
```

Run: `export $(grep -E "^NEXT_PUBLIC_SUPABASE_URL|^SUPABASE_SERVICE_ROLE_KEY" .env.local | xargs) && node /tmp/verify-e2e.js`

- [ ] **Step 2: Load the board and confirm materialization**

Open `/admin/preprod/<project id>` in the browser (start `npm run dev` first if not running). Confirm:
- A "Video — Delt" lane appears with Logging and Ferdig cards.
- A tab bar shows "E2E Hovedfilm" and "E2E Reel".
- Clicking each tab shows Grovklipp/Klipp/Farger/Lyd/Venter på tilbakemelding cards, independently completable per tab (mark one done in one tab, confirm the other tab's identical-titled card is untouched).

- [ ] **Step 3: Confirm drag-and-drop across Delt/tabs**

Drag a card from the "E2E Hovedfilm" tab into the "Video — Delt" section. Reload the page. Confirm the card now appears in Delt, not the tab. Drag it back. Confirm it returns to the tab.

- [ ] **Step 4: Confirm the add-task form targets the right place**

Use "+ Legg til i post-produksjon", pick "Video — E2E Reel" as the destination, add a task named "E2E manual test task". Confirm it appears only in the "E2E Reel" tab, not in Delt or the other tab.

- [ ] **Step 5: Clean up**

```js
// /tmp/cleanup-e2e.js
const { createClient } = require("@supabase/supabase-js")
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const projectId = "<paste the project id from Step 1>"
  await sb.from("tasks").delete().eq("project_id", projectId).in("deliverable_id", ["e2e-1", "e2e-2"])
  await sb.from("tasks").delete().eq("project_id", projectId).eq("title", "E2E manual test task")
  await sb.from("projects").update({ deliverables: null }).eq("id", projectId)
  console.log("cleaned up")
})()
```

Run it, then reload the board and confirm it's back to a single flat Video lane with no leftover E2E cards.

- [ ] **Step 6: Final full typecheck and lint**

```bash
npx tsc --noEmit -p .
npx eslint lib/actions/pipeline.ts "app/admin/preprod/[id]/PostProdBoard.tsx" "app/admin/preprod/[id]/PostProdTaskForm.tsx" components/quote/QuoteBuilder.tsx "app/api/contracts/sign/route.ts" lib/types.ts
```

Expected: no tsc errors, no new eslint errors beyond any pre-existing warnings already in those files.

**Status note (2026-07-28):** while executing this task, live verification against a real project
surfaced a gap not covered by the original plan — see the addendum below (Tasks 10-13). Finish
those before re-attempting this task's steps; Task 13 supersedes the verification flow above with
one that covers both post-prod pages.

---

## Addendum (2026-07-28): `/admin/postprod/[id]` stepper page

See spec §7 (`docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md`) for the
full rationale. Summary: a second page, `app/admin/postprod/[id]/page.tsx`, also shows post-prod
tasks (as a linear "Steg X av N" stepper) and was missed during the original research/planning —
it has no concept of `deliverable_id` and today shows a broken duplicated sequence for 2+-video
projects. Magnus confirmed: give it the same tab treatment as the board.

**Additional Global Constraints for this addendum:**
- `app/admin/postprod/[id]/page.tsx` already has a local type named `DeliverableItem` (pitch-page
  leftover, unrelated) — the import of the new `DeliverableItem` from `@/lib/types` MUST be
  aliased (`SignedDeliverableItem`) to avoid colliding with it.
- `StepItem` (the circle-and-connector renderer) needs no changes — it is already purely
  index/list-based.
- The existing `isMixed`/`activeTab` (video/photo) tab mechanism is untouched and composes with
  the new video-deliverable tabs (nested: video-deliverable tabs only show when `activeTab==='video'`
  for mixed projects, or unconditionally for pure-video projects).

### Task 10: Fix `sort_order` collision in `ensureVideoDeliverablesSeeded`

**Files:**
- Modify: `lib/actions/pipeline.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: seeded video tasks now carry the SAME `sort_order` numbering scheme regardless of
  whether they're shared or per-deliverable (`Logging=1, Grovklipp=2, Klipp=3, Farger=4, Lyd=5,
  Venter på tilbakemelding=6, Ferdig=7`) — Task 12's stepper merge logic depends on this.

- [ ] **Step 1: Use the template's own `sort_order` instead of re-indexing**

Find:

```ts
  if ((existingVideoTasks ?? []).length === 0 && sharedTemplates.length > 0) {
    await supabase.from('tasks').insert(
      sharedTemplates.map((t: { title: string; description: string | null }, i: number) => ({
        project_id: projectId,
        pipeline_stage: 'post_prod',
        title: t.title,
        description: t.description,
        status: 'todo' as const,
        sort_order: i + 1,
        sub_type: videoDbSubType,
        deliverable_id: null,
        custom_lane_id: null,
        is_parallel: false,
        is_custom: false,
        created_by: null,
        due_date: null,
        priority: null,
      }))
    )
  }
```

Replace with:

```ts
  if ((existingVideoTasks ?? []).length === 0 && sharedTemplates.length > 0) {
    await supabase.from('tasks').insert(
      sharedTemplates.map((t: { title: string; description: string | null; sort_order: number }) => ({
        project_id: projectId,
        pipeline_stage: 'post_prod',
        title: t.title,
        description: t.description,
        status: 'todo' as const,
        // Malens EGEN sort_order (ikke indeksbasert i+1) — slik at delt og
        // per-leveranse-steg deler samme 1..7-nummerering og kan slås sammen til én
        // virtuell sekvens i stepper-siden (app/admin/postprod/[id]/page.tsx). Se
        // docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md §7.1.
        sort_order: t.sort_order,
        sub_type: videoDbSubType,
        deliverable_id: null,
        custom_lane_id: null,
        is_parallel: false,
        is_custom: false,
        created_by: null,
        due_date: null,
        priority: null,
      }))
    )
  }
```

- [ ] **Step 2: Same fix for the per-deliverable insert**

Find:

```ts
    if ((count ?? 0) === 0 && perDeliverableTemplates.length > 0) {
      await supabase.from('tasks').insert(
        perDeliverableTemplates.map((t: { title: string; description: string | null }, i: number) => ({
          project_id: projectId,
          pipeline_stage: 'post_prod',
          title: t.title,
          description: t.description,
          status: 'todo' as const,
          sort_order: i + 1,
          sub_type: videoDbSubType,
          deliverable_id: deliverable.id,
          custom_lane_id: null,
          is_parallel: false,
          is_custom: false,
          created_by: null,
          due_date: null,
          priority: null,
        }))
      )
    }
```

Replace with:

```ts
    if ((count ?? 0) === 0 && perDeliverableTemplates.length > 0) {
      await supabase.from('tasks').insert(
        perDeliverableTemplates.map((t: { title: string; description: string | null; sort_order: number }) => ({
          project_id: projectId,
          pipeline_stage: 'post_prod',
          title: t.title,
          description: t.description,
          status: 'todo' as const,
          sort_order: t.sort_order,
          sub_type: videoDbSubType,
          deliverable_id: deliverable.id,
          custom_lane_id: null,
          is_parallel: false,
          is_custom: false,
          created_by: null,
          due_date: null,
          priority: null,
        }))
      )
    }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Verify against a fresh seed**

The existing test project (`55c576d8-2735-4fd8-b81c-95c760872617`, if still present) has task rows
seeded under the OLD buggy logic. Delete its post-prod tasks so the next board load reseeds with
the fix:

```js
// /tmp/verify-sort-order-fix.js
const { createClient } = require("@supabase/supabase-js")
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const projectId = "55c576d8-2735-4fd8-b81c-95c760872617"
  const { count } = await sb.from("tasks").delete({ count: "exact" }).eq("project_id", projectId)
  console.log("cleared", count, "old task rows")
})()
```

Run: `export $(grep -E "^NEXT_PUBLIC_SUPABASE_URL|^SUPABASE_SERVICE_ROLE_KEY" .env.local | xargs) && node /tmp/verify-sort-order-fix.js`

Then, with a dev server running (`npm run dev -- -p 3300`), the NEXT `getPostProdBoard` call for
this project will reseed. Verify with a direct query afterward:

```js
// /tmp/verify-sort-order-fix-2.js
const { createClient } = require("@supabase/supabase-js")
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const projectId = "55c576d8-2735-4fd8-b81c-95c760872617"
  const { data } = await sb.from("tasks").select("title, sort_order, deliverable_id").eq("project_id", projectId).eq("pipeline_stage", "post_prod").order("sort_order")
  console.log(data)
})()
```

Expected: `Logging` sort_order 1 (deliverable_id null), `Ferdig` sort_order 7 (deliverable_id null),
and for EACH deliverable: `Grovklipp`=2, `Klipp`=3, `Farger`=4, `Lyd`=5,
`Venter på tilbakemelding`=6 — i.e. sort_order values 2-6 appear TWICE (once per deliverable) but
`1` and `7` appear only for the shared rows. (You'll need to actually load the board/stepper page
once, or call `getPostProdBoard` indirectly, to trigger reseeding — deleting rows alone doesn't
reseed them.)

- [ ] **Step 5: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "fix: use template sort_order instead of per-bucket reindex in video deliverable seeding"
```

---

### Task 11: `Task.deliverable_id` type + scope reset/reject by deliverable

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/actions/pipeline.ts`

**Interfaces:**
- Produces: `Task.deliverable_id: string | null` — Task 12 (stepper page) reads this field.
  `resetTaskAndSubsequent`/`rejectFeedbackAndReset` no longer cross-contaminate between video
  deliverables when going back or rejecting feedback on one deliverable's task.

- [ ] **Step 1: Add the field to `Task`**

Find:

```ts
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
```

Replace with:

```ts
export type Task = {
  id: string
  project_id: string
  pipeline_stage: PipelineStage
  title: string
  description: string | null
  notes: string | null
  task_data: Record<string, string> | null
  sub_type: 'video' | 'photo' | null
  /** Matcher en DeliverableItem.id fra projects.deliverables — NULL for delte steg (Logging/Ferdig) og for prosjekter med 0-1 video-leveranse. */
  deliverable_id: string | null
  custom_lane_id: string | null
```

- [ ] **Step 2: Scope `resetTaskAndSubsequent` by deliverable**

Find:

```ts
export async function resetTaskAndSubsequent(
  projectId: string,
  taskId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('sort_order, sub_type')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return { ok: false, error: 'Fant ikke oppgaven' }
    }

    let query = supabase
      .from('tasks')
      .update({ status: 'todo', updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'post_prod')
      .gte('sort_order', task.sort_order)

    query = task.sub_type
      ? query.eq('sub_type', task.sub_type)
      : query.is('sub_type', null)

    const { error } = await query
```

Replace with:

```ts
export async function resetTaskAndSubsequent(
  projectId: string,
  taskId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('sort_order, sub_type, deliverable_id')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return { ok: false, error: 'Fant ikke oppgaven' }
    }

    let query = supabase
      .from('tasks')
      .update({ status: 'todo', updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'post_prod')
      .gte('sort_order', task.sort_order)

    query = task.sub_type
      ? query.eq('sub_type', task.sub_type)
      : query.is('sub_type', null)

    // Et delt steg (deliverable_id=NULL, f.eks. Logging) nullstiller alle leveranser — et
    // per-leveranse-steg nullstiller kun samme leveranse pluss delte steg som Ferdig (den
    // er ikke lenger ferdig hvis ett steg i én leveranse går tilbake), aldri andre
    // leveransers oppgaver. Se docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md §7.3.
    if (task.deliverable_id) {
      query = query.or(`deliverable_id.eq.${task.deliverable_id},deliverable_id.is.null`)
    }

    const { error } = await query
```

- [ ] **Step 3: Scope `rejectFeedbackAndReset` by deliverable**

Find:

```ts
export async function rejectFeedbackAndReset(
  projectId: string,
  venterTaskId: string,
  rejectionNote: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: venterTask, error: venterError } = await supabase
      .from('tasks')
      .select('sort_order, sub_type')
      .eq('id', venterTaskId)
      .single()

    if (venterError || !venterTask) {
      return { ok: false, error: 'Fant ikke oppgaven' }
    }

    // Lagre begrunnelsesnotatet på Venter-tasken
    await supabase
      .from('tasks')
      .update({ notes: rejectionNote, updated_at: new Date().toISOString() })
      .eq('id', venterTaskId)

    // Tilbakestill alt fra sort_order 2 og frem til og med Venter til 'todo'
    // Filtrerer på sub_type slik at kun riktig flyt nullstilles i mixed-prosjekter
    let resetQuery = supabase
      .from('tasks')
      .update({ status: 'todo', updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'post_prod')
      .gt('sort_order', 1)
      .lte('sort_order', venterTask.sort_order)

    resetQuery = venterTask.sub_type
      ? resetQuery.eq('sub_type', venterTask.sub_type)
      : resetQuery.is('sub_type', null)

    const { error: resetError } = await resetQuery
```

Replace with:

```ts
export async function rejectFeedbackAndReset(
  projectId: string,
  venterTaskId: string,
  rejectionNote: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: venterTask, error: venterError } = await supabase
      .from('tasks')
      .select('sort_order, sub_type, deliverable_id')
      .eq('id', venterTaskId)
      .single()

    if (venterError || !venterTask) {
      return { ok: false, error: 'Fant ikke oppgaven' }
    }

    // Lagre begrunnelsesnotatet på Venter-tasken
    await supabase
      .from('tasks')
      .update({ notes: rejectionNote, updated_at: new Date().toISOString() })
      .eq('id', venterTaskId)

    // Tilbakestill alt fra sort_order 2 og frem til og med Venter til 'todo'
    // Filtrerer på sub_type slik at kun riktig flyt nullstilles i mixed-prosjekter
    let resetQuery = supabase
      .from('tasks')
      .update({ status: 'todo', updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'post_prod')
      .gt('sort_order', 1)
      .lte('sort_order', venterTask.sort_order)

    resetQuery = venterTask.sub_type
      ? resetQuery.eq('sub_type', venterTask.sub_type)
      : resetQuery.is('sub_type', null)

    // Samme leveranse-skopering som resetTaskAndSubsequent over.
    if (venterTask.deliverable_id) {
      resetQuery = resetQuery.or(`deliverable_id.eq.${venterTask.deliverable_id},deliverable_id.is.null`)
    }

    const { error: resetError } = await resetQuery
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: new errors in `app/admin/postprod/[id]/page.tsx`'s `StepItem`/`Task`-typed code are NOT
expected here (the added field is optional-safe, nothing reads it yet) — confirm no errors
anywhere. If any appear in files that spread/construct `Task` objects manually (not from a DB
row), add `deliverable_id: null` to satisfy the type — search first: `grep -rn "): Task =>" app lib`
and check each result.

- [ ] **Step 5: Verify the query logic against real data**

```js
// /tmp/verify-reset-scoping.js
const { createClient } = require("@supabase/supabase-js")
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const projectId = "55c576d8-2735-4fd8-b81c-95c760872617" // reseeded by Task 10 step 4
  const { data: farger } = await sb.from("tasks").select("id, deliverable_id, sort_order").eq("project_id", projectId).eq("title", "Farger").eq("deliverable_id", "e2e-1").single()
  console.log("Farger (e2e-1):", farger)

  // Mark it done, then reset it, and confirm ONLY e2e-1's later steps + shared Ferdig reset —
  // e2e-2 must be untouched.
  await sb.from("tasks").update({ status: "done" }).eq("project_id", projectId).eq("deliverable_id", "e2e-2").in("title", ["Grovklipp", "Klipp", "Farger"])
  const before = await sb.from("tasks").select("title, deliverable_id, status").eq("project_id", projectId).order("sort_order")
  console.log("before reset:", before.data)
})()
```

Run it, note the "before reset" output (e2e-2's Grovklipp/Klipp/Farger should show `status: 'done'`),
then call `resetTaskAndSubsequent(projectId, farger.id)` — easiest via a one-off script that
imports is not possible for a `'use server'` file directly, so instead trigger it through the
running app (open the stepper page, select e2e-1's Farger step, click "Gå tilbake") once Task 12
is done — for now, just confirm this SQL-equivalent manually:

```js
// /tmp/verify-reset-scoping-2.js — run this to directly exercise the same query the function builds
const { createClient } = require("@supabase/supabase-js")
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const projectId = "55c576d8-2735-4fd8-b81c-95c760872617"
  const { data: farger } = await sb.from("tasks").select("sort_order, sub_type, deliverable_id").eq("project_id", projectId).eq("title", "Farger").eq("deliverable_id", "e2e-1").single()
  let query = sb.from("tasks").update({ status: "todo" }).eq("project_id", projectId).eq("pipeline_stage", "post_prod").gte("sort_order", farger.sort_order).is("sub_type", null)
  if (farger.deliverable_id) query = query.or(`deliverable_id.eq.${farger.deliverable_id},deliverable_id.is.null`)
  const { error, count } = await query.select("*", { count: "exact" })
  console.log("reset error:", error, "rows affected:", count)
  const after = await sb.from("tasks").select("title, deliverable_id, status").eq("project_id", projectId).order("sort_order")
  console.log("after reset:", after.data)
})()
```

Expected: e2e-1's Farger/Lyd/Venter på tilbakemelding go back to `todo`, shared `Ferdig` goes back
to `todo`, but e2e-2's Grovklipp/Klipp/Farger STAY `done` (untouched).

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/actions/pipeline.ts
git commit -m "fix: scope task reset/reject actions by deliverable_id to prevent cross-video contamination"
```

---

### Task 12: Stepper page — video-deliverable tabs

**Files:**
- Modify: `app/admin/postprod/[id]/page.tsx`

**Interfaces:**
- Consumes: `Task.deliverable_id` (Task 11), `Project.deliverables` (already present from the main
  plan's Task 2 — `ProjectWithPipeline` extends `Project`).
- Produces: nothing consumed elsewhere — this is the leaf of the addendum chain (Task 13 verifies it).

This is one task despite its size because every edit below is part of the same interdependent
change — a partial application would leave the page in a broken intermediate state (e.g. new state
without the render that uses it, or the render without the state).

- [ ] **Step 1: Alias the `DeliverableItem` import**

Find:

```ts
import type { ProjectType, Task, ProjectWithPipeline } from '@/lib/types'
```

Replace with:

```ts
import type { ProjectType, Task, ProjectWithPipeline, DeliverableItem as SignedDeliverableItem } from '@/lib/types'
```

- [ ] **Step 2: Add the reusable display-tasks helper**

Find (the end of the `StepItem` component, right before the page component):

```ts
      <span style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem',
        fontWeight: isSelected ? 600 : 400,
        color: isSelected ? (isDone ? C.success : isActive ? C.accent : C.text2) : (isDone ? C.success : C.text3),
        whiteSpace: 'nowrap', maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
      }}>
        {task.title}
      </span>
    </button>
  )
}

export default function PostProdDetailPage() {
```

Replace with:

```ts
      <span style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem',
        fontWeight: isSelected ? 600 : 400,
        color: isSelected ? (isDone ? C.success : isActive ? C.accent : C.text2) : (isDone ? C.success : C.text3),
        whiteSpace: 'nowrap', maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
      }}>
        {task.title}
      </span>
    </button>
  )
}

// Delt av toppnivå-renderingen og av alle handlere som må regne ut en fersk
// displayTasks-liste rett etter en mutasjon (før React-state faktisk har oppdatert seg).
// Video-leveranse-faner er nøstet under video/foto-fanen: de vises kun når prosjektet har
// 2+ video-leveranser OG (prosjektet ikke er mixed ELLER video-fanen er aktiv). Se
// docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md §7.2.
function computeDisplayTasks(
  taskList: Task[],
  isMixedProject: boolean,
  tab: 'video' | 'photo',
  deliverableId: string | null,
  videoDeliverableCount: number
): Task[] {
  const subTypeFiltered = isMixedProject ? taskList.filter(t => t.sub_type === tab) : taskList
  const useVideoTabs = videoDeliverableCount >= 2 && (!isMixedProject || tab === 'video')
  return useVideoTabs
    ? subTypeFiltered.filter(t => t.deliverable_id === null || t.deliverable_id === deliverableId)
    : subTypeFiltered
}

export default function PostProdDetailPage() {
```

- [ ] **Step 3: New state**

Find:

```ts
  const [activeTab, setActiveTab] = useState<'video' | 'photo'>('video')
```

Replace with:

```ts
  const [activeTab, setActiveTab] = useState<'video' | 'photo'>('video')
  const [activeVideoDeliverableId, setActiveVideoDeliverableId] = useState<string | null>(null)
```

- [ ] **Step 4: Use the helper for the top-level `displayTasks`**

Find:

```ts
  // Egendefinerte oppgaver holdes helt utenfor den låste stepperen
  const stepperTasks = tasks.filter(t => !t.is_custom)
  const customTasks = tasks.filter(t => t.is_custom)

  // For mixed-prosjekter: vis kun tasks for aktiv tab
  const isMixed = projects.find(p => p.id === projectId)?.project_type === 'mixed'
  const displayTasks = isMixed ? stepperTasks.filter(t => t.sub_type === activeTab) : stepperTasks
```

Replace with:

```ts
  // Egendefinerte oppgaver holdes helt utenfor den låste stepperen
  const stepperTasks = tasks.filter(t => !t.is_custom)
  const customTasks = tasks.filter(t => t.is_custom)

  // For mixed-prosjekter: vis kun tasks for aktiv tab
  const isMixed = projects.find(p => p.id === projectId)?.project_type === 'mixed'
  const videoDeliverables = ((projects.find(p => p.id === projectId)?.deliverables ?? []) as SignedDeliverableItem[])
    .filter(d => d.type === 'video')
  const hasVideoTabs = videoDeliverables.length >= 2 && (!isMixed || activeTab === 'video')
  const displayTasks = computeDisplayTasks(stepperTasks, isMixed, activeTab, activeVideoDeliverableId, videoDeliverables.length)
```

- [ ] **Step 5: `resolveDeepLinkIdx` — resolve the video-deliverable tab too**

Find:

```ts
  function resolveDeepLinkIdx(list: Task[], isMixedProject: boolean): number {
    const deepTask = deepLinkTaskId ? list.find(t => t.id === deepLinkTaskId) : null
    if (isMixedProject && deepTask?.sub_type) {
      setActiveTab(deepTask.sub_type)
      return getInitialIdx(list.filter(t => t.sub_type === deepTask.sub_type), deepLinkTaskId)
    }
    const filtered = isMixedProject ? list.filter(t => t.sub_type === activeTab) : list
    return getInitialIdx(filtered, deepLinkTaskId)
  }
```

Replace with:

```ts
  function resolveDeepLinkIdx(list: Task[], isMixedProject: boolean, videoDeliverableCount: number): number {
    const deepTask = deepLinkTaskId ? list.find(t => t.id === deepLinkTaskId) : null
    if (deepTask?.deliverable_id) setActiveVideoDeliverableId(deepTask.deliverable_id)
    const resolvedDeliverableId = deepTask?.deliverable_id ?? activeVideoDeliverableId
    if (isMixedProject && deepTask?.sub_type) {
      setActiveTab(deepTask.sub_type)
      return getInitialIdx(computeDisplayTasks(list, true, deepTask.sub_type, resolvedDeliverableId, videoDeliverableCount), deepLinkTaskId)
    }
    const filtered = computeDisplayTasks(list, isMixedProject, activeTab, resolvedDeliverableId, videoDeliverableCount)
    return getInitialIdx(filtered, deepLinkTaskId)
  }
```

- [ ] **Step 6: Update both `resolveDeepLinkIdx` call sites in `fetchAll`**

Find:

```ts
      const seeded = await getTasksForProject(projectId, 'post_prod')
      setProjects(allProj)
      setTasks(seeded)
      initNotes(seeded)
      initTaskData(seeded)
      setSelectedIdx(resolveDeepLinkIdx(seeded, currentProj?.project_type === 'mixed'))
      setLoading(false)
      return
    }

    setProjects(allProj)
    setTasks(projectTasks)
    initNotes(projectTasks)
    initTaskData(projectTasks)
    setSelectedIdx(resolveDeepLinkIdx(projectTasks, currentProj?.project_type === 'mixed'))
```

Replace with:

```ts
      const seeded = await getTasksForProject(projectId, 'post_prod')
      setProjects(allProj)
      setTasks(seeded)
      initNotes(seeded)
      initTaskData(seeded)
      const seededVideoCount = ((currentProj?.deliverables ?? []) as SignedDeliverableItem[]).filter(d => d.type === 'video').length
      setSelectedIdx(resolveDeepLinkIdx(seeded, currentProj?.project_type === 'mixed', seededVideoCount))
      setLoading(false)
      return
    }

    setProjects(allProj)
    setTasks(projectTasks)
    initNotes(projectTasks)
    initTaskData(projectTasks)
    const projectVideoCount = ((currentProj?.deliverables ?? []) as SignedDeliverableItem[]).filter(d => d.type === 'video').length
    setSelectedIdx(resolveDeepLinkIdx(projectTasks, currentProj?.project_type === 'mixed', projectVideoCount))
```

- [ ] **Step 7: `handleSwitchTab` — reset/default the video-deliverable tab, add `handleSwitchVideoTab`**

Find:

```ts
  function handleSwitchTab(tab: 'video' | 'photo') {
    if (selectedTask && notesTimerRef.current) {
      clearTimeout(notesTimerRef.current)
      notesTimerRef.current = null
      updateTaskNotes(selectedTask.id, notes[selectedTask.id] ?? '')
    }
    if (selectedTask && taskDataTimerRef.current) {
      clearTimeout(taskDataTimerRef.current)
      taskDataTimerRef.current = null
      updateTaskData(selectedTask.id, pendingTaskDataRef.current[selectedTask.id] ?? {})
    }
    setActiveTab(tab)
    const tabTasks = stepperTasks.filter(t => t.sub_type === tab)
    const initIdx = getInitialIdx(tabTasks)
    setSelectedIdx(initIdx)
    setShowRejectionForm(false)
    setRejectionNote('')
  }
```

Replace with:

```ts
  function handleSwitchTab(tab: 'video' | 'photo') {
    if (selectedTask && notesTimerRef.current) {
      clearTimeout(notesTimerRef.current)
      notesTimerRef.current = null
      updateTaskNotes(selectedTask.id, notes[selectedTask.id] ?? '')
    }
    if (selectedTask && taskDataTimerRef.current) {
      clearTimeout(taskDataTimerRef.current)
      taskDataTimerRef.current = null
      updateTaskData(selectedTask.id, pendingTaskDataRef.current[selectedTask.id] ?? {})
    }
    setActiveTab(tab)
    const nextDeliverableId = tab === 'video' && videoDeliverables.length >= 2
      ? (videoDeliverables.some(d => d.id === activeVideoDeliverableId) ? activeVideoDeliverableId : videoDeliverables[0].id)
      : null
    setActiveVideoDeliverableId(nextDeliverableId)
    const tabTasks = computeDisplayTasks(stepperTasks, isMixed, tab, nextDeliverableId, videoDeliverables.length)
    const initIdx = getInitialIdx(tabTasks)
    setSelectedIdx(initIdx)
    setShowRejectionForm(false)
    setRejectionNote('')
  }

  function handleSwitchVideoTab(deliverableId: string) {
    if (selectedTask && notesTimerRef.current) {
      clearTimeout(notesTimerRef.current)
      notesTimerRef.current = null
      updateTaskNotes(selectedTask.id, notes[selectedTask.id] ?? '')
    }
    if (selectedTask && taskDataTimerRef.current) {
      clearTimeout(taskDataTimerRef.current)
      taskDataTimerRef.current = null
      updateTaskData(selectedTask.id, pendingTaskDataRef.current[selectedTask.id] ?? {})
    }
    setActiveVideoDeliverableId(deliverableId)
    const tabTasks = computeDisplayTasks(stepperTasks, isMixed, activeTab, deliverableId, videoDeliverables.length)
    const initIdx = getInitialIdx(tabTasks)
    setSelectedIdx(initIdx)
    setShowRejectionForm(false)
    setRejectionNote('')
  }
```

- [ ] **Step 8: `handleDeleteStepperTask` — use the helper**

Find:

```ts
  async function handleDeleteStepperTask(taskId: string) {
    const result = await deleteTask(taskId)
    if (!result.ok) return
    const newTasks = tasks.filter(t => t.id !== taskId)
    setTasks(newTasks)
    const isMixedProject = projects.find(p => p.id === projectId)?.project_type === 'mixed'
    const newStepperTasks = newTasks.filter(t => !t.is_custom)
    const newDisplayTasks = isMixedProject ? newStepperTasks.filter(t => t.sub_type === activeTab) : newStepperTasks
    setSelectedIdx(getInitialIdx(newDisplayTasks))
  }
```

Replace with:

```ts
  async function handleDeleteStepperTask(taskId: string) {
    const result = await deleteTask(taskId)
    if (!result.ok) return
    const newTasks = tasks.filter(t => t.id !== taskId)
    setTasks(newTasks)
    const isMixedProject = projects.find(p => p.id === projectId)?.project_type === 'mixed'
    const newStepperTasks = newTasks.filter(t => !t.is_custom)
    const newDisplayTasks = computeDisplayTasks(newStepperTasks, isMixedProject, activeTab, activeVideoDeliverableId, videoDeliverables.length)
    setSelectedIdx(getInitialIdx(newDisplayTasks))
  }
```

- [ ] **Step 9: `handleGoBack` — mirror the server's deliverable scoping optimistically**

Find:

```ts
  async function handleGoBack(taskId: string) {
    if (!selectedTask) return
    setTogglingId(taskId)
    setActionError(null)
    const taskToReset = tasks.find(t => t.id === taskId)
    const subType = taskToReset?.sub_type ?? null
    const sortOrder = taskToReset?.sort_order ?? 0
    const prevStatuses = new Map(tasks.map(t => [t.id, t.status]))
    // Optimistisk: nullstill denne og alle etter den med samme sub_type lokalt
    setTasks(prev => prev.map(t => {
      if (t.sub_type !== subType) return t
      if (t.sort_order < sortOrder) return t
      return { ...t, status: 'todo' }
    }))
    const resetCount = stepperTasks.filter(t => t.sub_type === subType && t.sort_order >= sortOrder && t.status === 'done').length
```

Replace with:

```ts
  async function handleGoBack(taskId: string) {
    if (!selectedTask) return
    setTogglingId(taskId)
    setActionError(null)
    const taskToReset = tasks.find(t => t.id === taskId)
    const subType = taskToReset?.sub_type ?? null
    const sortOrder = taskToReset?.sort_order ?? 0
    const deliverableId = taskToReset?.deliverable_id ?? null
    const prevStatuses = new Map(tasks.map(t => [t.id, t.status]))
    // Optimistisk: nullstill denne og alle etter den med samme sub_type OG samme leveranse
    // (eller delte steg som Ferdig) lokalt — speiler resetTaskAndSubsequent (lib/actions/pipeline.ts).
    const matchesDeliverable = (t: Task) =>
      deliverableId === null || t.deliverable_id === deliverableId || t.deliverable_id === null
    setTasks(prev => prev.map(t => {
      if (t.sub_type !== subType) return t
      if (!matchesDeliverable(t)) return t
      if (t.sort_order < sortOrder) return t
      return { ...t, status: 'todo' }
    }))
    const resetCount = stepperTasks.filter(t => t.sub_type === subType && matchesDeliverable(t) && t.sort_order >= sortOrder && t.status === 'done').length
```

- [ ] **Step 10: `handleReject` — stay within the same deliverable's tab after rejecting**

Find:

```ts
    const [newProjects, newTasks] = await Promise.all([
      getPostProdProjects(),
      getTasksForProject(projectId, 'post_prod'),
    ])
    setProjects(newProjects as PostProdProject[])
    setTasks(newTasks)
    initNotes(newTasks)
    initTaskData(newTasks)
    // Naviger til klipping-steget (sort_order 2 = index 1)
    const klippingIdx = newTasks.findIndex(t => t.sort_order === 2)
    const gotoIdx = klippingIdx >= 0 ? klippingIdx : 0
    setSelectedIdx(gotoIdx)
```

Replace with:

```ts
    const rejectedDeliverableId = selectedTask?.deliverable_id ?? null
    const [newProjects, newTasks] = await Promise.all([
      getPostProdProjects(),
      getTasksForProject(projectId, 'post_prod'),
    ])
    setProjects(newProjects as PostProdProject[])
    setTasks(newTasks)
    initNotes(newTasks)
    initTaskData(newTasks)
    // Naviger til klipping-steget (sort_order 2 = index 1) — innenfor samme leveranse som
    // den avviste oppgaven tilhørte, slik at man ikke hopper til en annen video-fane.
    const klippingIdx = newTasks.findIndex(t => t.sort_order === 2 && t.deliverable_id === rejectedDeliverableId)
    const gotoIdx = klippingIdx >= 0 ? klippingIdx : 0
    setSelectedIdx(gotoIdx)
```

- [ ] **Step 11: New tab-bar UI, rendered after the existing Film/Bilder tabs**

Find:

```tsx
              </button>
            </div>
          )}

          {/* Task stepper */}
          {displayTasks.length > 0 && !reseeding && (
```

Replace with:

```tsx
              </button>
            </div>
          )}

          {/* Video-leveranse-faner — nøstet under Film/Bilder-fanene for mixed-prosjekter.
              Se docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md §7.2. */}
          {hasVideoTabs && stepperTasks.length > 0 && !reseeding && (
            <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.border}` }}>
              {videoDeliverables.map(d => {
                const tabTasks = (isMixed ? stepperTasks.filter(t => t.sub_type === 'video') : stepperTasks)
                  .filter(t => t.deliverable_id === d.id)
                const tabDone = tabTasks.filter(t => t.status === 'done').length
                const tabTotal = tabTasks.length
                const tabComplete = tabTotal > 0 && tabDone === tabTotal
                const isActive = activeVideoDeliverableId === d.id
                return (
                  <button
                    key={d.id}
                    onClick={() => handleSwitchVideoTab(d.id)}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: isActive ? 600 : 400,
                      padding: '10px 20px', cursor: 'pointer', background: 'none',
                      borderBottom: `2px solid ${isActive ? C.accent : 'transparent'}`,
                      borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                      color: isActive ? C.text : C.text3,
                      display: 'flex', alignItems: 'center', gap: 8,
                      transition: 'color 0.15s',
                    }}
                  >
                    {d.name}
                    {tabTotal > 0 && (
                      <span style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600,
                        padding: '1px 6px', borderRadius: 10,
                        background: tabComplete ? 'rgba(76,175,125,0.15)' : isActive ? C.accentBg : 'rgba(255,255,255,0.05)',
                        color: tabComplete ? C.success : isActive ? C.accent : C.text3,
                        border: `1px solid ${tabComplete ? 'rgba(76,175,125,0.25)' : isActive ? 'rgba(124,92,252,0.25)' : C.border}`,
                      }}>
                        {tabDone}/{tabTotal}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Task stepper */}
          {displayTasks.length > 0 && !reseeding && (
```

- [ ] **Step 12: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 13: Commit**

```bash
git add "app/admin/postprod/[id]/page.tsx"
git commit -m "feat: add video-deliverable tabs to the post-prod stepper page"
```

---

### Task 13: End-to-end verification (both post-prod pages)

**Files:**
- None (verification only).

Supersedes the original Task 9 verification for the board — repeat it against the reseeded test
project, then verify the stepper page too.

- [ ] **Step 1: Confirm the test project is in a clean, correct state**

```js
// /tmp/verify-final.js
const { createClient } = require("@supabase/supabase-js")
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const projectId = "55c576d8-2735-4fd8-b81c-95c760872617"
  await sb.from("projects").update({ pipeline_stage: "pre_prod", project_type: "video", deliverables: [
    { id: "e2e-1", type: "video", name: "E2E Hovedfilm" },
    { id: "e2e-2", type: "video", name: "E2E Reel" },
  ] }).eq("id", projectId)
  await sb.from("tasks").delete().eq("project_id", projectId)
  console.log("test project reset — next page load will reseed with the Task 10 fix")
})()
```

Run it, then start the dev server: `npm run dev -- -p 3300` (kill anything already on that port first
with `lsof -ti:3300 | xargs -r kill`).

- [ ] **Step 2: Board — confirm the fix (this was the original Task 9, interrupted)**

Ask Magnus to open `http://localhost:3300/admin/preprod/55c576d8-2735-4fd8-b81c-95c760872617`
(note: **preprod**, not postprod) and confirm: "Video — Delt" section with Logging + Ferdig, tabs
for "E2E Hovedfilm"/"E2E Reel", each showing Grovklipp/Klipp/Farger/Lyd/Venter på tilbakemelding
independently. Drag a card between Delt and a tab, reload, confirm it stuck.

- [ ] **Step 3: Stepper — confirm the new tabs**

Ask Magnus to open `http://localhost:3300/admin/postprod/55c576d8-2735-4fd8-b81c-95c760872617` and
confirm: a tab row reading "E2E Hovedfilm" / "E2E Reel" appears (below any Film/Bilder tabs, since
this project isn't mixed there won't be any), each with its own `0/5` progress badge (the tab
badge counts only that deliverable's own steps — Grovklipp/Klipp/Farger/Lyd/Venter på
tilbakemelding — not the shared Logging/Ferdig, matching how the existing Film/Bilder tab badges
already only count that sub_type's own tasks). The stepper itself shows a 7-step merged sequence
per tab (Logging→Grovklipp→Klipp→Farger→Lyd→Venter på tilbakemelding→Ferdig) — NOT the old
duplicated 12-step list.
Advance a step in one tab, switch to the other tab, confirm its steps are unaffected. Click "Gå
tilbake" on a step in one tab, confirm only that tab's later steps (and — once all tabs are done —
Ferdig) reset, not the other tab's.

- [ ] **Step 4: Clean up**

```js
// /tmp/cleanup-final.js
const { createClient } = require("@supabase/supabase-js")
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const projectId = "55c576d8-2735-4fd8-b81c-95c760872617"
  await sb.from("tasks").delete().eq("project_id", projectId)
  await sb.from("projects").delete().eq("id", projectId)
  console.log("test project fully removed")
})()
```

Kill the dev server: `lsof -ti:3300 | xargs -r kill`.

- [ ] **Step 5: Final project-wide typecheck and lint**

```bash
npx tsc --noEmit -p .
npx eslint lib/actions/pipeline.ts lib/types.ts "app/admin/postprod/[id]/page.tsx"
```

Expected: no tsc errors, no new eslint errors.

- [ ] **Step 6: Hand off to final review**

Once this passes, proceed to `superpowers:requesting-code-review`'s final whole-branch review
(`scripts/review-package` against `git merge-base main HEAD`..`HEAD`), then
`superpowers:finishing-a-development-branch`.
