# Pakke-innhold på flyeren: "hva du får" + "Se mer" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a flyer's package card show icon-chips summarizing what's included (counted live from the package quote's `quote_data.deliverables`), and let staff attach optional, hand-picked example media (main video / social clip / photos) per package in the quote builder, so a card with at least one example gets a "Se mer" button opening a modal with a 16:9 video left and a phone-mockup + photo grid stacked right — collapsing whichever side is empty to full width.

**Architecture:** One new migration (`193_quote_package_showcase.sql`) adds `quote_package_showcase_items` (staff-only RLS, same reasoning as `quotes`/`quote_data` in 189) plus one atomic replace-RPC scoped to `(quote_id, kind)`, mirroring the `replace_sales_flyer_*` pattern from migration 191 but per-kind instead of per-flyer. A new, additive `DeliverableItem.videoRole?: 'hovedvideo' | 'klipp'` field (set via a new control inside `QuoteBuilder.tsx`'s existing `DeliverablesSection`) lets the card distinguish a main video from a social-clip video — both are otherwise just `type: 'video'` rows. A new sibling actions file, `lib/actions/quote-package-showcase.ts`, mirrors `copyLibraryImageToFlyer`/`copyLibraryVideoToFlyer`'s copy-not-reference pattern for the new per-package showcase media. A new admin sub-panel (`components/quote/PackageShowcasePanel.tsx`) reuses the existing, unmodified `ImagePickerModal`/`VideoPickerModal`. On the public side, `lib/actions/sales-flyers.ts`'s existing `getOrderedPackages()` gains two more computed fields per package (`deliverableCounts`, `showcaseItems`) — never the raw `quote_data` itself, matching that file's existing "never ship the whole quotes row" invariant — and a new `components/modals/PackageDetailModal.tsx` (named/located like `PackagePickerModal.tsx`) renders them.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), Supabase (Postgres + RLS), Tailwind CSS v4. **No automated test runner exists in this repo** (confirmed: no Jest/Vitest in `package.json`, no `*.test.*` files) — same situation as the prior `2026-11-08-sales-flyers.md` plan. Every task's "test" step is therefore the concrete manual verification implied by the spec's own Verifikasjon section (dev-server click-throughs, `npx tsc --noEmit`, `psql`/`curl` checks), not an invented test framework.

**Spec:** `docs/superpowers/specs/2026-11-09-flyer-package-showcase-design.md` (builds on `docs/superpowers/specs/2026-11-08-sales-flyers-design.md`)

## Global Constraints

- Migration file is `supabase/migrations/193_quote_package_showcase.sql` — **not** `192_` (that number is already used, uncommitted on disk, by the unrelated `192_sales_flyer_bts_images.sql`). Do not touch, renumber, or revert that file, or the other currently-uncommitted, unrelated changes already sitting in `ImagePickerModal.tsx`, `VideoPickerModal.tsx`, `SalesFlyerView.tsx`, `lib/actions/sales-flyers.ts` (BTS-images work in progress) — this plan's edits to the latter two files must be purely additive on top of whatever is already there.
- `DeliverableItem.videoRole?: 'hovedvideo' | 'klipp'` is purely additive. No migration, no backfill. Every place that counts/reads it must treat a missing/undefined value as `'hovedvideo'`. No change to the contract-freeze logic or any other existing reader of `deliverables`/`projects.deliverables`.
- Chip counts: video rows count as 1 each, grouped by `videoRole` (undefined → hovedvideo) — **never** by a `quantity` field (it doesn't exist for video rows). Photo/annet rows keep counting by `quantity` as before.
- The number of showcase media items never has to match the deliverables list's counted quantities — no 1:1 enforcement anywhere in this feature.
- Copy-not-reference: every showcase image/video is copied into `quote-packages/{quoteId}/{kind}-{random}.{ext}` in the existing `assets` storage bucket — a later deletion of the source library image/video must never break an already-copied showcase item.
- `quote_package_showcase_items` RLS is staff-ALL only — **no** anon/authenticated public policy. The public flyer page must read it exclusively through the service-role client (same authorization pattern as `quotes`/`quote_data` already uses in `getOrderedPackages`), never a direct browser-side query against the table.
- "Se mer" appears on a package card **only** when that package has ≥1 row in `quote_package_showcase_items` (any kind). Zero rows across all three kinds = no button at all.
- In the detail modal, an entirely-empty side (left = `main_video`, right = `social_clip` + `photo`) collapses completely — the populated side takes full width. Never render an empty placeholder column.
- Do not modify `ImagePickerModal.tsx`, `VideoPickerModal.tsx`, or `PackagePickerModal.tsx` beyond this plan's unmodified reuse of them. Do not touch the `sales_flyer_packages` flyer↔package linkage.

## Review Focus

- **A video deliverable row with no `videoRole` at all** (every existing quote today, and any row added before staff bothers to set it) must count as `hovedvideo`, not silently vanish or get miscounted. Owned by Task 4.
- **`quote_data` in the converted/"accepted" shape** (no `crew` array — `isBuilderData()` returns `false`) must degrade to all-zero chip counts without throwing, since `getQuoteAmountExclVat` in the same file already has to handle this exact dual-shape reality for the same table. Owned by Task 4.
- **A brand-new package template quote with zero deliverable rows** (just created via "Lag pakke-mal", nothing filled in yet) must render no chips at all — not `"0 hovedvideo · 0 bilder · 0 nedklipp"`. Owned by Task 4.
- **A package with exactly one showcase kind populated** (e.g. only photos, or only a main video, nothing else) must collapse the opposite side to full width in the detail modal, not leave dead empty space — this is the design doc's own "oppdaget i byggersjekken" decision, and it needs an owning test, not just a mention. Owned by Task 5.
- **Anonymous PostgREST access to `quote_package_showcase_items`**, once real rows exist from earlier tasks, must return nothing (RLS staff-only, no public policy) — the policy is created in Task 1, but it's only a meaningful check once there's actual data to try to leak. Owned by Task 6.

---

## File Structure

- **`supabase/migrations/193_quote_package_showcase.sql`** (new) — `quote_package_showcase_items` table + RLS + the `replace_quote_package_showcase_items` RPC (the RPC is grouped into this same file rather than a separate 194 migration, since the spec names only one migration for this feature).
- **`lib/types.ts`** — add `DeliverableItem.videoRole`; add `QuotePackageShowcaseKind`, `QuotePackageShowcaseItem`.
- **`lib/quote-builder-utils.ts`** — add `getPackageDeliverableCounts(data: unknown)`.
- **`lib/actions/quote-package-showcase.ts`** (new) — copy actions + list/replace actions for showcase media. Sibling to `quote-packages.ts` (package-marking domain) and `sales-flyers.ts` (flyer CRUD domain) — this one owns the showcase-media domain.
- **`lib/actions/sales-flyers.ts`** — extend `SalesFlyerPackageItem` + `getOrderedPackages()` with `deliverableCounts` (Task 4) and `showcaseItems` (Task 5).
- **`components/quote/QuoteBuilder.tsx`** — `DeliverablesSection` (~line 628) gets a `videoRole` selector per video row.
- **`components/quote/PackageShowcasePanel.tsx`** (new) — the "Eksempelmedia for Se mer-visningen" admin sub-panel.
- **`app/admin/projects/[id]/quote/page.tsx`** — render `<PackageShowcasePanel>` inside the existing package-label block (~line 780-817).
- **`components/sales-flyer/SalesFlyerView.tsx`** — chip rendering + "Se mer" button + `PackageDetailModal` wiring inside `renderPackageCard` (~line 417).
- **`components/modals/PackageDetailModal.tsx`** (new) — mirrors `PackagePickerModal.tsx`'s naming/location convention.

---

### Task 1: Migration 193 + `videoRole` field + deliverables editor control

**Files:**
- Create: `supabase/migrations/193_quote_package_showcase.sql`
- Modify: `lib/types.ts` (`DeliverableItem`, after the existing `quantity?: number` line)
- Modify: `components/quote/QuoteBuilder.tsx` (`DeliverablesSection`, ~lines 628-718)

**Interfaces:**
- Produces: table `quote_package_showcase_items`; RPC `replace_quote_package_showcase_items(p_quote_id uuid, p_kind text, p_items jsonb)`; `DeliverableItem.videoRole?: 'hovedvideo' | 'klipp'`.
- Consumed by: Task 2 (RPC caller), Task 4 (videoRole-based counting).

- [ ] **Step 1: Re-verify the migration number is still free**

Run: `ls supabase/migrations | tail -5 && git status --short`
Expected: highest committed file is still `191_sales_flyer_replace_rpcs.sql`; `192_sales_flyer_bts_images.sql` appears only in the uncommitted `git status` output (untouched by this task); no `193_` file exists yet. If this has changed, renumber before continuing.

- [ ] **Step 2: Write `supabase/migrations/193_quote_package_showcase.sql`**

Table + RLS copied verbatim from the spec's "Datamodell" section, plus the replace-RPC (same locking pattern as `replace_sales_flyer_packages` in migration 191: `is_staff` check, `FOR UPDATE` lock on the parent row, explicit rejection of an unknown parent id, delete+insert inside one function body):

```sql
CREATE TABLE quote_package_showcase_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('main_video', 'social_clip', 'photo')),
  media_type  text NOT NULL CHECK (media_type IN ('image', 'video')),
  path        text NOT NULL,
  caption     text,
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quote_package_showcase_kind_media_type_check CHECK (
    (kind = 'main_video' AND media_type = 'video') OR
    (kind = 'photo' AND media_type = 'image') OR
    (kind = 'social_clip')
  )
);
CREATE INDEX quote_package_showcase_items_quote_id_idx ON quote_package_showcase_items (quote_id, kind, order_index);

ALTER TABLE quote_package_showcase_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all_quote_package_showcase_items" ON quote_package_showcase_items
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
-- Ingen public/anon-policy — flyer-siden leser via service-klient, se Task 5.

CREATE OR REPLACE FUNCTION public.replace_quote_package_showcase_items(
  p_quote_id uuid,
  p_kind text,
  p_items jsonb
) RETURNS void AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_kind NOT IN ('main_video', 'social_clip', 'photo') THEN
    RAISE EXCEPTION 'unknown kind';
  END IF;

  PERFORM 1 FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown quote_id';
  END IF;

  DELETE FROM quote_package_showcase_items WHERE quote_id = p_quote_id AND kind = p_kind;

  INSERT INTO quote_package_showcase_items (quote_id, kind, media_type, path, caption, order_index)
  SELECT p_quote_id, p_kind, item->>'media_type', item->>'path', item->>'caption', ord - 1
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ord);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

- [ ] **Step 3: Run the migration**

Run: `npm run migrate:single -- supabase/migrations/193_quote_package_showcase.sql` (needs `DATABASE_URL`; use the port-5432 session-pooler form if 6432 is refused, per `CLAUDE.md`'s repeated note).
Expected: "✨ Migration completed successfully!"

- [ ] **Step 4: Confirm the schema landed**

Run: `psql "$DATABASE_URL" -c "\d quote_package_showcase_items"`
Expected: all columns, the two CHECK constraints, and RLS listed as enabled.

- [ ] **Step 5: Add `videoRole` to `DeliverableItem` in `lib/types.ts`**

```ts
/** Skiller en hovedvideo-rad fra en nedklipp-rad for pakkekortets ikon-chips — se
 * 2026-11-09-flyer-package-showcase-design.md. Rent additivt: udefinert = 'hovedvideo'. */
videoRole?: 'hovedvideo' | 'klipp'
```

- [ ] **Step 6: Add a videoRole control to `DeliverablesSection` in `components/quote/QuoteBuilder.tsx`**

Widen `update`'s field union to include `'videoRole'` (value passthrough, same as `'type'`/`'name'` — no special-casing needed since it's a plain string field). Add a `<select>` next to the existing type `<select>`, rendered only when `item.type === 'video'`, value `item.videoRole ?? 'hovedvideo'`, options `Hovedvideo` (`'hovedvideo'`) / `Nedklipp` (`'klipp'`), calling `update(item.id, 'videoRole', e.target.value)`.

- [ ] **Step 7: `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 8: Manual verification**

Start the dev server, open any quote's builder, add 2 video deliverable rows, set one to "Nedklipp", save, reload the page. Confirm the selection persisted (it's part of the existing `quote_data` JSON saved by the existing save flow — no new server action needed here).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/193_quote_package_showcase.sql lib/types.ts components/quote/QuoteBuilder.tsx
git commit -m "feat: add quote package showcase table, RPC, and videoRole field"
```

---

### Task 2: `lib/actions/quote-package-showcase.ts` — copy actions + list/replace

**Files:**
- Create: `lib/actions/quote-package-showcase.ts`
- Modify: `lib/types.ts` (add `QuotePackageShowcaseKind`, `QuotePackageShowcaseItem`)
- Reference: `lib/actions/sales-flyers.ts` (`copyLibraryImageToFlyer`/`copyLibraryVideoToFlyer`, lines 257-335)

**Interfaces:**
- Consumes: RPC `replace_quote_package_showcase_items` (Task 1); existing `images`/`video_library` tables.
- Produces (used by Task 3):
  - `export type QuotePackageShowcaseKind = 'main_video' | 'social_clip' | 'photo'` (in `lib/types.ts`)
  - `export type QuotePackageShowcaseItem = { id: string; quote_id: string; kind: QuotePackageShowcaseKind; media_type: 'image' | 'video'; path: string; caption: string | null; order_index: number }` (in `lib/types.ts`)
  - `copyLibraryImageToQuotePackage(quoteId: string, imageId: string, kind: 'photo' | 'social_clip'): Promise<{ url: string } | { error: string }>`
  - `copyLibraryVideoToQuotePackage(quoteId: string, videoId: string, kind: 'main_video' | 'social_clip'): Promise<{ url: string } | { error: string }>`
  - `listQuotePackageShowcaseItems(quoteId: string): Promise<QuotePackageShowcaseItem[]>`
  - `setQuotePackageShowcaseItems(quoteId: string, kind: QuotePackageShowcaseKind, items: { media_type: 'image' | 'video'; path: string; caption?: string | null }[]): Promise<{ ok: true } | { error: string }>`

- [ ] **Step 1: Add the two types to `lib/types.ts`**

- [ ] **Step 2: Implement `copyLibraryImageToQuotePackage`**

Mirror `copyLibraryImageToFlyer` exactly (lookup `images.file_path` → download from `assets` → upload to a new path → return the public URL). Destination: `` `quote-packages/${quoteId}/${kind}-${Math.random().toString(36).substring(2)}.${ext}` ``.

- [ ] **Step 3: Implement `copyLibraryVideoToQuotePackage`**

Mirror `copyLibraryVideoToFlyer` exactly, same destination pattern, `video_library.file_path` as the source.

- [ ] **Step 4: Implement `listQuotePackageShowcaseItems`**

`.from('quote_package_showcase_items').select('*').eq('quote_id', quoteId).order('kind').order('order_index')`. Return `[]` on error (matches the rest of the codebase's action-file convention).

- [ ] **Step 5: Implement `setQuotePackageShowcaseItems`**

`.rpc('replace_quote_package_showcase_items', { p_quote_id: quoteId, p_kind: kind, p_items: items })`. Return `{ ok: true }` / `{ error: 'Kunne ikke oppdatere eksempelmedia' }` matching `setSalesFlyerPackages`'s error-wrapping pattern.

- [ ] **Step 6: `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 7: Commit**

(No standalone runtime verification here — same precedent as the sibling plan's Task 4, `quote-packages.ts`: this is a pure actions file with no UI yet; its functional correctness is verified in Task 3's manual-verification step once the admin panel calls it.)

```bash
git add lib/actions/quote-package-showcase.ts lib/types.ts
git commit -m "feat: add quote package showcase copy/list/replace actions"
```

---

### Task 3: Admin "Eksempelmedia for Se mer-visningen" panel

**Files:**
- Create: `components/quote/PackageShowcasePanel.tsx`
- Modify: `app/admin/projects/[id]/quote/page.tsx` (inside the `activeQuote.package_label ?` branch, ~lines 780-817)

**Interfaces:**
- Consumes: `listQuotePackageShowcaseItems`, `setQuotePackageShowcaseItems`, `copyLibraryImageToQuotePackage`, `copyLibraryVideoToQuotePackage`, `QuotePackageShowcaseItem`, `QuotePackageShowcaseKind` (Task 2); `ImagePickerModal`, `VideoPickerModal` (unmodified, existing `onSelect(ids)` contract).
- Produces: `<PackageShowcasePanel quoteId={string} />` — self-contained; nothing else consumes its internals.

- [ ] **Step 1: Scaffold the component**

`'use client'`. Props `{ quoteId: string }`. State: `items: QuotePackageShowcaseItem[]`, `loading`, `error`, plus per-kind "saving" flags (mirror `packageMutating` in `SalesFlyerView.tsx`). Fetch `listQuotePackageShowcaseItems(quoteId)` on mount and whenever `quoteId` changes.

- [ ] **Step 2: Implement a shared row renderer for one `kind`**

`function renderRow(kind, label, kindItems)`: thumbnails (`<img>` for `media_type === 'image'`, `<video muted>` for `'video'`) each with a `×` remove button and `↑`/`↓` reorder buttons (same up/down-arrow convention as `movePackage`/`removePackage` in `SalesFlyerView.tsx` — not literal drag-and-drop, matching this codebase's established reorder-UI pattern for every other ordered list). Show a non-blocking hint line per kind: Hovedvideo → "f.eks. 1", Sosiale klipp → "f.eks. 2-4", Bilder → "f.eks. 4-8" (no hard limit, per spec — "byggeren avgjør... ikke et krav").

- [ ] **Step 3: Implement add-flow for `main_video` and `photo`**

"+ Legg til hovedvideo" opens `VideoPickerModal` (no `maxSelection` — multiple main videos allowed, since the spec leaves "how multiple main_video items display" to the builder). "+ Legg til bilde" opens `ImagePickerModal` (no `maxSelection`). On `onSelect(ids)`: for each id, call the matching copy action (`copyLibraryVideoToQuotePackage(quoteId, id, kind)` / `copyLibraryImageToQuotePackage(quoteId, id, kind)`), collect the returned URLs, append as new items (`media_type` fixed by kind) to the existing in-memory list for that kind, then call `setQuotePackageShowcaseItems(quoteId, kind, fullUpdatedListForKind)` and update state. Surface any `{ error }` the same way the existing package-label panel does (inline red text).

- [ ] **Step 4: Implement add-flow for `social_clip`**

Two buttons — "+ Legg til klippvideo" (`VideoPickerModal`, `media_type: 'video'`) and "+ Legg til klippbilde" (`ImagePickerModal`, `media_type: 'image'`) — since `social_clip` is the one kind that can hold either media type (per the migration's CHECK constraint). Same copy-then-replace-whole-kind-list flow as Step 3.

- [ ] **Step 5: Implement caption editing for `social_clip` items**

A small text input per `social_clip` thumbnail (blur-to-save), calling `setQuotePackageShowcaseItems(quoteId, 'social_clip', updatedFullList)` with that item's `caption` changed, rest unchanged.

- [ ] **Step 6: Implement remove and reorder**

Both call `setQuotePackageShowcaseItems(quoteId, kind, remainingOrReorderedItemsForThatKind)` with the full, current list for that one kind (never a partial diff — matches the atomic-replace contract).

- [ ] **Step 7: Wire into `app/admin/projects/[id]/quote/page.tsx`**

Inside the `activeQuote.package_label ?` branch (after the existing title/buttons row, before its closing `</div>`), add a heading "Eksempelmedia for Se mer-visningen" and render `<PackageShowcasePanel quoteId={activeQuote.id} />`.

- [ ] **Step 8: `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 9: Manual verification** (spec Verifikasjon, bullets 2-3)

Dev server → open a package-template quote → add 1 hovedvideo, 3 sosiale klipp, 6 bilder via the library pickers → reload the page → confirm correct counts and order per row. Then go to `/admin/images`, delete one of the images just used, return to the quote page, reload → confirm that showcase thumbnail still renders unchanged (its `path` points at `quote-packages/{quoteId}/...`, a separate copy, not the deleted library file).

- [ ] **Step 10: Commit**

```bash
git add components/quote/PackageShowcasePanel.tsx app/admin/projects/\[id\]/quote/page.tsx
git commit -m "feat: add package showcase media panel to quote builder"
```

---

### Task 4: Chip-count display logic on the flyer package card

**Files:**
- Modify: `lib/quote-builder-utils.ts` (new helper, near `isBuilderData`/`getQuoteAmountExclVat`)
- Modify: `lib/actions/sales-flyers.ts` (`SalesFlyerPackageItem` type + `getOrderedPackages()`, lines 17-24 and 122-157)
- Modify: `components/sales-flyer/SalesFlyerView.tsx` (`renderPackageCard`, ~line 417)

**Interfaces:**
- Consumes: `DeliverableItem.videoRole`, `isBuilderData` (Task 1 / existing).
- Produces: `getPackageDeliverableCounts(data: unknown): { hovedvideo: number; klipp: number; photo: number }` (`lib/quote-builder-utils.ts`); `SalesFlyerPackageItem.deliverableCounts` (same shape).

- [ ] **Step 1: Write `getPackageDeliverableCounts` in `lib/quote-builder-utils.ts`**

```ts
export function getPackageDeliverableCounts(data: unknown): { hovedvideo: number; klipp: number; photo: number } {
  const zero = { hovedvideo: 0, klipp: 0, photo: 0 }
  if (!isBuilderData(data)) return zero
  // body: group (data.deliverables ?? []) — video rows count as 1 each, grouped by
  // (item.videoRole ?? 'hovedvideo'); photo rows sum (item.quantity ?? 1). 'annet' rows
  // are intentionally excluded — the design only specifies 3 chip icons (video/bilde/klipp).
}
```

Decision pinned here (not left to the implementer): a photo row with no `quantity` set yet counts as `1`, not `0` — a row that exists represents at least one deliverable.

- [ ] **Step 2: Extend `SalesFlyerPackageItem` in `lib/actions/sales-flyers.ts`**

Add `deliverableCounts: { hovedvideo: number; klipp: number; photo: number }`.

- [ ] **Step 3: Compute it inside `getOrderedPackages()`**

The function already selects `quote_data` per row for `amount` — reuse the same `row.quotes.quote_data` to call `getPackageDeliverableCounts(...)` and include the result. `quote_data` itself still never leaves this function.

- [ ] **Step 4: Render the chips in `SalesFlyerView.tsx`**

Add a small chip row above/below the title in `renderPackageCard`, one `<span>` per group with `count > 0`, in this exact order: hovedvideo, bilder, nedklipp — e.g. `"1 hovedvideo · 10 bilder · 4 nedklipp"` (exact icon SVGs/spacing are the implementer's call; the grouping, order, and "only render groups with count > 0" are not).

- [ ] **Step 5: `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 6: Manual verification** (covers all 3 Review Focus items owned by this task)

On a package-template quote, add: 1 video (default role → hovedvideo), 2 videos set to "Nedklipp", 1 photo row with `quantity = 10`. Attach it to a test flyer via the existing "Velg pakker" flow. Visit `/flyer/test-slug` → confirm the chip row shows exactly 1 hovedvideo / 10 bilder / 2 nedklipp. Separately, create a second, brand-new package-template quote with **zero** deliverable rows, attach it too → confirm its card shows **no** chip row at all, not `"0 hovedvideo · 0 bilder · 0 nedklipp"`.

- [ ] **Step 7: Commit**

```bash
git add lib/quote-builder-utils.ts lib/actions/sales-flyers.ts components/sales-flyer/SalesFlyerView.tsx
git commit -m "feat: show deliverable-count chips on flyer package cards"
```

---

### Task 5: `PackageDetailModal` + showcase-item fetching + "Se mer" wiring

**Files:**
- Create: `components/modals/PackageDetailModal.tsx`
- Modify: `lib/actions/sales-flyers.ts` (`SalesFlyerPackageItem` type + `getOrderedPackages()`)
- Modify: `components/sales-flyer/SalesFlyerView.tsx` (`renderPackageCard` + component-level modal state)

**Interfaces:**
- Consumes: `QuotePackageShowcaseItem`, `QuotePackageShowcaseKind` (Task 2).
- Produces: `SalesFlyerPackageItem.showcaseItems: QuotePackageShowcaseItem[]`; `<PackageDetailModal isOpen onClose packageLabel items={QuotePackageShowcaseItem[]} />`.

- [ ] **Step 1: Add a batch fetch helper in `lib/actions/sales-flyers.ts`**

`async function getShowcaseItemsByQuoteId(quoteIds: string[]): Promise<Map<string, QuotePackageShowcaseItem[]>>` — one `createServiceClient()` query, `.in('quote_id', quoteIds)`, ordered by `kind, order_index`, grouped into the returned `Map` (same service-client authorization reasoning already documented at the top of `getOrderedPackages`/`getSalesFlyerBySlug` for `quotes` — this table has no public policy at all, so a service client is the *only* way to read it here).

- [ ] **Step 2: Wire it into `getOrderedPackages()`**

After the existing packages array is built, call `getShowcaseItemsByQuoteId(packages.map(p => p.quote_id))` once and attach each package's own slice (default `[]` if absent from the map).

- [ ] **Step 3: Extend `SalesFlyerPackageItem`**

Add `showcaseItems: QuotePackageShowcaseItem[]`.

- [ ] **Step 4: Build `components/modals/PackageDetailModal.tsx`**

Props: `{ isOpen: boolean; onClose: () => void; packageLabel: string; items: QuotePackageShowcaseItem[] }`. Group by `kind` internally. Left column: `main_video` items in a bounded 16:9 frame using a plain `<video controls poster={...}>` (not `HeroMedia` — that component is built for full-bleed autoplay/loop background use, not an interactive bounded player); when there's more than one, add simple prev/next arrows switching an `activeIndex` state. Right column, stacked: `social_clip` items in a phone/Instagram-style mockup frame (bordered rounded div around the media, `caption` rendered underneath when set) — same prev/next pattern if more than one — then `photo` items in a small grid. Collapse the left column entirely (right takes full width) when there are no `main_video` items; collapse the right column entirely (left takes full width) when there are **both** zero `social_clip` **and** zero `photo` items. Match `PackagePickerModal.tsx`'s overlay/`Card`/close-button structure.

- [ ] **Step 5: Wire "Se mer" into `SalesFlyerView.tsx`**

Component-level state `const [detailPackageId, setDetailPackageId] = useState<string | null>(null)`. In `renderPackageCard`, compute `hasShowcase = pkg.showcaseItems.length > 0`; render a "Se mer" button only when `hasShowcase`, calling `setDetailPackageId(pkg.id)`. Render one `<PackageDetailModal>` per card (or a single shared instance keyed by the currently-open package — either is fine) with `isOpen={detailPackageId === pkg.id}`, `items={pkg.showcaseItems}`, `packageLabel={pkg.package_label}`, `onClose={() => setDetailPackageId(null)}`.

- [ ] **Step 6: `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 7: Manual verification** (spec Verifikasjon bullets 3-5; covers this task's Review Focus item)

On the fully-populated test package from Task 4 (video + clips + photos): click "Se mer" → confirm video left / phone-mockup + grid right. Build a third package-template quote with **only** photo showcase items (no `main_video`/`social_clip` rows) and attach it to the test flyer → click its "Se mer" → confirm the grid takes full width with no empty left gap. Then, back in Task 3's panel, remove every showcase item from one package → reload the flyer → confirm its "Se mer" button is gone.

- [ ] **Step 8: Commit**

```bash
git add components/modals/PackageDetailModal.tsx lib/actions/sales-flyers.ts components/sales-flyer/SalesFlyerView.tsx
git commit -m "feat: add package detail modal with showcase media"
```

---

### Task 6: End-to-end verification pass

**Files:** none — verification only.

- [ ] **Step 1: Full `npx tsc --noEmit` on the whole branch**

Expected: clean.

- [ ] **Step 2: Migration-number collision check**

Run: `git status --short && ls supabase/migrations | grep -E '19[23]_'`
Expected: both `192_sales_flyer_bts_images.sql` (uncommitted, untouched) and `193_quote_package_showcase.sql` (this plan's, committed) listed as distinct files — no collision, neither reverted.

- [ ] **Step 3: Anonymous RLS check against real data**

With the test packages/showcase rows created in Tasks 4-5 still in place:
Run: `curl -s "$SUPABASE_URL/rest/v1/quote_package_showcase_items?select=*" -H "apikey: $SUPABASE_ANON_KEY"`
Expected: `[]` — confirms the staff-only policy actually blocks anonymous PostgREST access even though real rows exist and are visibly rendering on the published test flyer via the service-client path.

- [ ] **Step 4: Full spec Verifikasjon re-run**

Re-walk every bullet in the spec's "Verifikasjon" section once more end-to-end on the test flyer built across Tasks 3-5, confirming nothing regressed between tasks (ordering, copy-not-reference, chip text, modal collapse behavior, "Se mer" disappearing when emptied).

- [ ] **Step 5: Commit** (only if Step 4 surfaced fixes; otherwise this task has nothing to commit)
