# Mobilvarslinger (Web Push via PWA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver every event that already lands in the `notifications` table as a real OS-level push notification on the recipient's phone/laptop, even when the app isn't open in a tab.

**Architecture:** Postgres already inserts into `notifications` on every relevant event (unchanged). A new Supabase Database Webhook fires on `INSERT` to a new API route (`/api/push/dispatch`), which looks up the user's stored push subscriptions and sends via the `web-push` library (VAPID). A new service worker (`public/sw.js`), installable PWA manifest (`app/manifest.ts`), and a toggle component let users opt in per device.

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS + Database Webhooks), `web-push` npm package, native browser Push API / Service Worker API.

## Global Constraints

- Renumbered post-merge: originally assigned `131`, but `130`-`133` were independently claimed and committed to `main` by concurrent features (`130_image_comments.sql`, `131_gallery_reviews.sql`, `132_gallery_review_tasks.sql`, `133_unavailability.sql`) before this branch merged. Renumbered to `134`. File: `supabase/migrations/134_push_subscriptions.sql`.
- No automated test framework exists in this repo (no jest/vitest, no `*.test.ts` files, no `test` script in `package.json`). Every task below is verified **manually** — this matches the existing project convention, not a shortcut.
- Design tokens for anything in `/admin/*` come from `lib/admin-theme.ts` (`C.bg = '#181920'`, `C.accent = '#7C5CFC'`, etc.) — never the public cinematic palette (`#0C0B09` / `#C49434`), which belongs only to `/p/*` pages.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is inlined into the client bundle **at build time** by Next.js — setting it on Cloud Run after the fact requires a rebuild+redeploy, not just an env var update. This is the same class of mistake that caused the `ANTHROPIC_API_KEY` incident (see project memory `project_leafilms`) — flag this explicitly to Magnus in the final task.
- `deploy.sh` only sets env vars on **first-ever** creation of the Cloud Run service. Since `leafilms-pitch` already exists, the new push-related env vars must be added via `gcloud run services update leafilms-pitch --update-env-vars=...` (or the Cloud Run console) — `deploy.sh` will not pick them up automatically.
- Migrations in this repo run via `psql "$DATABASE_URL" -f supabase/migrations/134_push_subscriptions.sql` (see `scripts/migrate-single.sh`) or by pasting into the Supabase SQL Editor. `DATABASE_URL` must be the pooler connection string (`aws-1-eu-north-1.pooler.supabase.com`, user `postgres.<ref>`) — the direct connection string is IPv6-only and fails from this machine (see project memory `reference_supabase_pooler`).
- Deviation from the design spec, made explicitly here: the spec says to place the on/off toggle "in the `NotificationBell` dropdown." `NotificationBell` (`components/admin/NotificationBell.tsx`) has **no dropdown today** — clicking it just navigates to `/admin/varsler`. Building a new dropdown just to host one button would be scope creep for this feature. Instead, the toggle is placed directly in the `/admin/varsler` page header (`VarslerClient.tsx`), which is the other place the spec itself says people already are "when thinking about notifications." Flag this to Magnus as a deliberate deviation, not an oversight.

---

### Task 1: `push_subscriptions` table + RLS

**Files:**
- Create: `supabase/migrations/134_push_subscriptions.sql`

**Interfaces:**
- Produces: table `push_subscriptions(id, user_id, endpoint, p256dh, auth, user_agent, created_at)`, unique on `endpoint`, RLS policy restricting all access to `auth.uid() = user_id`. Later tasks (3, 5) read/write this table by exact column name.

- [ ] **Step 1: Write the migration**

```sql
-- 134_push_subscriptions.sql
-- Lagrer Web Push-abonnement per enhet, slik at /api/push/dispatch kan sende
-- push-varsler til alle enheter en bruker har skrudd på, uavhengig av om appen
-- er åpen i en fane. Se docs/superpowers/specs/2026-07-29-mobile-push-notifications-design.md.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_own_rows ON push_subscriptions;
CREATE POLICY push_subscriptions_own_rows ON push_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Apply the migration**

Run: `psql "$DATABASE_URL" -f supabase/migrations/134_push_subscriptions.sql`
Expected: `CREATE TABLE`, `CREATE INDEX` (x2), `ALTER TABLE`, `DROP POLICY`, `CREATE POLICY` — no errors.

- [ ] **Step 3: Verify manually**

Run: `psql "$DATABASE_URL" -c "\d push_subscriptions"` and `psql "$DATABASE_URL" -c "SELECT policyname, cmd FROM pg_policies WHERE tablename = 'push_subscriptions';"`
Expected: table has the 6 columns above; one policy `push_subscriptions_own_rows` with `cmd = ALL`.

**Important:** test RLS with a real per-user access token (via the Supabase JS client logged in as a normal staff user), not only this superuser `psql` connection — per project memory `feedback_rls_recursion_pattern`, RLS bugs don't show up under a superuser connection. This gets exercised naturally in Task 3's manual verification (subscribing as a logged-in user through the browser), so no separate step needed here — just don't skip Task 3's browser check.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/134_push_subscriptions.sql
git commit -m "feat: add push_subscriptions table for mobile push notifications"
```

---

### Task 2: `web-push` dependency + VAPID keys + env vars

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify (local only, not committed): `.env.local`

**Interfaces:**
- Produces: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `PUSH_WEBHOOK_SECRET` env vars that Task 5 (dispatch route) and Task 9 (client toggle) read directly.

- [ ] **Step 1: Install the dependency**

Run: `npm install web-push && npm install -D @types/web-push`
Expected: `package.json` gains `"web-push": "^3.x"` under `dependencies` and `"@types/web-push": "^3.x"` under `devDependencies`.

- [ ] **Step 2: Generate VAPID keys**

Run: `npx web-push generate-vapid-keys`
Expected output: a `Public Key` and `Private Key` pair printed to stdout.

- [ ] **Step 3: Add env vars locally**

Append to `.env.local` (create the five vars, using the keys generated in Step 2):

```
VAPID_PUBLIC_KEY=<public key from step 2>
VAPID_PRIVATE_KEY=<private key from step 2>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same public key from step 2>
VAPID_SUBJECT=mailto:post@leafilms.no
PUSH_WEBHOOK_SECRET=<any long random string, e.g. output of `openssl rand -hex 32`>
```

Expected: `npm run dev` restarts cleanly and `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` is defined (verify in Task 9's browser check).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add web-push dependency for mobile push notifications"
```

(`.env.local` is gitignored — do not commit it. Note in your handoff to Magnus that these 5 vars also need to be added to Cloud Run — see Task 11.)

---

### Task 3: Server actions for subscribe/unsubscribe

**Files:**
- Create: `lib/actions/push-subscriptions.ts`

**Interfaces:**
- Consumes: `createClient()` from `lib/supabase-server.ts` (session-aware client, existing pattern used by every file in `lib/actions/`).
- Produces: `subscribeToPush(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string): Promise<{ ok: boolean }>`, `unsubscribeFromPush(endpoint: string): Promise<{ ok: boolean }>`, `getPushSubscriptionEndpoints(): Promise<string[]>` — Task 9 calls all three by these exact names/signatures.

- [ ] **Step 1: Write the file**

```ts
'use server'

import { createClient } from '@/lib/supabase-server'

export async function subscribeToPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string
): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent ?? null,
      },
      { onConflict: 'endpoint' }
    )

  return { ok: !error }
}

export async function unsubscribeFromPush(endpoint: string): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id)

  return { ok: !error }
}

export async function getPushSubscriptionEndpoints(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('push_subscriptions')
    .select('endpoint')
    .eq('user_id', user.id)

  return (data ?? []).map((r) => r.endpoint)
}
```

- [ ] **Step 2: Verify manually (no test framework — exercise via a throwaway script)**

Run: `npx tsx -e "import('./lib/actions/push-subscriptions').then(m => console.log(Object.keys(m)))"`
Expected: prints `[ 'subscribeToPush', 'unsubscribeFromPush', 'getPushSubscriptionEndpoints' ]` with no import errors (confirms the file compiles and exports match the interface above). Full behavioral verification (real insert/delete against `push_subscriptions` under a real user's RLS-scoped session) happens end-to-end in Task 9's browser check.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/push-subscriptions.ts
git commit -m "feat: add server actions for push subscription management"
```

---

### Task 4: Shared notification → push content mapping

**Files:**
- Create: `lib/push-notification-content.ts`

**Interfaces:**
- Produces: `PushNotificationRow` type, `buildPushContent(n: PushNotificationRow, taskPipelineStage: string | null): { title: string; body: string; url: string }` — Task 5 (dispatch route) calls this by this exact name/signature.
- Mirrors the exact per-type URL and phrase logic already in `app/admin/varsler/VarslerClient.tsx`'s `navigateTo()` function and its inline phrase ternary, so a push notification always opens the same destination the in-app bell would.

- [ ] **Step 1: Write the file**

```ts
// Delt type→{title,body,url}-mapping brukt av /api/push/dispatch (server, ingen
// browser-API-er tilgjengelig der). Speiler bevisst navigateTo() og fraseringen i
// app/admin/varsler/VarslerClient.tsx — hold de to i sync ved nye notification-typer.

export type PushNotificationRow = {
  id: string
  user_id: string
  type: string
  project_id: string | null
  task_id: string | null
  lead_id: string | null
  conversation_id: string | null
  message_id: string | null
  meeting_id: string | null
  board_id: string | null
  board_card_id: string | null
  message_preview: string
  sender_name: string
}

const PHRASE: Record<string, string> = {
  project_message: 'i prosjekt-chatten',
  project_message_mention: 'nevnte deg i prosjekt-chatten',
  project_message_reaction: 'reagerte på meldingen din i prosjekt-chatten',
  task_message: 'i en oppgave',
  task_message_mention: 'nevnte deg i en oppgave',
  task_message_reaction: 'reagerte på meldingen din i en oppgave',
  task_assigned: 'tildelte deg en oppgave',
  lead_assigned: 'satte deg som ansvarlig for en lead',
  resale_assigned: 'satte deg som ansvarlig for videresalg',
  selection_submitted: 'sendte inn bildevalg',
  quote_mention: 'tagget deg i tilbud',
  quote_message: 'i tilbudschatten',
  quote_message_reaction: 'reagerte på meldingen din i tilbudschatten',
  quote_assigned: 'tildelte deg et tilbud',
  quote_review_requested: 'ber deg godkjenne tilbudet',
  quote_review_responded: 'svarte på review av tilbudet',
  preprod_mention: 'tagget deg i pre-prod-chatten',
  preprod_message: 'i pre-prod-chatten',
  preprod_message_reaction: 'reagerte på meldingen din i pre-prod-chatten',
  feedback_reply: 'svarte på tilbakemeldingen din',
  contract_signed: 'signerte kontrakten',
  direct_message: 'sendte deg en direktemelding',
  conversation_message_reaction: 'reagerte på meldingen din',
  meeting_invite: 'inviterte deg til et møte',
  meeting_response: 'svarte på møteinvitasjonen din',
  board_comment_mention: 'nevnte deg i en boardkommentar',
  board_comment_reply: 'svarte på kommentaren din på boardet',
  pitch_review_requested: 'ber deg godkjenne pitchen',
  pitch_review_responded: 'svarte på review av pitchen',
  invoice_assigned: 'tildelte deg en faktura',
}

function pushUrlFor(n: PushNotificationRow, taskPipelineStage: string | null): string {
  switch (n.type) {
    case 'lead_assigned':
      return n.project_id ? `/admin/projects/${n.project_id}/contact` : `/admin/leads/${n.lead_id}`
    case 'task_assigned':
    case 'resale_assigned':
      return `/admin/projects/${n.project_id}`
    case 'direct_message':
    case 'conversation_message_reaction':
      return '/admin/meldinger'
    case 'meeting_invite':
    case 'meeting_response':
      return '/admin/calendar'
    case 'project_message':
    case 'project_message_mention':
    case 'project_message_reaction':
      return `/admin/projects/${n.project_id}?chat=1`
    case 'quote_mention':
    case 'quote_assigned':
    case 'quote_message':
    case 'quote_message_reaction':
      return `/admin/projects/${n.project_id}/quote${n.type === 'quote_assigned' ? '' : '?chat=1'}`
    case 'preprod_mention':
    case 'preprod_message':
    case 'preprod_message_reaction':
      return `/admin/preprod/${n.project_id}?chat=1`
    case 'pitch_review_requested':
    case 'pitch_review_responded':
    case 'quote_review_requested':
    case 'quote_review_responded':
      return `/admin/projects/${n.project_id}?tab=pitch`
    case 'invoice_assigned':
      return `/admin/faktura/${n.project_id}`
    case 'contract_signed':
      return `/admin/projects/${n.project_id}?tab=kontrakt`
    case 'feedback_reply':
      return '/admin/varsler'
    case 'task_message':
    case 'task_message_mention':
    case 'task_message_reaction':
      if (!n.task_id) return `/admin/postprod/${n.project_id}`
      if (taskPipelineStage === 'post_prod') return `/admin/postprod/${n.project_id}?task=${n.task_id}&chat=1`
      if (taskPipelineStage === 'pre_prod') return `/admin/preprod/${n.project_id}?task=${n.task_id}`
      return `/admin/projects/${n.project_id}?task=${n.task_id}`
    case 'board_comment_mention':
    case 'board_comment_reply':
      return `/admin/boards/${n.board_id}?comment=${n.board_card_id}`
    default:
      return `/admin/postprod/${n.project_id}`
  }
}

export function buildPushContent(
  n: PushNotificationRow,
  taskPipelineStage: string | null
): { title: string; body: string; url: string } {
  return {
    title: `${n.sender_name} ${PHRASE[n.type] ?? 'i en oppgave'}`,
    body: n.message_preview,
    url: pushUrlFor(n, taskPipelineStage),
  }
}
```

- [ ] **Step 2: Verify manually**

Run:
```bash
npx tsx -e "
import { buildPushContent } from './lib/push-notification-content'
console.log(buildPushContent({
  id: 'x', user_id: 'u', type: 'task_assigned', project_id: 'p1', task_id: null,
  lead_id: null, conversation_id: null, message_id: null, meeting_id: null,
  board_id: null, board_card_id: null, message_preview: 'Klipping — Bryllup Hansen',
  sender_name: 'Nova',
}, null))
"
```
Expected: `{ title: 'Nova tildelte deg en oppgave', body: 'Klipping — Bryllup Hansen', url: '/admin/projects/p1' }`

- [ ] **Step 3: Commit**

```bash
git add lib/push-notification-content.ts
git commit -m "feat: add shared notification-to-push-content mapping"
```

---

### Task 5: Webhook dispatch route

**Files:**
- Create: `app/api/push/dispatch/route.ts`

**Interfaces:**
- Consumes: `createServiceClient()` from `lib/supabase-server.ts` (same service-role pattern as `app/api/send-email/route.ts`), `buildPushContent` + `PushNotificationRow` from Task 4, `push_subscriptions` table from Task 1, env vars from Task 2.
- Produces: `POST /api/push/dispatch` — the URL Task 11's Supabase Database Webhook configuration points at.

- [ ] **Step 1: Write the file**

```ts
import { NextRequest } from 'next/server'
import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase-server'
import { buildPushContent, type PushNotificationRow } from '@/lib/push-notification-content'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-push-secret')
  if (!secret || secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return Response.json({ error: 'Ikke autorisert' }, { status: 401 })
  }

  const payload = await req.json().catch(() => null)
  // Webhooken er konfigurert til kun å fyre på INSERT (se migrasjon/dashboard-oppsett),
  // men denne sjekken er et sekundært vern mot at noen endrer trigger-konfigurasjonen
  // til også å inkludere UPDATE (f.eks. når `read` settes til true).
  if (!payload || payload.type !== 'INSERT') {
    return Response.json({ skipped: true })
  }

  const row = payload.record as PushNotificationRow | undefined
  if (!row?.user_id) {
    return Response.json({ error: 'Mangler varsel-data' }, { status: 400 })
  }

  const supabase = createServiceClient()

  let taskPipelineStage: string | null = null
  if (row.task_id) {
    const { data: task } = await supabase
      .from('tasks')
      .select('pipeline_stage')
      .eq('id', row.task_id)
      .single()
    taskPipelineStage = task?.pipeline_stage ?? null
  }

  const content = buildPushContent(row, taskPipelineStage)

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', row.user_id)

  if (!subscriptions?.length) {
    return Response.json({ sent: 0 })
  }

  let sent = 0
  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(content)
        )
        sent++
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
        } else {
          console.error('push send feilet for subscription', sub.id, err)
        }
      }
    })
  )

  return Response.json({ sent })
}
```

- [ ] **Step 2: Verify manually**

Start the dev server (`npm run dev`), then run:
```bash
curl -i -X POST http://localhost:3000/api/push/dispatch \
  -H "Content-Type: application/json" \
  -H "x-push-secret: wrong-secret" \
  -d '{"type":"INSERT","record":{}}'
```
Expected: `HTTP/1.1 401` with `{"error":"Ikke autorisert"}`.

Then run the same command with the real value of `PUSH_WEBHOOK_SECRET` from `.env.local` and a `record` shaped like a real notification row (no `push_subscriptions` rows exist yet at this point, so):
Expected: `HTTP/1.1 200` with `{"sent":0}`.

Full send-a-real-push verification happens in Task 9 once a browser subscription exists.

- [ ] **Step 3: Commit**

```bash
git add "app/api/push/dispatch/route.ts"
git commit -m "feat: add push notification dispatch webhook route"
```

---

### Task 6: Service worker

**Files:**
- Create: `public/sw.js`

**Interfaces:**
- Consumes: the JSON body `{ title, body, url }` sent by Task 5's `webpush.sendNotification(...)` call.
- Produces: registration target `/sw.js` that Task 9's `navigator.serviceWorker.register('/sw.js')` call registers.

- [ ] **Step 1: Write the file**

```js
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }

  const title = data.title || 'Leafilms'
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { url: data.url || '/admin/varsler' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/admin/varsler'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      for (const client of windowClients) {
        if ('focus' in client && 'navigate' in client) {
          return client.focus().then(() => client.navigate(url))
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
```

- [ ] **Step 2: Verify manually**

Start the dev server, open `http://localhost:3000/sw.js` in the browser.
Expected: raw JS source is returned (not a 404), confirming Next serves files under `public/` at the root as-is.

- [ ] **Step 3: Commit**

```bash
git add public/sw.js
git commit -m "feat: add service worker for push notifications"
```

---

### Task 7: PWA icons + manifest

**Files:**
- Create: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`
- Create: `app/manifest.ts`

**Interfaces:**
- Produces: `/manifest.webmanifest` (auto-served by Next's `app/manifest.ts` convention) and the three icon URLs referenced inside it. Task 8 (layout metadata) references the same icon paths for `apple-touch-icon`.

- [ ] **Step 1: Generate the icons from the existing brand logo**

The existing logo (`public/brand/leafilms-logo.png`, 840×446, has alpha) is not square, so pad it onto the admin dark-palette background (`#181920`) before resizing. Run:

```bash
mkdir -p public/icons

sips -s format png --padToHeightWidth 840 840 --padColor 181920 \
  public/brand/leafilms-logo.png --out /tmp/leafilms-icon-square.png
sips -z 512 512 /tmp/leafilms-icon-square.png --out public/icons/icon-512.png
sips -z 192 192 /tmp/leafilms-icon-square.png --out public/icons/icon-192.png

sips -s format png --padToHeightWidth 1200 1200 --padColor 181920 \
  public/brand/leafilms-logo.png --out /tmp/leafilms-icon-maskable.png
sips -z 512 512 /tmp/leafilms-icon-maskable.png --out public/icons/icon-maskable-512.png
```

Expected: three PNG files exist under `public/icons/`, each reported as square by `sips -g pixelWidth -g pixelHeight public/icons/icon-192.png` (192×192, etc).

- [ ] **Step 2: Write `app/manifest.ts`**

```ts
import type { MetadataRoute } from 'next'
import { C } from '@/lib/admin-theme'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Leafilms',
    short_name: 'Leafilms',
    description: 'Leafilms interne business-plattform',
    start_url: '/admin',
    display: 'standalone',
    background_color: C.bg,
    theme_color: C.bg,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
```

- [ ] **Step 3: Verify manually**

Start the dev server, open `http://localhost:3000/manifest.webmanifest`.
Expected: JSON response with `name: "Leafilms"` and the 3 icon entries, each resolving (open each icon URL directly and confirm an image loads).

- [ ] **Step 4: Commit**

```bash
git add public/icons/icon-192.png public/icons/icon-512.png public/icons/icon-maskable-512.png app/manifest.ts
git commit -m "feat: add PWA manifest and app icons"
```

---

### Task 8: Root layout metadata for iOS installability

**Files:**
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: icon paths from Task 7.

- [ ] **Step 1: Update the metadata and add a viewport export**

In `app/layout.tsx`, change:

```ts
export const metadata: Metadata = {
  title: "Leafilms",
  description: "Leafilms — innholdsproduksjon",
};
```

to:

```ts
export const metadata: Metadata = {
  title: "Leafilms",
  description: "Leafilms — innholdsproduksjon",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Leafilms",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#181920",
};
```

And update the import line from:
```ts
import type { Metadata } from "next";
```
to:
```ts
import type { Metadata, Viewport } from "next";
```

- [ ] **Step 2: Verify manually**

Start the dev server, open `http://localhost:3000/admin` (log in first if needed), view page source (`Cmd+Option+U` in Chrome or "View Page Source").
Expected: `<head>` contains `<link rel="manifest" href="/manifest.webmanifest">`, `<meta name="apple-mobile-web-app-capable" content="yes">`, `<link rel="apple-touch-icon" href="/icons/icon-192.png">`, and `<meta name="theme-color" content="#181920">`.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: add PWA metadata to root layout for iOS installability"
```

---

### Task 9: Push notification toggle component

**Files:**
- Create: `components/admin/PushNotificationToggle.tsx`

**Interfaces:**
- Consumes: `subscribeToPush`, `unsubscribeFromPush` from `lib/actions/push-subscriptions.ts` (Task 3); `/sw.js` (Task 6); `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Task 2); `C` from `lib/admin-theme.ts`.
- Produces: `<PushNotificationToggle />` — a self-contained component with no props, consumed by Task 10.

- [ ] **Step 1: Write the file**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { subscribeToPush, unsubscribeFromPush } from '@/lib/actions/push-subscriptions'
import { C } from '@/lib/admin-theme'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

type Support = 'checking' | 'unsupported' | 'ios-not-installed' | 'ready'

export function PushNotificationToggle() {
  const [support, setSupport] = useState<Support>('checking')
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true

      if (isIOS && !isStandalone) {
        setSupport('ios-not-installed')
        return
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setSupport('unsupported')
        return
      }

      const registration = await navigator.serviceWorker.register('/sw.js')
      const existing = await registration.pushManager.getSubscription()
      setEnabled(!!existing)
      setSupport('ready')
    }
    init().catch(() => setSupport('unsupported'))
  }, [])

  async function handleToggle() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const registration = await navigator.serviceWorker.ready

      if (enabled) {
        const existing = await registration.pushManager.getSubscription()
        if (existing) {
          await unsubscribeFromPush(existing.endpoint)
          await existing.unsubscribe()
        }
        setEnabled(false)
        return
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Du må godkjenne varsler i nettleseren for å skru dette på')
        return
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) {
        setError('Push er ikke konfigurert ennå')
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError('Kunne ikke opprette abonnement')
        return
      }

      const res = await subscribeToPush(
        { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } },
        navigator.userAgent
      )
      if (!res.ok) {
        setError('Kunne ikke lagre abonnement')
        return
      }
      setEnabled(true)
    } catch {
      setError('Noe gikk galt — prøv igjen')
    } finally {
      setBusy(false)
    }
  }

  if (support === 'checking') return null

  if (support === 'ios-not-installed') {
    return (
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, maxWidth: 260, margin: 0 }}>
        For push-varsler på iPhone: trykk Del-ikonet i Safari → &quot;Legg til på Hjemskjerm&quot; → åpne appen derfra og skru på varsler.
      </p>
    )
  }

  if (support === 'unsupported') {
    return (
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, margin: 0 }}>
        Push-varsler støttes ikke i denne nettleseren.
      </p>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={handleToggle}
        disabled={busy}
        aria-pressed={enabled}
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '0.72rem',
          fontWeight: 600,
          color: enabled ? C.accent : C.text3,
          background: enabled ? C.accentBg : 'none',
          border: `1px solid ${enabled ? C.accent : C.border}`,
          borderRadius: 6,
          padding: '6px 12px',
          cursor: busy ? 'default' : 'pointer',
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? 'Vent …' : enabled ? 'Push-varsler på ✓' : 'Skru på push-varsler'}
      </button>
      {error && (
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.danger }}>{error}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify manually in a real browser (this is the true end-to-end test for Tasks 1, 3, 5, 6, 9)**

This requires Task 10 to be done first so the component is actually rendered somewhere — do Task 10, then come back here. In Chrome/Android or desktop Chrome:
1. Open `/admin/varsler`, click "Skru på push-varsler", accept the browser permission prompt.
2. Expected: button flips to "Push-varsler på ✓". Run `psql "$DATABASE_URL" -c "SELECT user_id, endpoint FROM push_subscriptions;"` — expect one row for your user.
3. Trigger a real notification (e.g. assign yourself a task from another account, or use Supabase SQL Editor to `INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name) VALUES ('<your-user-id>', 'task_assigned', '<any-existing-project-id>', 'Test task', 'Test')`).
4. Expected: an OS-level notification appears within a few seconds (requires Task 11's webhook to be configured — if it's not done yet, call `POST /api/push/dispatch` manually with the same payload shape as in Task 5's curl example, using the real inserted row's data, to isolate whether the gap is the webhook or the dispatch/send path).
5. Click the notification — expected: browser opens/focuses `/admin/projects/<id>`.
6. Click "Push-varsler på ✓" again to turn off — expected: button reverts, and the row disappears from `push_subscriptions`.

- [ ] **Step 3: Commit**

```bash
git add components/admin/PushNotificationToggle.tsx
git commit -m "feat: add push notification toggle component"
```

---

### Task 10: Wire the toggle into the varsler page

**Files:**
- Modify: `app/admin/varsler/VarslerClient.tsx`

**Interfaces:**
- Consumes: `<PushNotificationToggle />` from Task 9.

- [ ] **Step 1: Import and render it in the header**

Add the import near the other component imports at the top of `VarslerClient.tsx`:

```ts
import { PushNotificationToggle } from '@/components/admin/PushNotificationToggle'
```

Then in the header `<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>` block (around line 271), add the toggle between the title block and the existing action buttons, so the header's right-hand button group becomes:

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
  <PushNotificationToggle />
  <div style={{ display: 'flex', gap: 8 }}>
    {readCount > 0 && (
      <button
        onClick={handleDeleteRead}
        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}
      >
        Fjern alle leste
      </button>
    )}
    {unreadCount > 0 && (
      <button
        onClick={handleMarkAll}
        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}
      >
        Merk alle som lest
      </button>
    )}
  </div>
</div>
```

(This wraps the existing button group in an outer flex row alongside the new toggle — the existing buttons themselves are unchanged.)

- [ ] **Step 2: Verify manually**

Start the dev server, open `/admin/varsler`.
Expected: "Skru på push-varsler" button appears in the header, to the left of "Fjern alle leste" / "Merk alle som lest" (when present). Layout doesn't overflow or wrap awkwardly at common widths (test at ~768px and ~1280px).

- [ ] **Step 3: Commit**

```bash
git add app/admin/varsler/VarslerClient.tsx
git commit -m "feat: surface push notification toggle on varsler page"
```

---

### Task 11: Configure the Supabase Database Webhook + deploy env vars (manual, no code)

This task has no files to write — it's dashboard configuration and a deploy step. Do it last, after Tasks 1–10 are committed and manually verified locally.

- [ ] **Step 1: Create the Database Webhook**

In the Supabase Dashboard for this project → **Database → Webhooks → Create a new hook**:
- Name: `push_dispatch`
- Table: `notifications`
- Events: `Insert` only (leave Update/Delete unchecked — see the Global Constraints note on why the route also defensively checks `payload.type`)
- Type: `HTTP Request`
- Method: `POST`
- URL: `https://<cloud-run-url>/api/push/dispatch` (get the URL via `gcloud run services describe leafilms-pitch --region europe-north1 --format='value(status.url)'`)
- HTTP Headers: add `x-push-secret: <the PUSH_WEBHOOK_SECRET value from Task 2>`

- [ ] **Step 2: Add the 5 env vars to Cloud Run**

```bash
gcloud run services update leafilms-pitch --region europe-north1 \
  --update-env-vars="VAPID_PUBLIC_KEY=<value>,VAPID_PRIVATE_KEY=<value>,NEXT_PUBLIC_VAPID_PUBLIC_KEY=<value>,VAPID_SUBJECT=mailto:post@leafilms.no,PUSH_WEBHOOK_SECRET=<value>"
```

**Important:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is inlined into the client JS bundle at build time. Setting it on the running service is not enough — you must trigger a fresh build+deploy (`./deploy.sh` or `gcloud builds submit`) *after* this env var is set, or the deployed frontend will still ship without a public key and every subscribe attempt will fail with "Push er ikke konfigurert ennå."

- [ ] **Step 3: Verify end-to-end in production**

Repeat Task 9 Step 2's manual test, but against the deployed Cloud Run URL instead of localhost. Confirm the notification arrives on a real phone with the app open in a background tab or fully closed (not just foregrounded).

---

## Self-Review Notes

- **Spec coverage:** all sections of the design spec are covered — datamodel (Task 1), env vars (Task 2), server actions + dispatch route + shared content mapping (Tasks 3–5), service worker (Task 6), manifest/icons (Task 7), iOS meta (Task 8), toggle placement (Tasks 9–10, with the dropdown-vs-page deviation explicitly called out), webhook + deploy (Task 11), error handling for expired subscriptions (Task 5), iOS instruction fallback (Task 9), manual testing plan (Tasks 9 & 11 verification steps map directly to the spec's 3-point testing section).
- **Placeholder scan:** no TBD/TODO markers; every step has runnable commands or complete code.
- **Type consistency:** `PushNotificationRow` (Task 4) matches the raw `notifications` table columns from Task 1's dependencies (`056`, `061`, `081`–`083`, `088`, `090`, `093`–`094`, `099`, `118`, `121`, `127`, `129`) and is consumed with the same shape in Task 5. `subscribeToPush`/`unsubscribeFromPush` signatures match between Task 3's definition and Task 9's call sites.

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-29-mobile-push-notifications.md`.** Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
