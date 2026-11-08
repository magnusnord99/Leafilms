# Digitale flyers med pakkepriser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff publish a "digital flyer" page (one type, for now) that an existing Leafilms customer can forward to prospects — showing a hero video, example case work, a short "why good content sells" text, and real package prices — where a "package" is simply an existing tilbud (quote) flagged with a name/category, reusable without limit and never polluting the normal sales pipeline or revenue totals.

**Architecture:** Two new migrations add the data model (`sales_flyers` + 3 related tables; `projects.is_package_template` + 3 new `quotes` columns). A new `lib/actions/quote-packages.ts` server-action file handles marking/unmarking/duplicating package quotes and lazily creating one shared, hidden "Pakkemaler" project+customer. A new `lib/actions/sales-flyers.ts` mirrors the existing `industry-landing-pages.ts` CRUD pattern. Every existing query that lists projects for the pipeline, revenue, or dashboards gets one extra `is_package_template = false` filter. The public page lives at `app/flyer/[slug]` (not under `app/(marketing)/`, since it must NOT use that route group's `MarketingChrome` styling) and reuses the site's global cinematic theme instead.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), Supabase (Postgres + RLS), Tailwind CSS v4. No automated test runner exists in this repo (no Jest/Vitest, confirmed via `package.json`) — verification throughout this plan follows the project's actual existing convention: `npx tsc --noEmit` plus manual dev-server/SQL checks, matching every prior migration note in `CLAUDE.md`.

**Spec:** `docs/superpowers/specs/2026-11-08-sales-flyers-design.md`

## Global Constraints

- Migrations are numbered `189_sales_flyers.sql`, `190_quote_packages.sql`, `191_sales_flyer_replace_rpcs.sql` (189 confirmed free as of this plan — re-check `ls supabase/migrations | tail -5` immediately before running, per the project's own documented migration-number-race risk).
- `sales_flyers.cta_email` has **no** default of `post@leafilms.no` — it must start empty and be required per-flyer (spec: "forespørsler skal gå til hvem som administrerer salg for denne flyeren", not a fixed address).
- The flyer route (`app/flyer/[slug]`) must **not** import or wrap in `components/marketing/MarketingChrome.tsx` — it uses the site's global root theme (Cormorant Garamond + DM Sans, `#0C0B09`/`#C49434`, already set in `app/layout.tsx`/`app/globals.css`), matching the pitch pages' look, not the bransjeside look.
- A "package" is never a new price model — it is always an existing `quotes` row; its displayed price is always `calculateQuoteTotals(quote.quote_data).finalInclVat` (or the equivalent field already used elsewhere for a quote's total) computed live, never stored/cached.
- `is_package_template = false` must be added to **every** query site that lists projects for the pipeline, revenue, or dashboards — not just the Kanban board. The known sites (Task 5) are exhaustive as far as this plan's research found; if the implementer finds another site during Task 5 that lists/sums `projects` without going through `getProjectsForPipeline()`, add the same filter there too.
- Do not touch `supabase/migrations/187_customer_account_only_b.sql` or run it — it is explicitly blocked pending Magnus's own go-ahead (per `CLAUDE.md`) and is unrelated to this feature.
- `quotes.project_id` stays `NOT NULL` — never loosen this constraint (spec's explicit non-goal).

## Review Focus

- **Clearing `package_label` while a flyer still references the quote** (`sales_flyer_packages.quote_id` has no automatic cleanup on an UPDATE that nulls `package_label`, only on a DELETE of the quote itself) — a reasonable person expects the flyer to stop showing that card immediately, not keep a stale reference. Owned by Task 4 (`unmarkQuoteAsPackage`).
- **Two staff members editing the same flyer's package list or case list at the same time** — a reasonable person expects the last save to win cleanly, not a partial/interleaved result (this exact bug class was found and fixed for `industry_landing_page_cases` in migrations 176-177). Owned by Task 1 (atomic replace RPCs) and Task 9/10 (serialized mutation state, mirroring `MarketingPageView.tsx`'s `caseMutating` pattern).
- **A quote that has never had `quote_data` filled in (freshly created package-mal, before staff has used the builder yet) being duplicated or displayed on a flyer** — a reasonable person expects a package with no real pricing yet to either not appear on the flyer package picker (zero-amount quotes should still be pickable, but staff should see the kr 0 price plainly, not a crash) or compute cleanly to 0, not throw. Owned by Task 4 (`createPackageTemplateQuote`) and Task 10 (package picker display).
- **An anonymous visitor hitting an unpublished or nonexistent flyer slug** — a reasonable person expects a normal 404, not a leak of draft content or a server error. Owned by Task 11.
- **A customer (not staff) with an active Supabase Auth session visiting a published flyer** — the spec says tracking excludes *any* logged-in session, not just staff; a reasonable person (Magnus) expects his own staff preview visits AND a logged-in customer's visits to both be excluded, since both are "not real anonymous prospect traffic." Owned by Task 11.

---

## File Structure

- **`supabase/migrations/189_sales_flyers.sql`** — new tables: `sales_flyers`, `sales_flyer_cases`, `sales_flyer_packages`, `sales_flyer_views` + RLS.
- **`supabase/migrations/190_quote_packages.sql`** — `projects.is_package_template`, `quotes.package_label`/`package_category`/`package_order`.
- **`supabase/migrations/191_sales_flyer_replace_rpcs.sql`** — atomic replace RPCs for the flyer's case list and package list (mirrors migration 175+176+177 in one file, since both lists share the identical race).
- **`lib/types.ts`** — add `SalesFlyer`, `SalesFlyerCase`, `SalesFlyerPackage`, `SalesFlyerView`, `SalesFlyerPackageCategory` types; extend `Project` with `is_package_template`; extend `Quote` with `package_label`/`package_category`/`package_order`.
- **`lib/actions/quote-packages.ts`** (new) — all package-marking/duplication/template-project logic. Quote-domain, so it's separate from the flyer-domain actions file.
- **`lib/actions/sales-flyers.ts`** (new) — flyer CRUD, mirrors `lib/actions/industry-landing-pages.ts` exactly.
- **`lib/actions/pipeline.ts`** — one-line filter addition to `getProjectsForPipeline()` (line 28).
- **`app/admin/okonomi/page.tsx`** — filter addition to the revenue query (lines 287-288).
- **`components/admin/dashboard/widgets/StatsWidget.tsx`**, **`PipelineWidget.tsx`**, **`CustomersWidget.tsx`**, **`RecentProjectsWidget.tsx`** — filter additions.
- **`app/admin/quotes/page.tsx`** — filter addition to `fetchQuotes()` and the project picker; new "Pakkemaler" tab + "+ Ny pakke-mal" entry point.
- **`app/admin/projects/[id]/quote/page.tsx`** — new "Lagre som pakke" / "Fjern pakke-merking" panel + "Dupliser som nytt tilbud" action, wired around the existing `handleSave`/quote-loading logic.
- **`components/modals/PackagePickerModal.tsx`** (new) — mirrors `CasePickerModal.tsx`, lists package-template quotes.
- **`app/admin/landingssider/page.tsx`** — add a Bransjesider|Flyers tab switcher; flyer list/create/delete calls the new actions file.
- **`components/sales-flyer/SalesFlyerView.tsx`** (new) — inline-editing client component, mirrors `components/marketing/MarketingPageView.tsx`'s pattern (per-field errors, optimistic save, serialized list mutations).
- **`app/flyer/[slug]/page.tsx`** + **`app/flyer/[slug]/layout.tsx`** (new) — public route; `page.tsx` also logs anonymous views.

---

### Task 1: Migrations — data model

**Files:**
- Create: `supabase/migrations/189_sales_flyers.sql`
- Create: `supabase/migrations/190_quote_packages.sql`
- Create: `supabase/migrations/191_sales_flyer_replace_rpcs.sql`

**Interfaces:**
- Produces: tables `sales_flyers`, `sales_flyer_cases`, `sales_flyer_packages`, `sales_flyer_views`; columns `projects.is_package_template boolean NOT NULL DEFAULT false`, `quotes.package_label text`, `quotes.package_category text`, `quotes.package_order integer NOT NULL DEFAULT 0`; RPCs `replace_sales_flyer_cases(p_flyer_id uuid, p_case_study_ids uuid[])` and `replace_sales_flyer_packages(p_flyer_id uuid, p_quote_ids uuid[])`.

- [ ] **Step 1: Re-verify the migration number is still free**

Run: `ls supabase/migrations | tail -5 && git status --short`
Expected: highest file is still `188_colleague_nudge.sql`, no new uncommitted migration files. If not, renumber this task's three files accordingly before continuing.

- [ ] **Step 2: Write `supabase/migrations/189_sales_flyers.sql`**

Exact schema (copy verbatim from the spec's "Datamodell" + "Trafikk-statistikk" sections — already fully written SQL, including all four `CREATE TABLE` statements, the `sales_flyer_views_flyer_id_idx` index, and all RLS policies: `staff_all_sales_flyers`, `staff_all_sales_flyer_cases`, `staff_all_sales_flyer_packages`, `staff_read_sales_flyer_views`, `public_read_published_sales_flyers`, `public_read_sales_flyer_cases_for_published`, `public_read_sales_flyer_packages_for_published`). Do not add an anon/authenticated INSERT policy on `sales_flyer_views` — all inserts happen server-side via the service-role client (Task 11), which bypasses RLS entirely.

- [ ] **Step 3: Write `supabase/migrations/190_quote_packages.sql`**

```sql
ALTER TABLE projects ADD COLUMN is_package_template boolean NOT NULL DEFAULT false;

ALTER TABLE quotes ADD COLUMN package_label text;
ALTER TABLE quotes ADD COLUMN package_category text CHECK (package_category IN ('foto', 'film', 'foto_film'));
ALTER TABLE quotes ADD COLUMN package_order integer NOT NULL DEFAULT 0;
```

No RLS changes — existing `projects`/`quotes` policies already cover new columns on the same rows.

- [ ] **Step 4: Write `supabase/migrations/191_sales_flyer_replace_rpcs.sql`**

Two Postgres functions, same shape as `replace_landing_page_cases` (migration 175, further locked by 176-177's `SELECT ... FOR UPDATE` serialization + explicit unknown-parent-id rejection — copy that same locking pattern for both functions here, applied to `sales_flyers` as the parent row):

```sql
CREATE OR REPLACE FUNCTION public.replace_sales_flyer_cases(
  p_flyer_id uuid,
  p_case_study_ids uuid[]
) RETURNS void AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  PERFORM 1 FROM sales_flyers WHERE id = p_flyer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown flyer_id';
  END IF;

  DELETE FROM sales_flyer_cases WHERE flyer_id = p_flyer_id;

  INSERT INTO sales_flyer_cases (flyer_id, case_study_id, order_index)
  SELECT p_flyer_id, id, ord - 1
  FROM unnest(p_case_study_ids) WITH ORDINALITY AS t(id, ord);

  UPDATE sales_flyers SET updated_at = now() WHERE id = p_flyer_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

`replace_sales_flyer_packages(p_flyer_id uuid, p_quote_ids uuid[])` is identical except it targets `sales_flyer_packages`/`quote_id` instead of `sales_flyer_cases`/`case_study_id`.

- [ ] **Step 5: Run all three migrations against Supabase**

Run: `npm run migrate:single -- supabase/migrations/189_sales_flyers.sql`, then `190_...`, then `191_...` (requires `DATABASE_URL` in the environment — use the port-5432 session-pooler form if the 6432 transaction-pooler port is refused, per the project's own repeated note in `CLAUDE.md`).
Expected: each prints "✨ Migration completed successfully!".

- [ ] **Step 6: Verify against the live database**

Run a `psql "$DATABASE_URL" -c "\d sales_flyers"` (and the other three tables) plus `-c "\d projects"` / `-c "\d quotes"` to confirm the new columns exist with the right types/defaults, and `-c "\df replace_sales_flyer_cases"` / `replace_sales_flyer_packages` to confirm both RPCs exist.
Expected: all columns/functions present as specified.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/189_sales_flyers.sql supabase/migrations/190_quote_packages.sql supabase/migrations/191_sales_flyer_replace_rpcs.sql
git commit -m "feat: add sales flyers + quote package data model"
```

---

### Task 2: Types

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: nothing (pure type additions).
- Produces: `SalesFlyer`, `SalesFlyerCase`, `SalesFlyerPackage`, `SalesFlyerView`, `SalesFlyerPackageCategory` types used by every later task; `Project.is_package_template: boolean`; `Quote.package_label: string | null`, `Quote.package_category: SalesFlyerPackageCategory | null`, `Quote.package_order: number`.

- [ ] **Step 1: Add the four new types near the existing `IndustryLandingPage` types (same file area)**

```ts
export type SalesFlyerPackageCategory = 'foto' | 'film' | 'foto_film'

export type SalesFlyer = {
  id: string
  slug: string
  published: boolean
  meta_title: string
  meta_description: string
  hero_video_path: string | null
  hero_poster_path: string | null
  headline: string
  engagement_text: string
  cta_headline: string
  cta_subtext: string
  cta_email: string
  created_at: string
  updated_at: string
  updated_by: string | null
}

export type SalesFlyerCase = {
  id: string
  flyer_id: string
  case_study_id: string
  order_index: number
}

export type SalesFlyerPackage = {
  id: string
  flyer_id: string
  quote_id: string
  order_index: number
}

export type SalesFlyerView = {
  id: string
  flyer_id: string
  viewed_at: string
  referrer: string | null
}
```

- [ ] **Step 2: Extend `Project` (near line 89) with `is_package_template: boolean`**

- [ ] **Step 3: Extend `Quote` (near line 128) with `package_label: string | null`, `package_category: SalesFlyerPackageCategory | null`, `package_order: number`**

- [ ] **Step 4: Run `npx tsc --noEmit`**

Expected: fails in existing code that constructs a `Project` or `Quote` literal without the new required fields (if any) — fix those call sites by adding the field (`is_package_template: false`, `package_order: 0`, etc.) only where TypeScript actually flags a missing-property error; do not touch call sites that merely read these types.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add types for sales flyers and quote packages"
```

---

### Task 3: `lib/actions/sales-flyers.ts`

**Files:**
- Create: `lib/actions/sales-flyers.ts`
- Reference: `lib/actions/industry-landing-pages.ts` (mirror its exact structure)

**Interfaces:**
- Consumes: `SalesFlyer`, `SalesFlyerCase`, `SalesFlyerWithRelations` (defined here) from `lib/types.ts` (Task 2); `CaseStudy` (existing type); `replace_sales_flyer_cases`/`replace_sales_flyer_packages` RPCs (Task 1).
- Produces (used by Tasks 9, 10, 11):
  - `listSalesFlyers(): Promise<SalesFlyer[]>`
  - `export type SalesFlyerWithRelations = SalesFlyer & { cases: (CaseStudy & { order_index: number })[]; packages: { id: string; order_index: number; quote: Quote }[] }`
  - `getSalesFlyerBySlug(slug: string, opts?: { includeDraft?: boolean }): Promise<SalesFlyerWithRelations | null>`
  - `createSalesFlyer(slug: string): Promise<{ id: string } | { error: string }>`
  - `export type SalesFlyerUpdate = Partial<Omit<SalesFlyer, 'id' | 'slug' | 'created_at' | 'updated_at' | 'updated_by'>>`
  - `updateSalesFlyer(id: string, fields: SalesFlyerUpdate): Promise<{ ok: true } | { error: string }>`
  - `setSalesFlyerCases(flyerId: string, caseStudyIds: string[]): Promise<{ ok: true } | { error: string }>`
  - `setSalesFlyerPackages(flyerId: string, quoteIds: string[]): Promise<{ ok: true } | { error: string }>`
  - `deleteSalesFlyer(id: string): Promise<{ ok: true } | { error: string }>`
  - `copyLibraryImageToFlyer(slug: string, imageId: string, field: 'hero_poster'): Promise<{ url: string } | { error: string }>`

- [ ] **Step 1: Implement `listSalesFlyers`, `getSalesFlyerBySlug`, `createSalesFlyer`, `updateSalesFlyer`, `deleteSalesFlyer`**

Copy the exact shape of the matching functions in `lib/actions/industry-landing-pages.ts` (lines 11, 26, 58, 80, 120) verbatim, substituting `sales_flyers` for `industry_landing_pages` and the field list above for the industry-landing-page fields. Keep the same slug validation call (`validateSlug` from `lib/industry-landing-pages.ts` — reuse unchanged, it's generic) and the same `.select('id')`-after-update RLS-silent-filter guard that `updateIndustryLandingPage` uses.

`getSalesFlyerBySlug`'s ordered-cases sub-query mirrors `getOrderedCases` (industry-landing-pages.ts line 41) unchanged in shape. Its ordered-packages sub-query is new: join `sales_flyer_packages.select('id, order_index, quotes (*)')` ordered by `order_index`.

- [ ] **Step 2: Implement `setSalesFlyerCases` and `setSalesFlyerPackages`**

Both call their respective RPC from Task 1 (`replace_sales_flyer_cases` / `replace_sales_flyer_packages`), exactly mirroring `setIndustryLandingPageCases` (industry-landing-pages.ts line 107).

- [ ] **Step 3: Implement `copyLibraryImageToFlyer`**

Mirror `copyLibraryImageToPage` (industry-landing-pages.ts line 136) exactly, with the storage destination path `landing-pages/${slug}/hero_poster-${rand}.${ext}` → use `sales-flyers/${slug}/${field}-${rand}.${ext}` instead (own storage namespace, same bucket `assets`).

- [ ] **Step 4: Run `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/sales-flyers.ts
git commit -m "feat: add sales flyer CRUD actions"
```

---

### Task 4: `lib/actions/quote-packages.ts`

**Files:**
- Create: `lib/actions/quote-packages.ts`
- Reference: `lib/quote-builder-utils.ts` (`calculateQuoteTotals`), `app/admin/projects/new/ProjectForm.tsx` (customer-creation pattern, ~line 347), `lib/actions/schedule-people.ts` (`createCustomerContact`, line 47)

**Interfaces:**
- Consumes: `Quote`, `QuoteBuilderData`, `SalesFlyerPackageCategory` (Task 2); `calculateQuoteTotals(data: QuoteBuilderData, selectedAddonIds?: string[]): QuoteTotals` (existing, `lib/quote-builder-utils.ts:161`).
- Produces (used by Tasks 6, 7, 10):
  - `export type PackageTemplateQuote = { id: string; package_label: string; package_category: SalesFlyerPackageCategory; package_order: number; amount: number }`
  - `listPackageTemplateQuotes(): Promise<PackageTemplateQuote[]>`
  - `markQuoteAsPackage(quoteId: string, fields: { package_label: string; package_category: SalesFlyerPackageCategory; package_order?: number }): Promise<{ ok: true } | { error: string }>`
  - `checkQuoteUsedOnPublishedFlyers(quoteId: string): Promise<{ flyerSlugs: string[] }>`
  - `unmarkQuoteAsPackage(quoteId: string): Promise<{ ok: true } | { error: string }>`
  - `ensurePackageTemplateProject(): Promise<{ projectId: string; customerId: string }>`
  - `createPackageTemplateQuote(fields: { package_label: string; package_category: SalesFlyerPackageCategory }): Promise<{ projectId: string; quoteId: string } | { error: string }>`
  - `duplicatePackageAsNewProject(quoteId: string, customer: { existingCustomerId: string } | { newCustomerName: string }): Promise<{ projectId: string; quoteId: string } | { error: string }>`

- [ ] **Step 1: Implement `listPackageTemplateQuotes`**

Query `quotes.select('id, package_label, package_category, package_order, quote_data').not('package_label', 'is', null).order('package_category').order('package_order')`. For each row, compute `amount` via `calculateQuoteTotals(row.quote_data as QuoteBuilderData).finalInclVat` (use whichever exact `QuoteTotals` field the rest of the app already treats as "the" total for a quote — check one existing call site, e.g. `app/admin/quotes/page.tsx`'s own total-amount rendering, and use the same field for consistency). Return `[]` on error, matching the rest of the codebase's action-file convention.

- [ ] **Step 2: Implement `markQuoteAsPackage`**

`.from('quotes').update({ package_label, package_category, package_order: package_order ?? 0 }).eq('id', quoteId).select('id')`, with the same "0 rows affected = error" guard used by `updateIndustryLandingPage`.

- [ ] **Step 3: Implement `checkQuoteUsedOnPublishedFlyers`**

Query `sales_flyer_packages.select('sales_flyers!inner(slug, published)').eq('quote_id', quoteId).eq('sales_flyers.published', true)` (embedded-resource filter — if this exact PostgREST syntax doesn't filter as expected when tested in Step 6, fall back to two queries: fetch all `sales_flyer_packages` for this `quote_id`, then fetch `sales_flyers` by those `flyer_id`s and filter `published` client-side, matching the safer pattern the research already found in `app/admin/okonomi/page.tsx`). Return `{ flyerSlugs: [...] }`.

- [ ] **Step 4: Implement `unmarkQuoteAsPackage`**

In one call: delete all `sales_flyer_packages` rows where `quote_id = quoteId`, then update the quote to `{ package_label: null, package_category: null, package_order: 0 }`. (The UI, Task 7, calls `checkQuoteUsedOnPublishedFlyers` first and shows the confirmation dialog itself — this function always proceeds once called, it does not re-check.)

- [ ] **Step 5: Implement `ensurePackageTemplateProject`**

Look up an existing project with a fixed, recognizable title (e.g. `title = 'Leafilms — Pakkemaler'` and `is_package_template = true`) first; if found, return its `id` and its `customer_id`. If not found: insert a `customers` row `{ name: 'Leafilms — Pakkemaler' }` (mirroring `ProjectForm.tsx`'s minimal customer insert, ~line 347 — name only, no contact info needed), then insert a `projects` row `{ title: 'Leafilms — Pakkemaler', slug: 'pakkemaler-' + Date.now(), customer_id, status: 'draft', is_package_template: true, language: 'no' }` (`pipeline_stage` can be left to its own `NOT NULL DEFAULT 'lead'` — irrelevant here since every pipeline/revenue query excludes `is_package_template = true` regardless of stage). Return both ids.

- [ ] **Step 6: Implement `createPackageTemplateQuote`**

Calls `ensurePackageTemplateProject()`, then inserts a `quotes` row with `project_id`, a minimal empty `quote_data` skeleton (same shape `QuoteBuilderData` requires with zeroed/empty arrays — check what a brand-new quote's default `quote_data` looks like in `app/admin/projects/[id]/quote/page.tsx`'s own "new quote" path and reuse that exact default object rather than inventing a new one), `status: 'draft'`, `is_current: true`, `package_label`, `package_category`, `package_order: 0`. Returns `{ projectId, quoteId }` so the caller (Task 6) can redirect straight to that quote's edit page.

- [ ] **Step 7: Implement `duplicatePackageAsNewProject`**

1. Fetch the source quote's `quote_data` by `quoteId`.
2. Resolve the customer: if `'existingCustomerId' in customer`, use it directly; if `'newCustomerName' in customer`, insert a new `customers` row with that name (mirror `ProjectForm.tsx` ~line 347, name only).
3. Insert a new `projects` row: `title` = the customer's name (or a sensible default like `"${customerName} — tilbud"`), `slug` slugified + `Date.now()` suffix (mirror `ProjectForm.tsx`'s slug pattern exactly), `customer_id`, `status: 'draft'`, `is_package_template: false`, `language: 'no'` (leave `pipeline_stage` to its default — this project behaves as a completely normal new lead/project from here on).
4. Insert a new `quotes` row: `project_id` = the new project's id, `quote_data` = a deep copy (`JSON.parse(JSON.stringify(...))`) of the source quote's `quote_data`, `status: 'draft'`, `is_current: true`, `package_label: null`, `package_category: null`, `package_order: 0`.
5. Return `{ projectId, quoteId }`.

- [ ] **Step 8: Run `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/actions/quote-packages.ts
git commit -m "feat: add quote package marking, template-project, and duplication actions"
```

---

### Task 5: Exclude `is_package_template` projects from pipeline, revenue, and dashboards

**Files:**
- Modify: `lib/actions/pipeline.ts:28-35` (the `.from('projects')` chain inside `getProjectsForPipeline`)
- Modify: `app/admin/okonomi/page.tsx:287-288`
- Modify: `components/admin/dashboard/widgets/StatsWidget.tsx:22-25`
- Modify: `components/admin/dashboard/widgets/PipelineWidget.tsx:25`
- Modify: `components/admin/dashboard/widgets/CustomersWidget.tsx:26`
- Modify: `components/admin/dashboard/widgets/RecentProjectsWidget.tsx:~29`
- Modify: `app/admin/quotes/page.tsx` (`fetchQuotes()` ~line 108, and the project picker in `openPicker()` ~lines 75-82)

**Interfaces:**
- Consumes: `projects.is_package_template` (Task 1/2).
- Produces: nothing new — this task only narrows existing queries. No signature changes to any existing exported function.

- [ ] **Step 1: `lib/actions/pipeline.ts` — add the filter to `getProjectsForPipeline()`**

Add `.eq('is_package_template', false)` to the existing chain (after `.neq('status', 'lost')`, before or after the `.or(...)` resale clause — order among `.eq`/`.neq`/`.or` calls doesn't matter for Supabase's query builder).

- [ ] **Step 2: `app/admin/okonomi/page.tsx` — add the same filter to the revenue query (lines 287-288)**

Add `.eq('is_package_template', false)` to the existing `.from('projects').select(...)` chain.

- [ ] **Step 3: Dashboard widgets — add the filter to all four queries**

`StatsWidget.tsx` (all projects-related counts at lines 22-25), `PipelineWidget.tsx:25`, `CustomersWidget.tsx:26`, `RecentProjectsWidget.tsx:~29` each get `.eq('is_package_template', false)` added to their existing `.from('projects')` query chains. `CustomersWidget.tsx`'s query selects `customer_id` from `projects` — the same filter still applies (it's filtering the `projects` table, not `customers`).

- [ ] **Step 4: `app/admin/quotes/page.tsx` — filter `fetchQuotes()` and the project picker**

`fetchQuotes()` (~line 108) selects an embedded `projects(...)` resource — add `projects.is_package_template` to the selected columns, then filter the result in JS after fetch (`data.filter(q => !q.projects?.is_package_template)`), matching the safer post-fetch-filtering pattern already used elsewhere in this codebase (e.g. `okonomi/page.tsx`'s own grouping) rather than relying on embedded-filter PostgREST syntax. Apply the same approach to `openPicker()`'s project search query (~lines 75-82): add `.eq('is_package_template', false)` directly to that query's chain (it queries `projects` directly, no embedding, so a direct `.eq` works there).

- [ ] **Step 5: Run `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 6: Manual verification**

Start the dev server, open `/admin/projects` (Kanban), `/admin/okonomi`, the dashboard, and `/admin/quotes`. Confirm no new project exists yet (Task 4's `ensurePackageTemplateProject` hasn't been invoked by any UI yet, so there's nothing to exclude — this step just confirms nothing broke: all four pages still load and show the same data as before).

- [ ] **Step 7: Commit**

```bash
git add lib/actions/pipeline.ts app/admin/okonomi/page.tsx components/admin/dashboard/widgets/StatsWidget.tsx components/admin/dashboard/widgets/PipelineWidget.tsx components/admin/dashboard/widgets/CustomersWidget.tsx components/admin/dashboard/widgets/RecentProjectsWidget.tsx app/admin/quotes/page.tsx
git commit -m "feat: exclude package-template projects from pipeline, revenue, and dashboards"
```

---

### Task 6: `/admin/quotes` — "Pakkemaler" tab + "+ Ny pakke-mal"

**Files:**
- Modify: `app/admin/quotes/page.tsx`

**Interfaces:**
- Consumes: `listPackageTemplateQuotes()`, `createPackageTemplateQuote()` (Task 4).
- Produces: nothing new for later tasks — this is a leaf UI task.

- [ ] **Step 1: Add a tab/toggle state (`'aktive' | 'pakker'`) to the page**

Default `'aktive'` (today's behavior, unchanged). When `'pakker'`, render a simple list from `listPackageTemplateQuotes()` instead of `fetchQuotes()`'s result: each row shows `package_label`, `package_category`, formatted `amount`, and a link to `/admin/projects/${projectId}/quote?quote=${quoteId}` (reuse whatever URL shape the existing quote rows already link to, visible in the current `fetchQuotes()`-driven list markup).

- [ ] **Step 2: Add a "+ Ny pakke-mal" button, visible only on the `'pakker'` tab**

On click, prompt for a label (text input) and category (select: Bilder/Film/Bilder og film → `'foto'|'film'|'foto_film'`) in a small inline form or native `prompt()`-style modal (match whatever lightweight pattern this file already uses for its existing "+ nytt tilbud" entry point). On submit, call `createPackageTemplateQuote({ package_label, package_category })`, then navigate to `/admin/projects/${result.projectId}/quote?quote=${result.quoteId}` so staff lands directly in the normal `QuoteBuilder` to fill in days/crew/license/etc.

- [ ] **Step 3: Run `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 4: Manual verification**

In the dev server, go to `/admin/quotes`, switch to "Pakkemaler" (empty list), click "+ Ny pakke-mal", fill in "Liten pakke" / "foto", submit. Confirm it redirects into the quote builder for a brand-new quote, and that a new "Leafilms — Pakkemaler" project now exists. Switch back to "Pakkemaler" tab and confirm the new package appears with amount `0 kr` (nothing built yet).

- [ ] **Step 5: Commit**

```bash
git add app/admin/quotes/page.tsx
git commit -m "feat: add package-template list and creation entry point to /admin/quotes"
```

---

### Task 7: Quote builder page — mark/unmark/duplicate package

**Files:**
- Modify: `app/admin/projects/[id]/quote/page.tsx`

**Interfaces:**
- Consumes: `markQuoteAsPackage`, `checkQuoteUsedOnPublishedFlyers`, `unmarkQuoteAsPackage`, `duplicatePackageAsNewProject` (Task 4); `Customer[]` (already loaded by this page for other purposes, per `QuoteBuilderProps.customers`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add a small panel, visible when a quote is loaded, showing its current package state**

If `quote.package_label` is null: a text input (label) + select (category) + "Lagre som pakke" button → calls `markQuoteAsPackage(quote.id, { package_label, package_category })`, then refetches/updates local quote state.

If `quote.package_label` is set: show the label/category as read-only text + a "Fjern pakke-merking" button.

- [ ] **Step 2: Wire "Fjern pakke-merking"**

On click: call `checkQuoteUsedOnPublishedFlyers(quote.id)`. If `flyerSlugs.length > 0`, show a confirmation dialog listing them ("Dette tilbudet vises på flyeren(e) {slugs} — fjern merkingen likevel?"); only on confirm (or immediately if the list was empty) call `unmarkQuoteAsPackage(quote.id)` and update local state.

- [ ] **Step 3: Add "Dupliser som nytt tilbud", visible only when `quote.package_label` is set**

On click, open a small customer picker (reuse the existing `customers` prop already passed into this page for quote-builder's own customer selector — a simple searchable `<select>`/autocomplete is enough; if none exists ready-made here, a plain text input for "ny kunde" plus a `<select>` of existing customers is sufficient, matching the project's generally lightweight admin-UI style). On submit, call `duplicatePackageAsNewProject(quote.id, customerChoice)`, then navigate to `/admin/projects/${result.projectId}/quote?quote=${result.quoteId}`.

- [ ] **Step 4: Run `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 5: Manual verification**

Open the "Liten pakke" quote created in Task 6, fill in a couple of crew/days fields via the normal `QuoteBuilder` UI and save (confirms marking doesn't interfere with the normal save flow). Confirm the package panel still shows "Liten pakke"/"foto". Click "Dupliser som nytt tilbud", pick/create a test customer, confirm it lands on a brand-new project's quote page with the same crew/days pre-filled but no package label shown (since the new quote's `package_label` is null). Go back to the original "Liten pakke" quote and confirm it is unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/admin/projects/[id]/quote/page.tsx
git commit -m "feat: add package marking, unmarking, and duplication UI to quote builder"
```

---

### Task 8: `components/modals/PackagePickerModal.tsx`

**Files:**
- Create: `components/modals/PackagePickerModal.tsx`
- Reference: `components/modals/CasePickerModal.tsx` (mirror exactly)

**Interfaces:**
- Consumes: `PackageTemplateQuote` (Task 4).
- Produces (used by Task 10):
```ts
interface PackagePickerModalProps {
  isOpen: boolean
  onClose: () => void
  allPackages: PackageTemplateQuote[]
  selectedQuoteIds: string[]
  onToggleSelection: (quoteId: string) => void
  onSave: () => void
}
```

- [ ] **Step 1: Implement the component**

Copy `CasePickerModal.tsx`'s structure exactly (same prop shape, same isOpen/onClose/list/checkbox/onSave pattern), substituting a row renderer that shows `package_label` + `package_category` (as a human label: "Bilder"/"Film"/"Bilder og film") + formatted `amount` instead of a case study's title/thumbnail.

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/modals/PackagePickerModal.tsx
git commit -m "feat: add package picker modal for flyer package selection"
```

---

### Task 9: `/admin/landingssider` — Bransjesider | Flyers tabs

**Files:**
- Modify: `app/admin/landingssider/page.tsx`

**Interfaces:**
- Consumes: `listSalesFlyers`, `createSalesFlyer`, `deleteSalesFlyer` (Task 3).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Add a tab state (`'bransjesider' | 'flyers'`)**

Default `'bransjesider'` (today's behavior, fully unchanged in that tab). On `'flyers'`, render the same list-row UI pattern (slug, publisert-badge, sist oppdatert, "+ Ny flyer") but backed by `listSalesFlyers`/`createSalesFlyer`/`deleteSalesFlyer` instead of the industry-landing-page equivalents. Links go to `/flyer/${slug}` instead of `/${slug}`.

- [ ] **Step 2: Run `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 3: Manual verification**

In the dev server, go to `/admin/landingssider`, switch to "Flyers" tab, create a flyer with slug `test-flyer`, confirm it appears in the list and links to `/flyer/test-flyer` (will 404 until Task 11 exists — expected at this point).

- [ ] **Step 4: Commit**

```bash
git add app/admin/landingssider/page.tsx
git commit -m "feat: add flyers tab to landingssider admin list"
```

---

### Task 10: `components/sales-flyer/SalesFlyerView.tsx`

**Files:**
- Create: `components/sales-flyer/SalesFlyerView.tsx`
- Reference: `components/marketing/MarketingPageView.tsx` (mirror its inline-editing pattern)

**Interfaces:**
- Consumes: `SalesFlyerWithRelations` (Task 3); `updateSalesFlyer`, `setSalesFlyerCases`, `setSalesFlyerPackages`, `copyLibraryImageToFlyer` (Task 3); `listPackageTemplateQuotes` (Task 4); `CasePickerModal` (existing), `PackagePickerModal` (Task 8); `ImagePickerModal` (existing, for the hero poster).
- Produces (used by Task 11):
```ts
interface SalesFlyerViewProps {
  initialFlyer: SalesFlyerWithRelations
  canEdit: boolean
}
```

- [ ] **Step 1: Set up local state mirroring `MarketingPageView.tsx`'s shape**

`const [flyer, setFlyer] = useState(initialFlyer)`, `editing` boolean, `fieldErrors: Partial<Record<Field, string>>`, `savingFields: Set<Field>`, `caseMutating`/`packageMutating` booleans (two independent serialization flags, since cases and packages are two independent lists — mirror the single `caseMutating` pattern from `MarketingPageView.tsx` but duplicated for packages).

- [ ] **Step 2: Implement `set`/`saveField`/`FieldError` exactly as in `MarketingPageView.tsx`**

Same optimistic-update + per-field-error + revert-on-failure-for-discrete-fields pattern, calling `updateSalesFlyer(flyer.id, { [field]: value })` instead of the industry-landing-page equivalent. Fields: `headline`, `engagement_text`, `cta_headline`, `cta_subtext`, `cta_email`, `published`.

- [ ] **Step 3: Implement hero video + poster upload**

Hero video: a plain `<input type="file" accept="video/*">` wired to `uploadToStorage(file, 'hero-video')` (copy `MarketingPageView.tsx`'s `uploadToStorage` helper verbatim, pointed at `sales-flyers/${slug}/` instead of `landing-pages/${slug}/`), then `set('hero_video_path', url)` + `saveField('hero_video_path', url)`.

Poster image: reuse `ImagePickerModal` exactly as `MarketingPageView.tsx` does for its "Om oss"-bilde, calling `copyLibraryImageToFlyer(flyer.slug, imageId, 'hero_poster')` (Task 3) on selection, or direct upload via the same `uploadToStorage` helper.

- [ ] **Step 4: Implement the case list editor**

Reuse `CasePickerModal` unchanged exactly as `MarketingPageView.tsx` does (`openCasePicker`, `toggleCaseSelection`, `handleCasePickerSave` calling `setSalesFlyerCases`, `moveCase`, `removeCase`, all serialized via `caseMutating`) — copy that block's logic verbatim, substituting the flyer action names.

- [ ] **Step 5: Implement the package list editor**

Same pattern as Step 4, using `PackagePickerModal` (Task 8) and `setSalesFlyerPackages` (Task 3), with `allPackages` sourced from `listPackageTemplateQuotes()` (Task 4) fetched once when the picker opens. Display order groups by `package_category` into the three headings "Bilder" / "Film" / "Bilder og film", each package card showing `package_label` + formatted `amount`.

- [ ] **Step 6: Implement the settings panel (publisert toggle, slug display, SEO fields)**

Mirror `MarketingPageView.tsx`'s floating settings panel exactly, same fields pattern (`published`, `meta_title`, `meta_description`), plus the flyer-specific `cta_email` field here (not inline on the visible CTA button, so it doesn't clutter the visitor-facing layout — same placement reasoning the design doc gives for non-visually-placed fields).

- [ ] **Step 7: Build the actual visitor-facing layout (non-editing render)**

Four blocks top to bottom: hero (full-bleed `<video>` from `hero_video_path`, poster `hero_poster_path`), case examples (thumbnails/embeds from `flyer.cases`), `engagement_text` as a short paragraph, package cards grouped by category, CTA block with `<a href={`mailto:${flyer.cta_email}`}>`. Use the site's global font/color classes (no `MarketingChrome`, no Schibsted/Newsreader-specific classes) — plain Tailwind using the root palette already active by default.

- [ ] **Step 8: Run `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add components/sales-flyer/SalesFlyerView.tsx
git commit -m "feat: add sales flyer inline-editing view component"
```

---

### Task 11: `app/flyer/[slug]/page.tsx` + `layout.tsx` — public route + view logging

**Files:**
- Create: `app/flyer/[slug]/page.tsx`
- Create: `app/flyer/[slug]/layout.tsx`
- Reference: `app/(marketing)/[slug]/page.tsx` and `layout.tsx` (mirror the auth/notFound/metadata pattern, but drop `MarketingChrome`)

**Interfaces:**
- Consumes: `getSalesFlyerBySlug` (Task 3); `getAuthenticatedStaffUser()` (`lib/auth/staff.ts`); `createServiceClient()` (`lib/supabase-server.ts:56`); `SalesFlyerView` (Task 10).
- Produces: nothing — this is the leaf route.

- [ ] **Step 1: Implement `layout.tsx`**

Mirror `app/(marketing)/[slug]/layout.tsx`'s `generateMetadata` exactly (same `robots: { index: false, follow: false }`, same OG/twitter image logic sourced from `hero_poster_path`), but render `children` directly — **no** `<MarketingChrome>` wrapper.

- [ ] **Step 2: Implement `page.tsx` — data loading**

```ts
export const dynamic = 'force-dynamic'
```
1. `const { slug } = await params`
2. `const staff = await getAuthenticatedStaffUser()`
3. `const flyer = await getSalesFlyerBySlug(slug, { includeDraft: staff.ok })`
4. `if (!flyer) notFound()`
5. `if (!flyer.published && !staff.ok) notFound()`

- [ ] **Step 3: Implement anonymous view logging**

After the notFound checks, before rendering: check whether there is **any** logged-in Supabase Auth session at all (not staff-specific — `const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser()`). If `!user`, insert a row into `sales_flyer_views` via `createServiceClient()`: `{ flyer_id: flyer.id, referrer: (await headers()).get('referer') ?? null }`. If `user` exists (staff OR a logged-in customer), skip logging entirely — this one `if` is the entire enforcement of the spec's "innlogget i nettleseren skal ikke spores" rule.

- [ ] **Step 4: Render**

`<SalesFlyerView initialFlyer={flyer} canEdit={staff.ok} />`

- [ ] **Step 5: Run `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 6: Manual verification — the full design doc checklist**

In the dev server:
1. Visit `/flyer/test-flyer` (from Task 9) while logged out — confirm it renders (even mostly empty) and a `sales_flyer_views` row is inserted (check via `psql` or the Supabase dashboard).
2. Visit the same URL again while logged out — confirm a second row is inserted.
3. Log in as staff and visit it again — confirm **no** new row is inserted, and an edit affordance is visible (since the flyer is unpublished, this also confirms the staff-preview path works).
4. Set the flyer to published via the settings panel, log out, confirm the page still renders for an anonymous visitor and still logs a view.
5. Visit a nonexistent slug (`/flyer/does-not-exist`) — confirm a normal 404.
6. Create two packages (Task 6/7), attach both to the flyer (Task 10's package picker), confirm both package cards render with correct, real computed prices on the public page.
7. `curl -s https://<anon-key-context>` is not meaningful locally — instead confirm in code review that no client component anywhere in `SalesFlyerView.tsx` calls `supabase.from('quotes')` directly (all quote data arrives already-joined from the server component via `getSalesFlyerBySlug`).

- [ ] **Step 7: Commit**

```bash
git add app/flyer/[slug]/page.tsx app/flyer/[slug]/layout.tsx
git commit -m "feat: add public sales flyer route with anonymous view tracking"
```

---

### Task 12: End-to-end verification pass

**Files:** none (verification only).

- [ ] **Step 1: `npx tsc --noEmit` on the full tree**

Expected: clean.

- [ ] **Step 2: Walk the spec's full "Verifikasjon" checklist**

(`docs/superpowers/specs/2026-11-08-sales-flyers-design.md`, "Verifikasjon" section) end to end against the running dev server and live Supabase data, including the three-simultaneous-customers scenario: duplicate the same package quote three times to three different test customers, confirm all three appear independently in the normal Kanban pipeline, and confirm the original package-mal quote is unchanged and still absent from the pipeline/economy/dashboard views touched in Task 5.

- [ ] **Step 3: Clean up test data**

Delete the test flyer (`test-flyer`), the test package-mal quotes/duplicated test projects, and any test customers created along the way — same cleanup discipline as the bransjesider design doc's own verification step.

- [ ] **Step 4: Commit (if cleanup touched any tracked files — otherwise skip)**

```bash
git status --short
```
If clean, no commit needed — this task only exercises the running app and live data.
