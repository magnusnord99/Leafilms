# Opprett prosjekt uten pitch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins create a bare project in `app/admin/projects/new/page.tsx` without generating a pitch, while still being able to fill in delivery info (which today is only ever entered via a pitch/quote) at creation time — and fix a pre-existing bug in the "Lag pitch"-knapp on the project hub page that would have created a duplicate project instead of reusing the existing one.

**Architecture:** A new `create_pitch` boolean on the new-project wizard's form state (default `false`, default `true` when opened with a `?project_id=` query param) gates the existing pitch-only sections (Prosjektdetaljer, Review, Kontekst, AI-info) and the sections-seeding + `/api/generate-project` call in `handleSubmit`. Delivery columns (`delivery_video`, `delivery_photo`, `delivery_description`, `post_prod_days`) — which already exist on `projects`, independent of `sections`/pitch — get a new always-visible "Leveringsinfo" field group and are written directly into the same insert/update call the wizard already makes. The existing (currently unreachable) "Opprett pitch med AI →" link on the project hub page gets its missing `project_id` query param, since after this change `!hasSections` becomes a state real projects can be in.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres, client-side `@/lib/supabase`), plain client-component form (no server action for project creation).

## Global Constraints

- No automated test framework exists in this repo (no jest/vitest, no `*.test.ts` files, no `test` script in `package.json`). Every task below is verified manually via `tsc`/`eslint`/`npm run build` plus a browser walkthrough — matches existing project convention (see `docs/superpowers/plans/2026-07-31-adhoc-pitch-quote-review.md` for precedent).
- Design tokens for `/admin/*` come from `lib/admin-theme.ts` (`C.bg`, `C.accent`, `C.border`, `C.text`, `C.text2`, `C.text3`, `C.surface`, `C.surface2`, `C.accentBg`) — already imported in both files this plan touches, no new import needed.
- No migration needed — `delivery_video`, `delivery_photo`, `delivery_description`, `post_prod_days` already exist as nullable columns on `projects` (`lib/types.ts:92-97`).
- Spec: `docs/superpowers/specs/2026-08-10-opprett-prosjekt-uten-pitch-design.md` — read it for the "why" behind each decision below; this plan implements it as-is.

---

### Task 1: New-project wizard — `create_pitch` toggle, Leveringsinfo fields, conditional sections

**Files:**
- Modify: `app/admin/projects/new/page.tsx`

**Interfaces:**
- Produces: `formData.create_pitch: boolean`, `formData.delivery_video: string`, `formData.delivery_photo: string`, `formData.delivery_description: string`, `formData.post_prod_days: string` on the wizard's local state. Task 2 reads these exact field names when writing `handleSubmit`.

- [ ] **Step 1: Add the new fields to `formData`'s initial state**

Replace (lines 158-173):
```typescript
  const [formData, setFormData] = useState({
    title: '',
    language: 'no' as 'no' | 'en',
    project_type: '' as 'video' | 'photo' | 'mixed' | '',
    legacy_project_type: '',
    mediums: [] as string[],
    target_audience: '',
    industry: '',
    scope: '',
    context: '',
    pipeline_stage: 'lead' as PipelineStage,
    pitch_review_enabled: false,
    pitch_reviewer_id: null as string | null,
    quote_review_enabled: false,
    quote_reviewer_id: null as string | null,
  })
```
with:
```typescript
  const [formData, setFormData] = useState({
    title: '',
    language: 'no' as 'no' | 'en',
    project_type: '' as 'video' | 'photo' | 'mixed' | '',
    legacy_project_type: '',
    mediums: [] as string[],
    target_audience: '',
    industry: '',
    scope: '',
    context: '',
    pipeline_stage: 'lead' as PipelineStage,
    pitch_review_enabled: false,
    pitch_reviewer_id: null as string | null,
    quote_review_enabled: false,
    quote_reviewer_id: null as string | null,
    create_pitch: !!searchParams.get('project_id'),
    delivery_video: '',
    delivery_photo: '',
    delivery_description: '',
    post_prod_days: '',
  })
```

(`searchParams` is already declared above at line 148 via `useSearchParams()`, so it's in scope here.)

- [ ] **Step 2: Insert the "Lag pitch nå" toggle after the Prosjekttittel field**

Replace (lines 465-477):
```tsx
              <div>
                {fieldLabel('Prosjekttittel', true)}
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Nike Produktlansering 2025"
                  style={inputStyle}
                />
              </div>

              <div>
                {fieldLabel('Pipeline-steg')}
```
with:
```tsx
              <div>
                {fieldLabel('Prosjekttittel', true)}
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Nike Produktlansering 2025"
                  style={inputStyle}
                />
              </div>

              <div>
                {fieldLabel('Pitch')}
                {chipBtn(
                  formData.create_pitch,
                  () => setFormData({ ...formData, create_pitch: !formData.create_pitch }),
                  'Lag pitch nå'
                )}
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginTop: 6, letterSpacing: '0.06em' }}>
                  Av: oppretter kun prosjektet. På: AI genererer pitch-innhold basert på feltene under.
                </p>
              </div>

              <div>
                {fieldLabel('Pipeline-steg')}
```

- [ ] **Step 3: Add the "Leveringsinfo" field group after the Kunde field**

Replace (lines 627-632 — the end of the Kunde field's `isNewCustomer` expansion block and the two closing divs after it):
```tsx
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
```
with:
```tsx
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div style={{ width: 12, height: 1, background: C.border }} />
                  <span style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.58rem',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: C.text3,
                  }}>
                    Leveringsinfo (valgfritt)
                  </span>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      {fieldLabel('Video')}
                      <input
                        type="text"
                        value={formData.delivery_video}
                        onChange={(e) => setFormData({ ...formData, delivery_video: e.target.value })}
                        placeholder="F.eks. 2 kampanjefilmer á 90 sek"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      {fieldLabel('Foto')}
                      <input
                        type="text"
                        value={formData.delivery_photo}
                        onChange={(e) => setFormData({ ...formData, delivery_photo: e.target.value })}
                        placeholder="F.eks. 30 produktbilder"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      {fieldLabel('Leveringsbeskrivelse')}
                      <input
                        type="text"
                        value={formData.delivery_description}
                        onChange={(e) => setFormData({ ...formData, delivery_description: e.target.value })}
                        placeholder="Kort oppsummering av leveransen"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      {fieldLabel('Etterarbeidsdager')}
                      <input
                        type="number"
                        min="0"
                        value={formData.post_prod_days}
                        onChange={(e) => setFormData({ ...formData, post_prod_days: e.target.value })}
                        placeholder="F.eks. 5"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
```

(The visual pattern — small divider line + uppercase label — matches the existing "Ny kunde"-expansion sub-label a few lines above it, same file.)

- [ ] **Step 4: Gate the pitch-only sections behind `formData.create_pitch`**

Replace (the opening of the "Prosjektdetaljer" section):
```tsx
          {/* Section: Prosjektdetaljer */}
          <div>
            {sectionDivider('Prosjektdetaljer')}
```
with:
```tsx
          {formData.create_pitch && (
          <>
          {/* Section: Prosjektdetaljer */}
          <div>
            {sectionDivider('Prosjektdetaljer')}
```

Replace (the end of the AI-info box, right before the Submit section — this closes the fragment/conditional opened above; everything between stays untouched):
```tsx
                  <li>Relevante cases</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex flex-col gap-4">
```
with:
```tsx
                  <li>Relevante cases</li>
                </ul>
              </div>
            </div>
          </div>
          </>
          )}

          {/* Submit */}
          <div className="flex flex-col gap-4">
```

This wraps "Prosjektdetaljer", "Review", "Kontekst og bakgrunn" and the "AI genererer" info box (all currently contiguous in the file) in one `{formData.create_pitch && (<>...</>)}` block, unchanged internally.

- [ ] **Step 5: Update `isFormValid`**

Replace (line 397):
```typescript
  const isFormValid = formData.title && formData.project_type && formData.legacy_project_type && formData.mediums.length > 0 && formData.target_audience
```
with:
```typescript
  const isFormValid = formData.create_pitch
    ? formData.title && formData.project_type && formData.legacy_project_type && formData.mediums.length > 0 && formData.target_audience
    : formData.title && (!!selectedCustomerId || customerInput.trim().length > 0)
```

- [ ] **Step 6: Update the submit button label**

Replace (line 848):
```tsx
                {loading ? (generatingStatus || 'Oppretter prosjekt...') : 'Opprett Prosjekt med AI'}
```
with:
```tsx
                {loading
                  ? (formData.create_pitch ? (generatingStatus || 'Oppretter prosjekt...') : 'Oppretter...')
                  : (formData.create_pitch ? 'Opprett Prosjekt med AI' : 'Opprett prosjekt')}
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "projects/new/page.tsx"`
Expected: no output.

Run: `npx eslint "app/admin/projects/new/page.tsx"`
Expected: clean.

- [ ] **Step 8: Manual browser check**

Run: `npm run dev`, open `/admin/projects/new`.
- Confirm "Lag pitch nå" is unchecked by default, and that Prosjektdetaljer/Review/Kontekst/AI-info are hidden.
- Confirm "Leveringsinfo" fields are visible regardless of the toggle.
- Confirm the submit button reads "Opprett prosjekt" and is disabled until title + a kunde are filled in (customer alone via the `Kunde` field, no need to fill Innholdstype/Språk).
- Toggle "Lag pitch nå" on → confirm Prosjektdetaljer/Review/Kontekst/AI-info reappear and the submit button reads "Opprett Prosjekt med AI".
- Do not submit yet (that flow isn't wired up until Task 2) — this step only checks rendering and validation.

- [ ] **Step 9: Commit**

```bash
git add "app/admin/projects/new/page.tsx"
git commit -m "feat: add create_pitch toggle and delivery-info fields to new-project wizard"
```

---

### Task 2: New-project wizard — persist delivery info, skip pitch generation when `create_pitch` is off

**Files:**
- Modify: `app/admin/projects/new/page.tsx`

**Interfaces:**
- Consumes: `formData.create_pitch`, `formData.delivery_video`, `formData.delivery_photo`, `formData.delivery_description`, `formData.post_prod_days` from Task 1.

- [ ] **Step 1: Write delivery fields into the existing-project update payload**

Replace (lines 276-289):
```typescript
        const { data: updated, error: updateError } = await supabase
          .from('projects')
          .update({
            title: formData.title,
            client_name: clientName,
            customer_id: customerId,
            language: formData.language,
            project_type: formData.project_type || null,
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingProjectId)
          .select()
          .single()
```
with:
```typescript
        const { data: updated, error: updateError } = await supabase
          .from('projects')
          .update({
            title: formData.title,
            client_name: clientName,
            customer_id: customerId,
            language: formData.language,
            project_type: formData.project_type || null,
            delivery_video: formData.delivery_video || null,
            delivery_photo: formData.delivery_photo || null,
            delivery_description: formData.delivery_description || null,
            post_prod_days: formData.post_prod_days ? Number(formData.post_prod_days) : null,
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingProjectId)
          .select()
          .single()
```

- [ ] **Step 2: Write delivery fields into the new-project insert payload**

Replace (lines 301-319):
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
with:
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
            delivery_video: formData.delivery_video || null,
            delivery_photo: formData.delivery_photo || null,
            delivery_description: formData.delivery_description || null,
            post_prod_days: formData.post_prod_days ? Number(formData.post_prod_days) : null,
            metadata
          })
          .select()
          .single()
```

- [ ] **Step 3: Gate sections-seeding + AI generation, branch the redirect**

Replace (lines 330-387):
```typescript
      const sections = [
        { type: 'hero', order_index: 1, visible: true },
        { type: 'concept', order_index: 2, visible: true },
        { type: 'goal', order_index: 3, visible: true },
        { type: 'deliverables', order_index: 4, visible: true },
        { type: 'example_work', order_index: 8, visible: true },
        { type: 'cases', order_index: 7, visible: true },
        { type: 'team', order_index: 6, visible: true },
        { type: 'moodboard', order_index: 9, visible: false },
        { type: 'timeline', order_index: 5, visible: true },
        { type: 'contact', order_index: 10, visible: true }
      ]

      // Ikke dupliser seksjoner hvis prosjektet allerede har noen
      const { count: existingSectionCount } = await supabase
        .from('sections')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)

      if ((existingSectionCount ?? 0) === 0) {
        const { error: sectionsError } = await supabase
          .from('sections')
          .insert(sections.map(s => ({ project_id: project.id, ...s })))

        if (sectionsError) throw sectionsError
      }

      setGeneratingStatus('Genererer innhold med AI...')

      try {
        const aiResponse = await fetch('/api/generate-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: project.id,
            title: formData.title,
            clientName,
            language: formData.language,
            contentType: formData.project_type,
            projectType: formData.legacy_project_type,
            mediums: formData.mediums,
            targetAudience: formData.target_audience,
            industry: formData.industry,
            scope: formData.scope,
            context: formData.context
          })
        })
        if (!aiResponse.ok) {
          const errorData = await aiResponse.json().catch(() => ({}))
          console.error('AI generation failed:', errorData)
        }
      } catch (aiError) {
        console.error('AI generation error:', aiError)
      }

      await new Promise(resolve => setTimeout(resolve, 2000))
      router.push(`/admin/projects/${project.id}/edit?generated=true`)
      router.refresh()
```
with:
```typescript
      if (formData.create_pitch) {
        const sections = [
          { type: 'hero', order_index: 1, visible: true },
          { type: 'concept', order_index: 2, visible: true },
          { type: 'goal', order_index: 3, visible: true },
          { type: 'deliverables', order_index: 4, visible: true },
          { type: 'example_work', order_index: 8, visible: true },
          { type: 'cases', order_index: 7, visible: true },
          { type: 'team', order_index: 6, visible: true },
          { type: 'moodboard', order_index: 9, visible: false },
          { type: 'timeline', order_index: 5, visible: true },
          { type: 'contact', order_index: 10, visible: true }
        ]

        // Ikke dupliser seksjoner hvis prosjektet allerede har noen
        const { count: existingSectionCount } = await supabase
          .from('sections')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', project.id)

        if ((existingSectionCount ?? 0) === 0) {
          const { error: sectionsError } = await supabase
            .from('sections')
            .insert(sections.map(s => ({ project_id: project.id, ...s })))

          if (sectionsError) throw sectionsError
        }

        setGeneratingStatus('Genererer innhold med AI...')

        try {
          const aiResponse = await fetch('/api/generate-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: project.id,
              title: formData.title,
              clientName,
              language: formData.language,
              contentType: formData.project_type,
              projectType: formData.legacy_project_type,
              mediums: formData.mediums,
              targetAudience: formData.target_audience,
              industry: formData.industry,
              scope: formData.scope,
              context: formData.context
            })
          })
          if (!aiResponse.ok) {
            const errorData = await aiResponse.json().catch(() => ({}))
            console.error('AI generation failed:', errorData)
          }
        } catch (aiError) {
          console.error('AI generation error:', aiError)
        }

        await new Promise(resolve => setTimeout(resolve, 2000))
        router.push(`/admin/projects/${project.id}/edit?generated=true`)
      } else {
        router.push(`/admin/projects/${project.id}`)
      }
      router.refresh()
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "projects/new/page.tsx"`
Expected: no output.

Run: `npx eslint "app/admin/projects/new/page.tsx"`
Expected: clean.

- [ ] **Step 5: Manual browser check — bare project**

With `npm run dev` running, open `/admin/projects/new`, leave "Lag pitch nå" off, fill in a title, pick/type a kunde, fill in "Video" and "Etterarbeidsdager" under Leveringsinfo, submit.
- Confirm you land on `/admin/projects/{id}` (the hub page), not the pitch editor — no AI-generation spinner shown.
- In the Supabase dashboard (or `psql "$DATABASE_URL" -c "select title, delivery_video, post_prod_days from projects order by created_at desc limit 1;"`), confirm the new row has the delivery fields you entered.
- Run `psql "$DATABASE_URL" -c "select count(*) from sections where project_id = '<the new project id>';"` — expect `0`.

- [ ] **Step 6: Manual browser check — pitch still works unchanged**

Open `/admin/projects/new`, turn "Lag pitch nå" on, fill in all required pitch fields, submit.
- Confirm the existing behavior is unchanged: AI-generation spinner shows, you land on `/admin/projects/{id}/edit?generated=true`, and `sections` rows exist for the new project.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/projects/new/page.tsx"
git commit -m "feat: skip sections/AI-generation and redirect to hub when creating a project without a pitch"
```

---

### Task 3: Fix "Lag pitch"-lenken på prosjektsiden (missing `project_id`)

**Files:**
- Modify: `app/admin/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `create_pitch` default-from-`project_id` behavior from Task 1 — this task supplies the `project_id` query param that makes that default fire correctly.

- [ ] **Step 1: Add `project_id` to the "Opprett pitch med AI" link**

Replace (the `Link href` inside the `!hasSections` branch of the "pitch" tab):
```tsx
                <Link href={`/admin/projects/new?customer_id=${project.customer_id ?? ''}&title=${encodeURIComponent(project.title)}&context=${encodeURIComponent(notesValue.trim())}`}>
```
with:
```tsx
                <Link href={`/admin/projects/new?project_id=${projectId}&customer_id=${project.customer_id ?? ''}&title=${encodeURIComponent(project.title)}&context=${encodeURIComponent(notesValue.trim())}`}>
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit 2>&1 | grep "projects/\[id\]/page.tsx"`
Expected: no output.

Run: `npx eslint "app/admin/projects/[id]/page.tsx"`
Expected: clean.

- [ ] **Step 3: Manual browser check — end-to-end "Lag pitch" flow on a bare project**

Using the bare project created in Task 2 Step 5:
- Open `/admin/projects/{id}`, go to the "Pitch & Tilbud" tab.
- Confirm "Ingen pitch opprettet enda" is shown with an "Opprett pitch med AI →" button.
- Click it → confirm the URL is `/admin/projects/new?project_id={id}&customer_id=...&title=...&context=...`, that the wizard opens with "Lag pitch nå" already on, title and kunde pre-filled.
- Fill in the remaining required pitch fields (Innholdstype, Prosjekttype, Medium, Målgruppe), submit.
- Confirm you land on `/admin/projects/{id}/edit?generated=true` — **the same `{id}`** as the bare project, not a new one.
- Run `psql "$DATABASE_URL" -c "select count(*) from projects where title = '<the title you used>';"` — expect `1`, confirming no duplicate project was created.
- Run `psql "$DATABASE_URL" -c "select count(*) from sections where project_id = '{id}';"` — expect `10`.

- [ ] **Step 4: Full project check**

Run: `npx tsc --noEmit`
Expected: zero errors anywhere in the project.

Run: `npm run build`
Expected: builds successfully.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/projects/[id]/page.tsx"
git commit -m "fix: pass project_id when linking to new-project wizard from Lag pitch button, avoiding duplicate project"
```

---

## Self-Review Notes

- **Spec coverage:** all sections of `docs/superpowers/specs/2026-08-10-opprett-prosjekt-uten-pitch-design.md` are covered — new state + toggle + Leveringsinfo UI + conditional rendering + `isFormValid` (Task 1), delivery-field persistence + gated sections-seeding/AI-gen + branched redirect + button label (Task 2), the "Lag pitch"-link bugfix (Task 3). The spec's manual testing checklist (items 1-6) is folded into Task 1 Step 8, Task 2 Steps 5-6, and Task 3 Step 3.
- **Placeholder scan:** no TBD/TODO; every step shows the exact before/after code or an exact single-line change.
- **Type consistency:** `formData.create_pitch`/`delivery_video`/`delivery_photo`/`delivery_description`/`post_prod_days` are defined once in Task 1 Step 1 and referenced with identical names in every later step (Task 1 Steps 2-6, Task 2 Steps 1-3). `post_prod_days` is consistently a `string` in form state, parsed with `Number(...)` only at write-time (Task 2), matching its `number | null` column type in `lib/types.ts`.

---

**Plan complete and saved to `docs/superpowers/plans/2026-08-10-opprett-prosjekt-uten-pitch.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
