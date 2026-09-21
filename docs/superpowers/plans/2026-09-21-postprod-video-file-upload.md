# Postprod video-steg: filopplasting erstatter lenker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the paste-a-link fields on the four video postprod steps (Grovklipp, Farger, Lyd, Klipp) with real R2-backed file uploads that preview inline, support a formal version chain, and can be sent to a customer (video-review, timestamped comments) or a colleague (internal approval) as two fully independent actions.

**Architecture:** A new `task_video_files` table holds uploaded files per task, linked into a version chain via `replaces_file_id`. Uploads reuse the existing R2 multipart pattern from `lib/actions/transfers.ts` (chunked, presigned, no practical size limit). Sending to a customer extends the existing `video_reviews`/`/v/[token]` system to serve R2 files alongside its current Supabase-Storage files. Sending to a colleague extends the existing `gallery_reviews`/`admin_tasks` mechanism to trigger from an uploaded file instead of only from a gallery. Selektering/Redigering (photo steps) and sluttleveranser (`/d/[token]`) are untouched.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), Cloudflare R2 via `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, TypeScript strict mode, no test runner in this repo (verification is `npx tsc --noEmit` + manual browser checks — see Global Constraints).

**Spec:** `docs/superpowers/specs/2026-09-21-postprod-video-file-upload-design.md`

## Global Constraints

- This repo has **no automated test framework** (no jest/vitest/playwright configured, no `*.test.*` files). Every task's "test cycle" is: (1) `npx tsc --noEmit` compiles clean, (2) the manual verification steps listed in the task, run against `npm run dev`. Do not attempt to add a test runner as part of this plan — out of scope.
- Migrations go in `supabase/migrations/`, numbered sequentially. Before creating each migration file, run `ls supabase/migrations | tail -3` to confirm the next free number — other work may have landed migrations since this plan was written.
- Per `CLAUDE.md` convention, migrations are **written but never run automatically** against Supabase. After writing each migration, add it to the "Uapplied migrasjoner" list in `CLAUDE.md` (final task in this plan does this for all three at once).
- Only the four video steps — **Grovklipp, Farger, Lyd, Klipp** — get the new file-upload UI. Selektering/Redigering (photo steps, bildegalleri-flyt) and Logging (uses the existing project-level "Filer" widget / `ProjectDocuments`) are explicitly out of scope for new upload UI — see spec §Omfang.
- `TASK_LINK_FIELDS` in `app/admin/postprod/[id]/page.tsx` is **not deleted** — it still drives the read-only "archived links" display and the `priorStages` reference panel for historical data. Only the *editable* rendering of those fields is replaced.
- Send-to-customer and send-to-colleague are per-file, independent, and only ever available on the **latest** version in a file's version chain (spec §Send til kunde / send til kollega).

---

### Task 1: Migration — `task_video_files` table

**Files:**
- Create: `supabase/migrations/160_task_video_files.sql` (confirm 160 is still free with `ls supabase/migrations | tail -3` before writing)

**Interfaces:**
- Produces: table `task_video_files(id, task_id, filename, r2_key, size_bytes, content_type, uploaded_by, replaces_file_id, sort_order, created_at)`, referenced by Tasks 2, 3, 5, 7, 8.

- [ ] **Step 1: Write the migration**

```sql
-- 160_task_video_files.sql
-- Filer lastet opp direkte på et video-postprod-steg (Grovklipp/Farger/Lyd/Klipp),
-- erstatter de gamle fritekst-lenkefeltene (TASK_LINK_FIELDS i postprod-siden).
-- Fri liste (ingen fast "hovedfil") — replaces_file_id danner en enkel
-- versjonskjede når man laster opp "ny versjon av X". Se
-- docs/superpowers/specs/2026-09-21-postprod-video-file-upload-design.md

CREATE TABLE IF NOT EXISTS task_video_files (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename          TEXT        NOT NULL,
  r2_key            TEXT        NOT NULL,
  size_bytes        BIGINT      NOT NULL,
  content_type      TEXT,
  uploaded_by       UUID        REFERENCES profiles(id),
  replaces_file_id  UUID        REFERENCES task_video_files(id),
  sort_order        INT         NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_video_files_task ON task_video_files(task_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_task_video_files_replaces ON task_video_files(replaces_file_id);

ALTER TABLE task_video_files ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'task_video_files' AND policyname = 'authenticated full access task_video_files'
  ) THEN
    EXECUTE 'CREATE POLICY "authenticated full access task_video_files" ON task_video_files FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;
```

- [ ] **Step 2: Verify the migration is syntactically valid**

Run: `cat supabase/migrations/160_task_video_files.sql | grep -c "CREATE TABLE"`
Expected: `1` (sanity check the file was written; this migration is NOT run against Supabase per Global Constraints — no `psql`/`migrate` step here).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/160_task_video_files.sql
git commit -m "Legg til task_video_files-tabell for postprod filopplasting"
```

---

### Task 2: Migration — `video_reviews` R2 support

**Files:**
- Create: `supabase/migrations/161_video_reviews_r2_support.sql`

**Interfaces:**
- Consumes: `task_video_files(id)` from Task 1.
- Produces: `video_reviews.storage_provider ('supabase'|'r2')`, `video_reviews.r2_key`, `video_reviews.task_video_file_id`, with `storage_path` now nullable. Used by Task 6.

- [ ] **Step 1: Write the migration**

```sql
-- 161_video_reviews_r2_support.sql
-- video_reviews støttet hittil kun Supabase Storage (2GB-tak, ikke chunket).
-- Postprod-filopplasting bruker R2 (multipart, ingen praktisk grense) — denne
-- migrasjonen lar video_reviews peke på enten kilde via storage_provider.

ALTER TABLE video_reviews ALTER COLUMN storage_path DROP NOT NULL;

ALTER TABLE video_reviews
  ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'supabase'
    CHECK (storage_provider IN ('supabase', 'r2')),
  ADD COLUMN IF NOT EXISTS r2_key TEXT,
  ADD COLUMN IF NOT EXISTS task_video_file_id UUID REFERENCES task_video_files(id) ON DELETE SET NULL;

ALTER TABLE video_reviews DROP CONSTRAINT IF EXISTS video_reviews_storage_source_check;
ALTER TABLE video_reviews ADD CONSTRAINT video_reviews_storage_source_check
  CHECK (
    (storage_provider = 'supabase' AND storage_path IS NOT NULL AND r2_key IS NULL) OR
    (storage_provider = 'r2' AND r2_key IS NOT NULL AND storage_path IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_video_reviews_task_video_file ON video_reviews(task_video_file_id);
```

- [ ] **Step 2: Verify**

Run: `cat supabase/migrations/161_video_reviews_r2_support.sql | grep -c "ADD CONSTRAINT"`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/161_video_reviews_r2_support.sql
git commit -m "Legg til R2-stotte i video_reviews for postprod-filer"
```

---

### Task 3: Migration — `gallery_reviews` task-file support

**Files:**
- Create: `supabase/migrations/162_gallery_reviews_task_file_support.sql`

**Interfaces:**
- Consumes: `task_video_files(id)` from Task 1.
- Produces: `gallery_reviews.gallery_id` now nullable, `gallery_reviews.task_video_file_id` added, with a check that exactly one of the two is set. Used by Task 8.

- [ ] **Step 1: Write the migration**

```sql
-- 162_gallery_reviews_task_file_support.sql
-- gallery_reviews hittil bare for selection_galleries. Postprod "send til
-- kollega" på en opplastet videofil gjenbruker samme intern-review-mekanikk
-- (admin_tasks + waiting_review-status), men trigges fra en fil, ikke et
-- galleri — derfor gjøres gallery_id valgfri og task_video_file_id lagt til.

ALTER TABLE gallery_reviews ALTER COLUMN gallery_id DROP NOT NULL;

ALTER TABLE gallery_reviews
  ADD COLUMN IF NOT EXISTS task_video_file_id UUID REFERENCES task_video_files(id) ON DELETE CASCADE;

ALTER TABLE gallery_reviews DROP CONSTRAINT IF EXISTS gallery_reviews_source_check;
ALTER TABLE gallery_reviews ADD CONSTRAINT gallery_reviews_source_check
  CHECK (
    (gallery_id IS NOT NULL AND task_video_file_id IS NULL) OR
    (gallery_id IS NULL AND task_video_file_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_gallery_reviews_task_video_file ON gallery_reviews(task_video_file_id);
```

- [ ] **Step 2: Verify**

Run: `cat supabase/migrations/162_gallery_reviews_task_file_support.sql | grep -c "ADD CONSTRAINT"`
Expected: `1`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/162_gallery_reviews_task_file_support.sql
git commit -m "Legg til task_video_file_id i gallery_reviews for fil-basert kollegagodkjenning"
```

---

### Task 4: `lib/types.ts` — `GalleryReview` type update

**Files:**
- Modify: `lib/types.ts:188-202`

**Interfaces:**
- Consumes: nothing new.
- Produces: `GalleryReview.gallery_id: string | null`, `GalleryReview.task_video_file_id: string | null` — used by Task 8 and any code that already imports `GalleryReview` (e.g. `GalleryReviewClient.tsx`, which only reads `gallery_id` when non-null, so this is a widening change, not breaking).

- [ ] **Step 1: Make the type change**

Replace lines 188-202 of `lib/types.ts`:

```ts
export type GalleryReview = {
  id: string
  gallery_id: string | null
  status: GalleryReviewStatus
  requested_by: string
  reviewer_id: string
  comment: string | null
  requested_at: string
  responded_at: string | null
  created_at: string
  admin_task_id: string | null
  task_id: string | null
  task_video_file_id: string | null
  requester: { id: string; name: string | null; email: string } | null
  reviewer: { id: string; name: string | null; email: string } | null
}
```

- [ ] **Step 2: Verify the codebase still compiles**

Run: `npx tsc --noEmit`
Expected: no new errors mentioning `GalleryReview` (there may be pre-existing unrelated errors in the repo — compare against a baseline run before this change if unsure).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "Gjor GalleryReview.gallery_id valgfri og legg til task_video_file_id"
```

---

### Task 5: `lib/actions/task-video-files.ts` — core file CRUD + upload

**Files:**
- Create: `lib/actions/task-video-files.ts`

**Interfaces:**
- Consumes: `r2`, `R2_BUCKET` from `lib/r2.ts`; `getUploadPartUrl`, `completeUpload`, `abortUpload` from `lib/actions/transfers.ts` (reused as-is — both are already generic over `key`/`uploadId`, no prefix baked in).
- Produces (consumed by later tasks and by the UI in Task 11):
  - `type TaskVideoFile = { id, task_id, filename, r2_key, size_bytes, content_type, uploaded_by, replaces_file_id, sort_order, created_at }`
  - `initiateTaskFileUpload(input: { taskId: string; filename: string; contentType?: string }): Promise<{ key: string; uploadId: string; partSize: number } | { error: string }>`
  - `completeTaskFileUpload(input: { taskId: string; projectId: string; key: string; uploadId: string; parts: { ETag: string; PartNumber: number }[]; filename: string; sizeBytes: number; contentType?: string; replacesFileId?: string }): Promise<{ file: TaskVideoFile } | { error: string }>`
  - `listTaskVideoFiles(taskId: string): Promise<TaskVideoFile[]>`
  - `getTaskVideoFileSignedUrl(fileId: string): Promise<string | null>`

- [ ] **Step 1: Write the file**

```ts
'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { r2, R2_BUCKET } from '@/lib/r2'
import { CreateMultipartUploadCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { completeUpload } from '@/lib/actions/transfers'

// Samme delstørrelse som transfers.ts — se begrunnelse der. Ikke eksportert
// ("use server"-filer kan kun eksportere async-funksjoner); klienten får
// verdien via initiateTaskFileUpload()'s returverdi.
const UPLOAD_PART_SIZE = 25 * 1024 * 1024
const SIGNED_URL_EXPIRY = 60 * 60 * 4 // 4 timer, samme som video-reviews.ts

export type TaskVideoFile = {
  id: string
  task_id: string
  filename: string
  r2_key: string
  size_bytes: number
  content_type: string | null
  uploaded_by: string | null
  replaces_file_id: string | null
  sort_order: number
  created_at: string
}

// Starter en multipart-opplasting til R2 for et postprod-steg. Egen
// nøkkel-prefix ("postprod/") adskilt fra transfers.ts sin "transfers/"-prefix
// for sluttleveranser — for øvrig identisk mønster (se lib/actions/transfers.ts).
export async function initiateTaskFileUpload(input: {
  taskId: string
  filename: string
  contentType?: string
}): Promise<{ key: string; uploadId: string; partSize: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke autentisert' }

  const key = `postprod/${input.taskId}/${randomBytes(16).toString('hex')}/${input.filename}`

  try {
    const { UploadId } = await r2.send(new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: input.contentType || undefined,
    }))
    if (!UploadId) return { error: 'R2 returnerte ingen upload-ID' }
    return { key, uploadId: UploadId, partSize: UPLOAD_PART_SIZE }
  } catch (err) {
    console.error('[initiateTaskFileUpload]', err)
    return { error: 'Kunne ikke starte opplasting til R2' }
  }
}

// Fullfører opplastingen (via transfers.ts sin generiske completeUpload) og
// registrerer filen i task_video_files. Hvis replacesFileId er satt, kjeder
// den nye raden bakover til forrige versjon (formell versjonskjede, spec §Datamodell).
export async function completeTaskFileUpload(input: {
  taskId: string
  projectId: string
  key: string
  uploadId: string
  parts: { ETag: string; PartNumber: number }[]
  filename: string
  sizeBytes: number
  contentType?: string
  replacesFileId?: string
}): Promise<{ file: TaskVideoFile } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke autentisert' }

  const completeResult = await completeUpload({ key: input.key, uploadId: input.uploadId, parts: input.parts })
  if ('error' in completeResult) return completeResult

  const { data: maxOrder } = await supabase
    .from('task_video_files')
    .select('sort_order')
    .eq('task_id', input.taskId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const { data, error } = await supabase
    .from('task_video_files')
    .insert({
      task_id: input.taskId,
      filename: input.filename,
      r2_key: input.key,
      size_bytes: input.sizeBytes,
      content_type: input.contentType ?? null,
      uploaded_by: user.id,
      replaces_file_id: input.replacesFileId ?? null,
      sort_order: (maxOrder && maxOrder.length > 0 ? maxOrder[0].sort_order : 0) + 1,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('[completeTaskFileUpload]', error)
    return { error: 'Kunne ikke lagre filen' }
  }

  revalidatePath(`/admin/postprod/${input.projectId}`)
  return { file: data as TaskVideoFile }
}

export async function listTaskVideoFiles(taskId: string): Promise<TaskVideoFile[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('task_video_files')
    .select('*')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[listTaskVideoFiles]', error)
    return []
  }
  return (data ?? []) as TaskVideoFile[]
}

// Presignet GET-URL for forhåndsvisning i selve steget — internt, admin-only,
// generalisert fra recordDownload()-mønsteret i transfers.ts til å ikke kreve
// en transfers-rad (tar r2_key direkte via task_video_files).
export async function getTaskVideoFileSignedUrl(fileId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: file } = await supabase
    .from('task_video_files')
    .select('r2_key')
    .eq('id', fileId)
    .maybeSingle()

  if (!file) return null

  try {
    return await getSignedUrl(r2, new GetObjectCommand({ Bucket: R2_BUCKET, Key: file.r2_key }), { expiresIn: SIGNED_URL_EXPIRY })
  } catch (err) {
    console.error('[getTaskVideoFileSignedUrl]', err)
    return null
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors in `lib/actions/task-video-files.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/task-video-files.ts
git commit -m "Legg til server actions for opplasting og listing av postprod-filer"
```

---

### Task 6: `lib/actions/video-reviews.ts` — R2 storage support

**Files:**
- Modify: `lib/actions/video-reviews.ts:1-32` (imports + `VideoReview` type), `:54-79` (`createVideoReview`), `:108-131` (`loadReviewWithCommentsAndUrl`), `:382-421` (`getVideoForCustomer`)
- Modify: `app/admin/projects/[id]/video/VideoAdminClient.tsx:447` (call site)
- Modify: `app/admin/projects/[id]/selection/SelectionAdminClient.tsx:914` (call site)

**Interfaces:**
- Consumes: `video_reviews.storage_provider`/`r2_key`/`task_video_file_id` columns from Task 2.
- Produces: `createVideoReview(input: { projectId, title, galleryId?, albumId?, storageProvider?, storagePath?, r2Key?, taskVideoFileId? }): Promise<VideoReview>` — used by Task 7.

- [ ] **Step 1: Update the `VideoReview` type and imports**

In `lib/actions/video-reviews.ts`, add imports after line 4 (`import { createServiceClient } from '@/lib/supabase-server'`):

```ts
import { r2, R2_BUCKET } from '@/lib/r2'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
```

Replace the `VideoReview` type (lines 13-26):

```ts
export type VideoReview = {
  id: string
  project_id: string | null
  gallery_id: string | null
  album_id: string | null
  title: string
  storage_provider: 'supabase' | 'r2'
  storage_path: string | null
  r2_key: string | null
  task_video_file_id: string | null
  duration_seconds: number | null
  token: string
  pin_code: string
  status: 'open' | 'submitted'
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Add a shared signed-URL helper**

Add this function right after `cookieKey()` (after line 50), before the "Admin-funksjoner" section:

```ts
// Genererer en spillbar signert URL for en video review, uansett lagringskilde.
// R2-filer (postprod-opplastinger) og Supabase Storage-filer (eldre/andre
// video-reviews) bruker samme VideoReview-rad, kun storage_provider skiller dem.
async function getSignedUrlForReview(
  service: ReturnType<typeof createServiceClient>,
  review: VideoReview,
): Promise<string | null> {
  if (review.storage_provider === 'r2') {
    if (!review.r2_key) return null
    try {
      return await getSignedUrl(r2, new GetObjectCommand({ Bucket: R2_BUCKET, Key: review.r2_key }), { expiresIn: SIGNED_URL_EXPIRY })
    } catch (err) {
      console.error('[getSignedUrlForReview r2]', err)
      return null
    }
  }
  if (!review.storage_path) return null
  const { data, error } = await service.storage.from('videos').createSignedUrl(review.storage_path, SIGNED_URL_EXPIRY)
  if (error || !data?.signedUrl) return null
  return data.signedUrl
}
```

- [ ] **Step 3: Update `createVideoReview` to accept R2 input**

Replace the whole function (lines 54-79):

```ts
export async function createVideoReview(input: {
  projectId: string | null
  title: string
  galleryId?: string
  albumId?: string
  storageProvider?: 'supabase' | 'r2'
  storagePath?: string
  r2Key?: string
  taskVideoFileId?: string
}): Promise<VideoReview> {
  const service = createServiceClient()
  const provider = input.storageProvider ?? 'supabase'

  const { data, error } = await service
    .from('video_reviews')
    .insert({
      project_id: input.projectId,
      gallery_id: input.galleryId ?? null,
      album_id: input.albumId ?? null,
      title: input.title,
      storage_provider: provider,
      storage_path: provider === 'supabase' ? (input.storagePath ?? null) : null,
      r2_key: provider === 'r2' ? (input.r2Key ?? null) : null,
      task_video_file_id: input.taskVideoFileId ?? null,
      token: generateToken(),
      pin_code: generatePin(),
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Kunne ikke opprette video review')
  return data as VideoReview
}
```

- [ ] **Step 4: Update the two call sites**

In `app/admin/projects/[id]/video/VideoAdminClient.tsx:447-452`, replace:

```ts
      const review = await createVideoReview(
        projectId,
        newTitle.trim(),
        path,
        addToGallery && galleryId ? galleryId : undefined
      )
```

with:

```ts
      const review = await createVideoReview({
        projectId,
        title: newTitle.trim(),
        storageProvider: 'supabase',
        storagePath: path,
        galleryId: addToGallery && galleryId ? galleryId : undefined,
      })
```

In `app/admin/projects/[id]/selection/SelectionAdminClient.tsx:914`, replace:

```ts
await createVideoReview(linkedProjectId, title, path, galleryId, album.id)
```

with:

```ts
await createVideoReview({
  projectId: linkedProjectId,
  title,
  storageProvider: 'supabase',
  storagePath: path,
  galleryId,
  albumId: album.id,
})
```

- [ ] **Step 5: Update `loadReviewWithCommentsAndUrl` and `getVideoForCustomer` to use the helper**

In `loadReviewWithCommentsAndUrl` (lines 108-131), replace the body with:

```ts
async function loadReviewWithCommentsAndUrl(
  service: ReturnType<typeof createServiceClient>,
  review: VideoReview,
): Promise<{ review: VideoReview; comments: VideoComment[]; signedUrl: string } | null> {
  const [commentsResult, signedUrl] = await Promise.all([
    service
      .from('video_comments')
      .select('*')
      .eq('review_id', review.id)
      .order('timestamp_seconds', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    getSignedUrlForReview(service, review),
  ])

  if (!signedUrl) return null

  return {
    review,
    comments: (commentsResult.data ?? []) as VideoComment[],
    signedUrl,
  }
}
```

In `getVideoForCustomer` (lines 382-421), replace the `Promise.all` block that builds `commentsResult`/`signedUrlResult` with:

```ts
  const [commentsResult, signedUrl] = await Promise.all([
    service
      .from('video_comments')
      .select('*')
      .eq('review_id', reviewId)
      .order('timestamp_seconds', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    getSignedUrlForReview(service, review as VideoReview),
  ])

  if (!signedUrl) return null

  return {
    review: review as VideoReview,
    comments: (commentsResult.data ?? []) as VideoComment[],
    signedUrl,
  }
```

(Delete the old `signedUrlResult` variable and its `.error`/`.data?.signedUrl` checks — `getSignedUrlForReview` already returns `null` on failure.)

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors in `lib/actions/video-reviews.ts`, `VideoAdminClient.tsx`, or `SelectionAdminClient.tsx`.

- [ ] **Step 7: Manual verification of the untouched path**

Run: `npm run dev`, open an existing Supabase-Storage-backed video review from `/admin/projects/[id]/video` or the selection gallery flow, confirm it still plays at `/v/[token]` — this confirms the `storage_provider='supabase'` branch still works unchanged.

- [ ] **Step 8: Commit**

```bash
git add lib/actions/video-reviews.ts app/admin/projects/[id]/video/VideoAdminClient.tsx app/admin/projects/[id]/selection/SelectionAdminClient.tsx
git commit -m "Stott R2-lagrede filer i video_reviews ved siden av Supabase Storage"
```

---

### Task 7: `lib/actions/task-video-files.ts` — send til kunde

**Files:**
- Modify: `lib/actions/task-video-files.ts` (append)

**Interfaces:**
- Consumes: `createVideoReview()` from Task 6.
- Produces: `sendTaskFileToCustomer(input: { fileId: string; projectId: string; title: string }): Promise<{ ok: true; token: string } | { error: string }>`, `getLatestVideoReviewForFile(fileId: string): Promise<{ id: string; token: string; status: 'open' | 'submitted' } | null>` — both used by Task 11 (UI).

- [ ] **Step 1: Append the functions**

Add to `lib/actions/task-video-files.ts`, after `getTaskVideoFileSignedUrl`:

```ts
import { createVideoReview } from '@/lib/actions/video-reviews'

// Sender en opplastet fil til kunden for tidsankret kommentering på /v/[token] —
// gjenbruker video-review-systemet, bare med R2 som lagringskilde (spec
// §Send til kunde). Helt uavhengig av sendTaskFileToColleague under.
export async function sendTaskFileToCustomer(input: {
  fileId: string
  projectId: string
  title: string
}): Promise<{ ok: true; token: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke autentisert' }

  const { data: file, error } = await supabase
    .from('task_video_files')
    .select('id, r2_key')
    .eq('id', input.fileId)
    .single()

  if (error || !file) return { error: 'Fant ikke filen' }

  try {
    const review = await createVideoReview({
      projectId: input.projectId,
      title: input.title,
      storageProvider: 'r2',
      r2Key: file.r2_key,
      taskVideoFileId: file.id,
    })
    return { ok: true, token: review.token }
  } catch (err) {
    console.error('[sendTaskFileToCustomer]', err)
    return { error: 'Kunne ikke sende filen til kunden' }
  }
}

export async function getLatestVideoReviewForFile(fileId: string): Promise<{
  id: string
  token: string
  status: 'open' | 'submitted'
} | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('video_reviews')
    .select('id, token, status')
    .eq('task_video_file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[getLatestVideoReviewForFile]', error)
    return null
  }
  return data
}
```

Move the `import { createVideoReview } from '@/lib/actions/video-reviews'` line up to the top of the file with the other imports (server action files conventionally group all imports at the top — keep this consistent with the rest of the codebase).

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/task-video-files.ts
git commit -m "Legg til send-til-kunde-handling for postprod-filer"
```

---

### Task 8: `lib/actions/task-video-files.ts` — send til kollega

**Files:**
- Modify: `lib/actions/task-video-files.ts` (append)

**Interfaces:**
- Consumes: `notifyAssignment` from `lib/notify-assignment.ts`; `gallery_reviews.task_video_file_id` from Task 3; `GalleryReview` type from Task 4.
- Produces: `requestTaskFileReview(fileId, reviewerId, dueDate?): Promise<{ ok: boolean; error?: string }>`, `respondToTaskFileReview(reviewId, decision, comment?): Promise<{ ok: boolean; error?: string }>`, `getLatestTaskFileReview(fileId): Promise<TaskFileReview | null>`, `getTaskFileForInternalReview(reviewId): Promise<{...} | null>` — used by Task 11 (list button) and Task 13 (review page).

- [ ] **Step 1: Append the functions**

Add to `lib/actions/task-video-files.ts`, after the send-to-customer functions from Task 7:

```ts
import { revalidatePath } from 'next/cache' // already imported at top from Task 5 — do not duplicate
import { notifyAssignment } from '@/lib/notify-assignment'

export type TaskFileReview = {
  id: string
  status: 'pending' | 'approved' | 'changes_requested'
  comment: string | null
  reviewer_id: string
  requested_by: string
  created_at: string
}

// Intern kollega-godkjenning av en opplastet fil — samme mekanikk som
// requestGalleryReview() i lib/actions/gallery-reviews.ts (admin_tasks +
// waiting_review-status), men trigget fra task_video_files i stedet for et
// galleri. Skrevet som en egen funksjon fremfor å gjøre om den eksisterende,
// for å ikke røre den fungerende galleri-reviewflyten (spec §Send til kollega).
export async function requestTaskFileReview(
  fileId: string,
  reviewerId: string,
  dueDate?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: file, error: fileError } = await supabase
      .from('task_video_files')
      .select('id, task_id, filename')
      .eq('id', fileId)
      .single()

    if (fileError || !file) return { ok: false, error: 'Fant ikke filen' }

    const { data: task } = await supabase
      .from('tasks')
      .select('id, project_id, title')
      .eq('id', file.task_id)
      .single()

    let projectTitle: string | null = null
    if (task?.project_id) {
      const { data: project } = await supabase
        .from('projects')
        .select('title')
        .eq('id', task.project_id)
        .maybeSingle()
      projectTitle = project?.title ?? null
    }

    if (task) {
      await supabase
        .from('tasks')
        .update({ status: 'waiting_review', updated_at: new Date().toISOString() })
        .eq('id', task.id)
    }

    const { data: maxOrder } = await supabase
      .from('admin_tasks')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)

    const { data: adminTask, error: adminTaskError } = await supabase
      .from('admin_tasks')
      .insert({
        title: projectTitle ? `Gjennomgå ${file.filename} — ${projectTitle}` : `Gjennomgå ${file.filename}`,
        description: `Intern review av opplastet fil på steget "${task?.title ?? ''}". Åpne fra varselet i /admin/varsler.`,
        assignee_id: reviewerId,
        due_date: dueDate || null,
        sort_order: (maxOrder && maxOrder.length > 0 ? maxOrder[0].sort_order : 0) + 1,
        created_by: user.id,
        project_id: task?.project_id ?? null,
      })
      .select('id')
      .single()

    if (adminTaskError) console.error('requestTaskFileReview admin_task insert error:', adminTaskError)

    const { data: review, error: insertError } = await supabase
      .from('gallery_reviews')
      .insert({
        gallery_id: null,
        task_video_file_id: fileId,
        status: 'pending',
        requested_by: user.id,
        reviewer_id: reviewerId,
        admin_task_id: adminTask?.id ?? null,
        task_id: task?.id ?? null,
      })
      .select('id')
      .single()

    if (insertError || !review) {
      console.error('requestTaskFileReview insert error:', insertError)
      return { ok: false, error: 'Kunne ikke sende til review' }
    }

    await notifyAssignment({
      recipientId: reviewerId,
      type: 'gallery_review_requested',
      projectId: task?.project_id ?? null,
      galleryReviewId: review.id,
      preview: projectTitle
        ? `Ber deg gjennomgå "${file.filename}" for "${projectTitle}"`
        : `Ber deg gjennomgå "${file.filename}"`,
    })

    revalidatePath('/admin/internal')
    if (task?.project_id) revalidatePath(`/admin/postprod/${task.project_id}`)
    return { ok: true }
  } catch (err) {
    console.error('requestTaskFileReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function respondToTaskFileReview(
  reviewId: string,
  decision: 'approved' | 'changes_requested',
  comment?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: review, error: fetchError } = await supabase
      .from('gallery_reviews')
      .select('id, task_video_file_id, requested_by, reviewer_id, admin_task_id, task_id')
      .eq('id', reviewId)
      .single()

    if (fetchError || !review || !review.task_video_file_id) return { ok: false, error: 'Fant ikke review-forespørselen' }

    if (user.id !== review.reviewer_id) {
      return { ok: false, error: 'Du er ikke satt som reviewer for denne forespørselen' }
    }

    if (decision === 'changes_requested' && !comment?.trim()) {
      return { ok: false, error: 'Kommentar er påkrevd når du ber om endringer' }
    }

    const { error: updateError } = await supabase
      .from('gallery_reviews')
      .update({ status: decision, comment: comment?.trim() || null, responded_at: new Date().toISOString() })
      .eq('id', reviewId)

    if (updateError) {
      console.error('respondToTaskFileReview update error:', updateError)
      return { ok: false, error: 'Kunne ikke lagre svaret' }
    }

    if (review.admin_task_id) {
      await supabase.from('admin_tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', review.admin_task_id)
    }

    if (review.task_id) {
      await supabase.from('tasks').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', review.task_id)
    }

    const { data: file } = await supabase
      .from('task_video_files')
      .select('task_id')
      .eq('id', review.task_video_file_id)
      .maybeSingle()

    let projectId: string | null = null
    if (file?.task_id) {
      const { data: task } = await supabase.from('tasks').select('project_id').eq('id', file.task_id).maybeSingle()
      projectId = task?.project_id ?? null
    }

    const preview = decision === 'approved'
      ? 'Godkjente filen'
      : `Ba om endringer på filen${comment ? `: ${comment}` : ''}`

    await notifyAssignment({
      recipientId: review.requested_by,
      type: 'gallery_review_responded',
      projectId,
      galleryReviewId: reviewId,
      preview,
    })

    revalidatePath('/admin/internal')
    if (projectId) revalidatePath(`/admin/postprod/${projectId}`)
    return { ok: true }
  } catch (err) {
    console.error('respondToTaskFileReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function getLatestTaskFileReview(fileId: string): Promise<TaskFileReview | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gallery_reviews')
    .select('id, status, comment, reviewer_id, requested_by, created_at')
    .eq('task_video_file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[getLatestTaskFileReview]', error)
    return null
  }
  return data as TaskFileReview | null
}

// For /admin/task-file-reviews/[reviewId] — henter alt reviewsiden trenger i ett kall.
export async function getTaskFileForInternalReview(reviewId: string): Promise<{
  review: TaskFileReview
  file: TaskVideoFile
  taskTitle: string
  projectTitle: string | null
  signedUrl: string
} | null> {
  const supabase = await createClient()
  const { data: reviewRow, error } = await supabase
    .from('gallery_reviews')
    .select('id, status, comment, reviewer_id, requested_by, created_at, task_video_file_id')
    .eq('id', reviewId)
    .maybeSingle()

  if (error || !reviewRow || !reviewRow.task_video_file_id) return null

  const { data: file } = await supabase
    .from('task_video_files')
    .select('*')
    .eq('id', reviewRow.task_video_file_id)
    .maybeSingle()

  if (!file) return null

  const { data: task } = await supabase
    .from('tasks')
    .select('title, project_id')
    .eq('id', file.task_id)
    .maybeSingle()

  let projectTitle: string | null = null
  if (task?.project_id) {
    const { data: project } = await supabase.from('projects').select('title').eq('id', task.project_id).maybeSingle()
    projectTitle = project?.title ?? null
  }

  const signedUrl = await getTaskVideoFileSignedUrl(file.id)
  if (!signedUrl) return null

  return {
    review: reviewRow as TaskFileReview,
    file: file as TaskVideoFile,
    taskTitle: task?.title ?? '',
    projectTitle,
    signedUrl,
  }
}
```

Move `import { revalidatePath } from 'next/cache'` and `import { notifyAssignment } from '@/lib/notify-assignment'` up to the top imports block alongside the others (avoid duplicate/inline imports — this step's code block shows them near point-of-use only to make the diff easy to place; the final file must have exactly one import block at the top).

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/task-video-files.ts
git commit -m "Legg til send-til-kollega-handling for postprod-filer"
```

---

### Task 9: Extract shared R2 upload helper

**Files:**
- Create: `lib/r2-upload-client.ts`
- Modify: `app/admin/transfers/new/TransferUploadClient.tsx:15-63` (remove local copy, import shared one)

**Interfaces:**
- Produces: `uploadFileToR2(file: File, key: string, uploadId: string, partSize: number, onProgress: (pct: number) => void): Promise<{ ETag: string; PartNumber: number }[]>` — used by `TransferUploadClient.tsx` (existing caller, unchanged behavior) and Task 10 (new caller).

This is a pure extraction — no behavior change. `uploadFileToR2` is client-safe (calls two server actions plus `fetch`, but is itself a plain browser function), so it moves to a non-`'use server'` module.

- [ ] **Step 1: Create the shared module**

```ts
// lib/r2-upload-client.ts
// Klient-side hjelpefunksjon for å laste opp en fil til R2 som en multipart-
// opplasting, rett fra nettleseren (filbitene går aldri innom Next.js-serveren
// — nødvendig for filer i GB/TB-klassen). Brukes av både leveranser
// (TransferUploadClient) og postprod-filopplasting (TaskVideoFiles).
import { getUploadPartUrl } from '@/lib/actions/transfers'

export async function uploadFileToR2(
  file: File,
  key: string,
  uploadId: string,
  partSize: number,
  onProgress: (pct: number) => void
): Promise<{ ETag: string; PartNumber: number }[]> {
  const totalParts = Math.max(1, Math.ceil(file.size / partSize))
  const parts: { ETag: string; PartNumber: number }[] = new Array(totalParts)
  const uploadedPerPart = new Array(totalParts).fill(0)
  const CONCURRENCY = 4
  let nextIndex = 0

  const reportProgress = () => {
    const uploaded = uploadedPerPart.reduce((a, b) => a + b, 0)
    onProgress(Math.min(99, (uploaded / file.size) * 100))
  }

  const worker = async () => {
    while (nextIndex < totalParts) {
      const i = nextIndex++
      const partNumber = i + 1
      const start = i * partSize
      const end = Math.min(start + partSize, file.size)
      const blob = file.slice(start, end)

      const urlResult = await getUploadPartUrl({ key, uploadId, partNumber })
      if ('error' in urlResult) throw new Error(urlResult.error)

      const res = await fetch(urlResult.url, { method: 'PUT', body: blob })
      if (!res.ok) throw new Error(`Opplasting av del ${partNumber} feilet (${res.status})`)
      const etag = res.headers.get('ETag')
      if (!etag) {
        throw new Error('Mangler ETag i svaret fra R2 — CORS-policyen på bucketen må inkludere "ExposeHeaders": ["ETag"]')
      }

      parts[i] = { ETag: etag, PartNumber: partNumber }
      uploadedPerPart[i] = end - start
      reportProgress()
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalParts) }, worker))
  return parts
}
```

- [ ] **Step 2: Update `TransferUploadClient.tsx` to use it**

Delete lines 15-63 of `app/admin/transfers/new/TransferUploadClient.tsx` (the local `uploadFileToR2` function and its leading comment). Add this import near the top with the other local imports (after `import { createTransfer, initiateUpload, getUploadPartUrl, completeUpload, abortUpload } from '@/lib/actions/transfers'`):

```ts
import { uploadFileToR2 } from '@/lib/r2-upload-client'
```

`getUploadPartUrl` remains imported from `@/lib/actions/transfers` in this file for other uses if any — check the file after deletion; if `getUploadPartUrl` is no longer referenced directly in `TransferUploadClient.tsx` (it's now only used inside `uploadFileToR2` itself), remove it from that import line to avoid an unused-import lint error.

- [ ] **Step 3: Verify it compiles and lints**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, no unused-import warnings.

- [ ] **Step 4: Manual regression check**

Run: `npm run dev`, go to `/admin/transfers/new`, upload a small test file, confirm the progress bar still works and the transfer completes (this is the existing, already-shipped flow — must be unaffected by the extraction).

- [ ] **Step 5: Commit**

```bash
git add lib/r2-upload-client.ts app/admin/transfers/new/TransferUploadClient.tsx
git commit -m "Skill ut delt R2-multipart-opplastingshjelper fra TransferUploadClient"
```

---

### Task 10: `components/postprod/TaskVideoFilePreview.tsx`

**Files:**
- Create: `components/postprod/TaskVideoFilePreview.tsx`

**Interfaces:**
- Consumes: `getTaskVideoFileSignedUrl(fileId)` from Task 5.
- Produces: `<TaskVideoFilePreview fileId={string} />` — used by Task 11.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { getTaskVideoFileSignedUrl } from '@/lib/actions/task-video-files'
import { C } from '@/lib/admin-theme'

// Enkel forhåndsvisningsspiller for en opplastet postprod-fil — internt,
// admin-only, uten PIN eller kommentarfelt (det hører til /v/[token]-siden
// når filen er sendt til kunde). Se spec §Forhåndsvisning.
export function TaskVideoFilePreview({ fileId }: { fileId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setError(false)
    getTaskVideoFileSignedUrl(fileId).then(u => {
      if (cancelled) return
      if (u) setUrl(u)
      else setError(true)
    })
    return () => { cancelled = true }
  }, [fileId])

  if (error) {
    return (
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger, padding: '10px 0' }}>
        Kunne ikke laste forhåndsvisning
      </p>
    )
  }

  if (!url) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.surface2, borderRadius: 8 }}>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster forhåndsvisning...</span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- internt admin-verktøy, ikke kundevendt innhold
    <video controls src={url} style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: 420, display: 'block' }} />
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/postprod/TaskVideoFilePreview.tsx
git commit -m "Legg til forhandsvisningskomponent for postprod-videofiler"
```

---

### Task 11: `components/postprod/TaskVideoFiles.tsx`

**Files:**
- Create: `components/postprod/TaskVideoFiles.tsx`

**Interfaces:**
- Consumes: `initiateTaskFileUpload`, `completeTaskFileUpload`, `listTaskVideoFiles`, `sendTaskFileToCustomer`, `getLatestVideoReviewForFile`, `requestTaskFileReview`, `getLatestTaskFileReview`, `TaskVideoFile`, `TaskFileReview` from `lib/actions/task-video-files.ts`; `abortUpload` from `lib/actions/transfers.ts`; `uploadFileToR2` from `lib/r2-upload-client.ts`; `getAllProfiles` from `lib/actions/pipeline.ts`; `formatFileSize` from `lib/utils/file-size.ts`; `TaskVideoFilePreview` from Task 10.
- Produces: `<TaskVideoFiles taskId={string} projectId={string} taskTitle={string} readOnly={boolean} />` — mounted by Task 12.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useEffect, useState, useRef } from 'react'
import {
  initiateTaskFileUpload, completeTaskFileUpload, listTaskVideoFiles,
  sendTaskFileToCustomer, getLatestVideoReviewForFile,
  requestTaskFileReview, getLatestTaskFileReview,
} from '@/lib/actions/task-video-files'
import type { TaskVideoFile, TaskFileReview } from '@/lib/actions/task-video-files'
import { abortUpload } from '@/lib/actions/transfers'
import { uploadFileToR2 } from '@/lib/r2-upload-client'
import { getAllProfiles } from '@/lib/actions/pipeline'
import { formatFileSize } from '@/lib/utils/file-size'
import { TaskVideoFilePreview } from './TaskVideoFilePreview'
import { C } from '@/lib/admin-theme'

type Profile = { id: string; name: string | null; email: string; color: string | null; phone: string | null }

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; filename: string; progress: number }
  | { phase: 'error'; message: string }

// Grupperer den flate fil-listen i versjonskjeder: nyeste versjon øverst,
// eldre versjoner i historikk under (spec §Datamodell — replaces_file_id).
function buildChains(files: TaskVideoFile[]): TaskVideoFile[][] {
  const byId = new Map(files.map(f => [f.id, f]))
  const superseded = new Set(files.map(f => f.replaces_file_id).filter((id): id is string => !!id))
  const latestFiles = files.filter(f => !superseded.has(f.id))

  return latestFiles
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(latest => {
      const chain: TaskVideoFile[] = [latest]
      let current = latest
      while (current.replaces_file_id) {
        const prev = byId.get(current.replaces_file_id)
        if (!prev) break
        chain.push(prev)
        current = prev
      }
      return chain
    })
}

export function TaskVideoFiles({
  taskId, projectId, taskTitle, readOnly,
}: {
  taskId: string
  projectId: string
  taskTitle: string
  readOnly: boolean
}) {
  const [files, setFiles] = useState<TaskVideoFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' })
  const [replacesFileId, setReplacesFileId] = useState<string | null>(null)
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null)
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    setFiles(await listTaskVideoFiles(taskId))
    setLoading(false)
  }

  useEffect(() => { refresh() }, [taskId])

  async function handleFileSelected(file: File, asReplacesId: string | null) {
    setUploadState({ phase: 'uploading', filename: file.name, progress: 0 })
    let uploadKey: string | undefined
    let uploadId: string | undefined

    try {
      const initResult = await initiateTaskFileUpload({ taskId, filename: file.name, contentType: file.type || undefined })
      if ('error' in initResult) {
        setUploadState({ phase: 'error', message: initResult.error })
        return
      }
      uploadKey = initResult.key
      uploadId = initResult.uploadId

      const parts = await uploadFileToR2(file, initResult.key, initResult.uploadId, initResult.partSize, (pct) => {
        setUploadState({ phase: 'uploading', filename: file.name, progress: pct })
      })

      const result = await completeTaskFileUpload({
        taskId,
        projectId,
        key: initResult.key,
        uploadId: initResult.uploadId,
        parts,
        filename: file.name,
        sizeBytes: file.size,
        contentType: file.type || undefined,
        replacesFileId: asReplacesId ?? undefined,
      })

      if ('error' in result) {
        setUploadState({ phase: 'error', message: result.error })
        return
      }

      setUploadState({ phase: 'idle' })
      setReplacesFileId(null)
      await refresh()
    } catch (err) {
      if (uploadKey && uploadId) abortUpload({ key: uploadKey, uploadId }).catch(() => {})
      setUploadState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  function openFilePicker(asReplacesId: string | null) {
    setReplacesFileId(asReplacesId)
    fileInputRef.current?.click()
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) handleFileSelected(file, replacesFileId)
  }

  const chains = buildChains(files)

  return (
    <div style={{ marginBottom: 24 }}>
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={onFileInputChange} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Filer i dette steget
        </label>
        {!readOnly && (
          <button
            onClick={() => openFilePicker(null)}
            disabled={uploadState.phase === 'uploading'}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
              color: C.accent, background: C.accentBg, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '5px 10px', cursor: uploadState.phase === 'uploading' ? 'default' : 'pointer',
              opacity: uploadState.phase === 'uploading' ? 0.5 : 1,
            }}
          >
            + Last opp fil
          </button>
        )}
      </div>

      {uploadState.phase === 'uploading' && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, marginBottom: 6 }}>
            {uploadState.filename}
          </p>
          <div style={{ height: 4, background: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${uploadState.progress}%`, background: C.accent, transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      {uploadState.phase === 'error' && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 8 }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.danger }}>{uploadState.message}</p>
        </div>
      )}

      {!loading && chains.length === 0 && uploadState.phase === 'idle' && (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.text3 }}>
          Ingen filer lastet opp ennå.
        </p>
      )}

      {chains.map(chain => {
        const latest = chain[0]
        const older = chain.slice(1)
        return (
          <TaskFileRow
            key={latest.id}
            file={latest}
            olderVersions={older}
            projectId={projectId}
            taskTitle={taskTitle}
            readOnly={readOnly}
            expanded={expandedFileId === latest.id}
            onToggleExpand={() => setExpandedFileId(id => id === latest.id ? null : latest.id)}
            showHistory={showHistoryFor === latest.id}
            onToggleHistory={() => setShowHistoryFor(id => id === latest.id ? null : latest.id)}
            onUploadNewVersion={() => openFilePicker(latest.id)}
          />
        )
      })}
    </div>
  )
}

function TaskFileRow({
  file, olderVersions, projectId, taskTitle, readOnly,
  expanded, onToggleExpand, showHistory, onToggleHistory, onUploadNewVersion,
}: {
  file: TaskVideoFile
  olderVersions: TaskVideoFile[]
  projectId: string
  taskTitle: string
  readOnly: boolean
  expanded: boolean
  onToggleExpand: () => void
  showHistory: boolean
  onToggleHistory: () => void
  onUploadNewVersion: () => void
}) {
  const [customerReview, setCustomerReview] = useState<{ id: string; token: string; status: 'open' | 'submitted' } | null>(null)
  const [colleagueReview, setColleagueReview] = useState<TaskFileReview | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pickingReviewer, setPickingReviewer] = useState(false)
  const [reviewerId, setReviewerId] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    getLatestVideoReviewForFile(file.id).then(setCustomerReview)
    getLatestTaskFileReview(file.id).then(setColleagueReview)
  }, [file.id])

  async function handleSendToCustomer() {
    setSending(true)
    const result = await sendTaskFileToCustomer({ fileId: file.id, projectId, title: `${taskTitle} — ${file.filename}` })
    setSending(false)
    if ('error' in result) { alert(result.error); return }
    setCustomerReview({ id: '', token: result.token, status: 'open' })
  }

  async function handleSendToColleague() {
    if (!reviewerId) return
    setSending(true)
    const result = await requestTaskFileReview(file.id, reviewerId)
    setSending(false)
    if (!result.ok) { alert(result.error ?? 'Noe gikk galt'); return }
    setColleagueReview(await getLatestTaskFileReview(file.id))
    setPickingReviewer(false)
    setReviewerId('')
  }

  function openReviewerPicker() {
    if (profiles.length === 0) getAllProfiles().then(setProfiles)
    setPickingReviewer(true)
  }

  const colleagueStatusLabel = colleagueReview
    ? colleagueReview.status === 'pending' ? 'Venter på kollega-godkjenning'
      : colleagueReview.status === 'approved' ? 'Godkjent av kollega'
      : 'Endringer ønsket'
    : null

  return (
    <div style={{ marginBottom: 12, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={onToggleExpand}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, fontWeight: 600, textAlign: 'left', flex: 1, minWidth: 160 }}
        >
          {expanded ? '▾' : '▸'} {file.filename}
        </button>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
          {formatFileSize(file.size_bytes)}
        </span>
        {colleagueStatusLabel && (
          <span style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.66rem', padding: '2px 8px', borderRadius: 10,
            background: colleagueReview?.status === 'approved' ? 'rgba(76,175,125,0.12)' : colleagueReview?.status === 'changes_requested' ? 'rgba(212,100,90,0.12)' : 'rgba(196,148,52,0.12)',
            color: colleagueReview?.status === 'approved' ? C.success : colleagueReview?.status === 'changes_requested' ? C.danger : '#C49434',
          }}>
            {colleagueStatusLabel}
          </span>
        )}
        {customerReview && (
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.66rem', padding: '2px 8px', borderRadius: 10, background: 'rgba(124,92,252,0.12)', color: C.accent }}>
            {customerReview.status === 'submitted' ? 'Tilbakemelding mottatt' : 'Venter på kundetilbakemelding'}
          </span>
        )}
        {olderVersions.length > 0 && (
          <button
            onClick={onToggleHistory}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, textDecoration: 'underline' }}
          >
            {showHistory ? 'Skjul' : `${olderVersions.length} tidligere versjon${olderVersions.length > 1 ? 'er' : ''}`}
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          <TaskVideoFilePreview fileId={file.id} />

          {!readOnly && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                onClick={onUploadNewVersion}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: C.text2, border: `1px solid ${C.border}` }}
              >
                Ny versjon
              </button>
              <button
                onClick={handleSendToCustomer}
                disabled={sending || !!customerReview}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: sending || customerReview ? 'default' : 'pointer', background: customerReview ? C.surface2 : C.accent, color: customerReview ? C.text3 : '#fff', border: 'none', opacity: sending ? 0.6 : 1 }}
              >
                {customerReview ? 'Sendt til kunde ✓' : 'Send til kunde'}
              </button>
              {!colleagueReview || colleagueReview.status === 'changes_requested' ? (
                <button
                  onClick={openReviewerPicker}
                  disabled={sending}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: sending ? 'default' : 'pointer', background: 'transparent', color: C.text2, border: `1px solid ${C.border}`, opacity: sending ? 0.6 : 1 }}
                >
                  Send til kollega
                </button>
              ) : null}
            </div>
          )}

          {customerReview?.token && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 8 }}>
              Kundelenke: {typeof window !== 'undefined' ? `${window.location.origin}/v/${customerReview.token}` : `/v/${customerReview.token}`}
            </p>
          )}

          {pickingReviewer && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <select
                value={reviewerId}
                onChange={e => setReviewerId(e.target.value)}
                style={{ width: '100%', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, marginBottom: 8 }}
              >
                <option value="">Velg kollega...</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleSendToColleague}
                  disabled={!reviewerId || sending}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: reviewerId ? 'pointer' : 'default', background: C.accent, color: '#fff', border: 'none', opacity: reviewerId ? 1 : 0.5 }}
                >
                  Send
                </button>
                <button
                  onClick={() => { setPickingReviewer(false); setReviewerId('') }}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'none', color: C.text3, border: `1px solid ${C.border}` }}
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}

          {showHistory && olderVersions.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              {olderVersions.map(v => (
                <div key={v.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem', color: C.text3 }}>
                  <span>{v.filename}</span>
                  <span>{formatFileSize(v.size_bytes)}</span>
                  <span>{new Date(v.created_at).toLocaleDateString('nb-NO')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/postprod/TaskVideoFiles.tsx
git commit -m "Legg til filliste-komponent med versjonering og send-knapper for postprod"
```

---

### Task 12: Wire `TaskVideoFiles` into the postprod page

**Files:**
- Modify: `app/admin/postprod/[id]/page.tsx:36-65` (add `VIDEO_FILE_STEPS` const, keep `TASK_LINK_FIELDS`/`getExtraLinks` as-is), `:1572-1710` (replace editable rendering for the four video steps and Logging)

**Interfaces:**
- Consumes: `<TaskVideoFiles>` from Task 11.

- [ ] **Step 1: Add the import and the step-name constant**

Add to the import block near line 30 (after `import { ProjectDocuments } from '@/components/project/ProjectDocuments'`):

```ts
import { TaskVideoFiles } from '@/components/postprod/TaskVideoFiles'
```

Add right after the `TASK_LINK_FIELDS` constant (after line 54, before `getExtraLinks`):

```ts
// Stegene som fikk filopplasting i stedet for lim-inn-lenke (spec §Omfang).
// Selektering/Redigering (bilder) og Logging (bruker Filer-widgeten på
// prosjektsiden i stedet, se rendering under) er bevisst IKKE med her.
const VIDEO_FILE_STEPS = ['Grovklipp', 'Farger', 'Lyd', 'Klipp']
```

- [ ] **Step 2: Replace the editable rendering block**

Replace the whole span from the `{/* Task links ... */}` comment through the end of the extra-links IIFE (lines 1572-1710 as read during planning — re-locate by searching for `TASK_LINK_FIELDS[selectedTask.title]` in the current file before editing, since line numbers may have drifted from earlier tasks in this plan) with:

```tsx
              {/* Filer i steget (video) / arkiverte lenker — erstatter de gamle
                  redigerbare lenkefeltene for Grovklipp/Farger/Lyd/Klipp
                  (spec docs/superpowers/specs/2026-09-21-postprod-video-file-upload-design.md).
                  TASK_LINK_FIELDS/getExtraLinks lever videre uendret for
                  priorStages-referansepanelet og for andre steger. */}
              {VIDEO_FILE_STEPS.includes(selectedTask.title) ? (
                <TaskVideoFiles
                  taskId={selectedTask.id}
                  projectId={projectId}
                  taskTitle={selectedTask.title}
                  readOnly={readOnly}
                />
              ) : selectedTask.title === 'Logging' ? (
                <div style={{ marginBottom: 24, padding: '12px 14px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>
                    Last opp loggede prosjektfiler via «Filer»-seksjonen øverst på siden — de tilhører prosjektet, ikke selve steget.
                  </p>
                </div>
              ) : null}

              {/* Arkiverte lenker fra før filopplasting ble innført — kun visning,
                  ikke lenger redigerbare, for å unngå datatap på pågående prosjekter. */}
              {(() => {
                const linkFields = TASK_LINK_FIELDS[selectedTask.title] ?? []
                const currentData = taskData[selectedTask.id] ?? {}
                const archivedLinks = linkFields.filter(f => currentData[f.key]).map(f => ({ label: f.label, value: currentData[f.key] }))
                const archivedExtra = getExtraLinks(currentData)
                if (archivedLinks.length === 0 && archivedExtra.length === 0) return null
                return (
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      Arkiverte lenker
                    </label>
                    {archivedLinks.map(l => (
                      <div key={l.label} style={{ marginBottom: 6 }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>{l.label}: </span>
                        <a href={l.value} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.accent }}>{l.value}</a>
                      </div>
                    ))}
                    {archivedExtra.map((val, i) => (
                      <div key={i} style={{ marginBottom: 6 }}>
                        <a href={val} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.accent }}>{val}</a>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Ekstra lenker — uendret for alle steg UTENOM de fire video-filstegene,
                  som nå bruker filopplasting i stedet (feedback d369f2ca for opprinnelig
                  begrunnelse; se spec for hvorfor video-stegene ble unntatt). */}
              {!VIDEO_FILE_STEPS.includes(selectedTask.title) && (() => {
                const currentData = taskData[selectedTask.id] ?? {}
                const extraLinks = getExtraLinks(currentData)
                return (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Ekstra lenker
                      </label>
                      <button
                        onClick={() => handleAddExtraLink(selectedTask.id)}
                        disabled={readOnly}
                        style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                          color: C.accent, background: C.accentBg,
                          border: `1px solid rgba(124,92,252,0.25)`, borderRadius: 6,
                          padding: '5px 10px', cursor: readOnly ? 'default' : 'pointer',
                          opacity: readOnly ? 0.5 : 1,
                        }}
                      >
                        + Legg til lenke
                      </button>
                    </div>
                    {extraLinks.map((val, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                        <input
                          type="text"
                          value={val}
                          onChange={e => handleExtraLinkChange(selectedTask.id, i, e.target.value)}
                          placeholder="https://..."
                          style={{
                            flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
                            color: C.text, background: C.surface,
                            border: `1px solid ${C.border}`, borderRadius: 7,
                            padding: '8px 12px', outline: 'none',
                            transition: 'border-color 0.15s',
                          }}
                          onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                          onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                        />
                        {val && (
                          <a
                            href={val}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500,
                              color: C.accent, textDecoration: 'none',
                              padding: '7px 11px', borderRadius: 6, flexShrink: 0,
                              background: C.accentBg, border: `1px solid rgba(124,92,252,0.25)`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Åpne ↗
                          </a>
                        )}
                        <button
                          onClick={() => handleRemoveExtraLink(selectedTask.id, i)}
                          disabled={readOnly}
                          style={{
                            width: 30, height: 30, flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1rem', color: C.text3, background: 'transparent',
                            border: `1px solid ${C.border}`, borderRadius: 6,
                            cursor: readOnly ? 'default' : 'pointer',
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })()}
```

(The `Ekstra lenker` block above is the pre-existing code, unchanged except for the new `!VIDEO_FILE_STEPS.includes(...)` guard wrapped around the IIFE call.)

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open a video-project in `/admin/postprod/[id]`, select "Grovklipp" and confirm the new "Filer i dette steget" section renders with an upload button and no leftover editable link inputs. Select "Logging" and confirm the new note renders instead of the old link input. Select any photo step (e.g. "Selektering" on a photo project) and confirm nothing changed there.

- [ ] **Step 4: Commit**

```bash
git add app/admin/postprod/[id]/page.tsx
git commit -m "Bytt lenkefelt med filopplasting pa video-postprod-stegene"
```

---

### Task 13: Kollega-reviewside for opplastede filer

**Files:**
- Create: `app/admin/task-file-reviews/[reviewId]/page.tsx`
- Create: `app/admin/task-file-reviews/[reviewId]/TaskFileReviewClient.tsx`

**Interfaces:**
- Consumes: `getTaskFileForInternalReview`, `respondToTaskFileReview` from Task 8.

- [ ] **Step 1: Write the server page**

```tsx
// app/admin/task-file-reviews/[reviewId]/page.tsx
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getTaskFileForInternalReview } from '@/lib/actions/task-video-files'
import TaskFileReviewClient from './TaskFileReviewClient'

export default async function TaskFileReviewPage({
  params,
}: {
  params: Promise<{ reviewId: string }>
}) {
  const { reviewId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await getTaskFileForInternalReview(reviewId)
  if (!data) notFound()

  return <TaskFileReviewClient reviewId={reviewId} data={data} />
}
```

- [ ] **Step 2: Write the client component**

```tsx
// app/admin/task-file-reviews/[reviewId]/TaskFileReviewClient.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { respondToTaskFileReview } from '@/lib/actions/task-video-files'
import type { TaskVideoFile, TaskFileReview } from '@/lib/actions/task-video-files'
import { formatFileSize } from '@/lib/utils/file-size'
import { C } from '@/lib/admin-theme'

export default function TaskFileReviewClient({
  reviewId,
  data,
}: {
  reviewId: string
  data: { review: TaskFileReview; file: TaskVideoFile; taskTitle: string; projectTitle: string | null; signedUrl: string }
}) {
  const router = useRouter()
  const { review, file, taskTitle, projectTitle, signedUrl } = data
  const [comment, setComment] = useState(review.comment ?? '')
  const [submitting, setSubmitting] = useState<'approved' | 'changes_requested' | null>(null)
  const [done, setDone] = useState<'approved' | 'changes_requested' | null>(review.status !== 'pending' ? (review.status as 'approved' | 'changes_requested') : null)

  async function handleDecision(decision: 'approved' | 'changes_requested') {
    if (decision === 'changes_requested' && !comment.trim()) {
      alert('Skriv en kommentar før du ber om endringer')
      return
    }
    setSubmitting(decision)
    const result = await respondToTaskFileReview(reviewId, decision, comment)
    setSubmitting(null)
    if (result.ok) setDone(decision)
    else alert(result.error ?? 'Noe gikk galt')
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.1rem', fontWeight: 700, color: C.text, marginBottom: 8 }}>
            {done === 'approved' ? 'Godkjent' : 'Endringer sendt'}
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>
            {done === 'approved'
              ? 'Avsenderen har fått beskjed om at filen er godkjent.'
              : 'Avsenderen har fått beskjed om kommentarene dine.'}
          </p>
          <button
            onClick={() => router.push('/admin/internal')}
            style={{ marginTop: 16, padding: '8px 16px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', cursor: 'pointer' }}
          >
            Til oppgavelisten
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 120 }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '14px 20px' }}>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 700, color: C.text }}>
          {file.filename}
        </h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginTop: 2 }}>
          {taskTitle}{projectTitle ? ` — ${projectTitle}` : ''} · {formatFileSize(file.size_bytes)}
        </p>
      </div>

      <div style={{ maxWidth: 900, margin: '24px auto', padding: '0 20px' }}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- internt admin-verktøy */}
        <video controls src={signedUrl} style={{ width: '100%', borderRadius: 10, background: '#000' }} />
      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: '12px 24px', display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'center' }}>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Kommentar (påkrevd hvis du ber om endringer)"
          rows={2}
          style={{ flex: 1, maxWidth: 480, boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', outline: 'none', resize: 'none' }}
        />
        <button
          onClick={() => handleDecision('changes_requested')}
          disabled={submitting !== null}
          style={{ padding: '10px 16px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: '#D4645A', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}
        >
          {submitting === 'changes_requested' ? 'Sender...' : 'Be om endringer'}
        </button>
        <button
          onClick={() => handleDecision('approved')}
          disabled={submitting !== null}
          style={{ padding: '10px 18px', borderRadius: 7, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}
        >
          {submitting === 'approved' ? 'Sender...' : 'Godkjenn'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/admin/task-file-reviews
git commit -m "Legg til intern reviewside for opplastede postprod-filer"
```

---

### Task 14: Varselruting via resolver-side

**Files:**
- Create: `app/admin/reviews/[reviewId]/page.tsx`
- Modify: `app/admin/varsler/VarslerClient.tsx:193-196`

**Interfaces:**
- Consumes: `gallery_reviews.gallery_id`/`task_video_file_id` from Task 3.

- [ ] **Step 1: Write the resolver page**

```tsx
// app/admin/reviews/[reviewId]/page.tsx
// Varselklikk på gallery_review_requested/responded peker hit uansett om
// reviewen kom fra et galleri eller en opplastet postprod-fil (samme
// gallery_reviews-tabell, se supabase/migrations/162) — denne siden ruter
// videre til riktig detaljside uten at klienten (VarslerClient) må vite hvilken.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

export default async function ReviewResolverPage({
  params,
}: {
  params: Promise<{ reviewId: string }>
}) {
  const { reviewId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: review } = await supabase
    .from('gallery_reviews')
    .select('id, gallery_id, task_video_file_id')
    .eq('id', reviewId)
    .maybeSingle()

  if (!review) notFound()

  if (review.gallery_id) redirect(`/admin/selections/${review.gallery_id}/review/${review.id}`)
  if (review.task_video_file_id) redirect(`/admin/task-file-reviews/${review.id}`)
  notFound()
}
```

- [ ] **Step 2: Update notification click routing**

In `app/admin/varsler/VarslerClient.tsx`, replace lines 193-196:

```ts
    } else if (n.type === 'gallery_review_requested') {
      router.push(`/admin/selections/${n.gallery_id}/review/${n.gallery_review_id}`)
    } else if (n.type === 'gallery_review_responded') {
      router.push(`/admin/selections/${n.gallery_id}`)
```

with:

```ts
    } else if (n.type === 'gallery_review_requested' || n.type === 'gallery_review_responded') {
      if (n.gallery_id) {
        router.push(n.type === 'gallery_review_requested'
          ? `/admin/selections/${n.gallery_id}/review/${n.gallery_review_id}`
          : `/admin/selections/${n.gallery_id}`)
      } else if (n.gallery_review_id) {
        router.push(`/admin/reviews/${n.gallery_review_id}`)
      }
```

(This is a straight `else if` chain in the surrounding code — keep the trailing `} else if (...)` structure intact; only these two branches change shape, from two separate `else if` clauses into one combined clause with an inner `if`.)

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. As one profile, send a task video file to a colleague (Task 11/12 UI); as that colleague's profile, open `/admin/varsler` and click the resulting notification — confirm it lands on `/admin/task-file-reviews/[reviewId]` and shows the video + approve/changes-requested controls. Separately, confirm an existing gallery-review notification still routes to `/admin/selections/[galleryId]/review/[reviewId]` unchanged.

- [ ] **Step 5: Commit**

```bash
git add app/admin/reviews app/admin/varsler/VarslerClient.tsx
git commit -m "Rut varsler for fil-baserte kollegagodkjenninger til egen resolver-side"
```

---

### Task 15: Oppdater CLAUDE.md og sluttverifisering

**Files:**
- Modify: `/Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch/CLAUDE.md` ("Uapplied migrasjoner"-listen)

**Interfaces:** none (documentation only).

- [ ] **Step 1: Add the three new migrations to the uapplied list**

In `CLAUDE.md`, under "## Uapplied migrasjoner (blokkert)", add three new bullet lines (matching the existing style — filename, then an em-dash description of user-visible impact) right before the "Disse er skrevet men ikke kjort mot Supabase enna." line:

```
- `supabase/migrations/160_task_video_files.sql` (ny tabell for filer lastet opp på postprod-steg — "Filer i dette steget"-seksjonen på Grovklipp/Farger/Lyd/Klipp viser ingen filer og opplasting feiler før denne er kjørt)
- `supabase/migrations/161_video_reviews_r2_support.sql` (legger til R2-støtte på video_reviews — "Send til kunde" på en opplastet postprod-fil feiler før denne er kjørt)
- `supabase/migrations/162_gallery_reviews_task_file_support.sql` (gjør gallery_id valgfri + legger til task_video_file_id på gallery_reviews — "Send til kollega" på en opplastet postprod-fil feiler før denne er kjørt)
```

- [ ] **Step 2: Full-repo type check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (some pre-existing warnings elsewhere in the repo are fine — only new errors from this plan's files are blocking).

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: build succeeds. This catches server/client component boundary mistakes (`'use server'`/`'use client'`) that `tsc --noEmit` alone won't.

- [ ] **Step 4: End-to-end manual walkthrough**

Run: `npm run dev` and, on a video-type project in `/admin/postprod/[id]`:
1. Open "Grovklipp", upload a small test video file, confirm it appears in the list and previews inline.
2. Upload a second file as "Ny versjon" of the first, confirm the version badge/history shows both, newest first.
3. Click "Send til kunde", confirm a `/v/[token]` link is produced and the video plays there with working timestamped comments.
4. Click "Send til kollega", pick a reviewer, confirm the postprod step status shows "waiting_review"-equivalent state and the colleague gets a notification routing to `/admin/task-file-reviews/[reviewId]`.
5. As the colleague, approve it; confirm the step unlocks back to `in_progress` and the original sender gets a "godkjent"-notification.
6. Confirm Selektering/Redigering (photo steps) and `/d/[token]` (sluttleveranser) are visually and functionally unchanged.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "Registrer nye postprod-filopplasting-migrasjoner som uapplied i CLAUDE.md"
```
