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
