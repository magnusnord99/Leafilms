# Profilside med navn og avatarfarge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Leafilms admin user change their display name and pick one of 15 fixed avatar colors on a new `/admin/profile` page, reachable by clicking their name in the top-right header. No two users can hold the same color at once.

**Architecture:** A nullable `color` column on `profiles`, enforced unique via a partial index, backing a new shared `lib/avatar-colors.ts` helper that every existing avatar render (5 admin pages) switches to. A small `lib/actions/profile.ts` server-action module handles reads/writes with a friendly pre-check plus a DB-constraint fallback for races. The new page is a client component following the existing `app/admin/team/page.tsx` shell pattern.

**Tech Stack:** Next.js App Router, Supabase (Postgres + RLS + `@supabase/ssr`), TypeScript strict, Tailwind v4 for layout utility classes, inline `style={}` objects for the cinematic-dark visual system (matches all sibling admin pages).

## Global Constraints

- Migrations live in `supabase/migrations/` with a numbered prefix. The latest applied migration is `082_notify_project_message_fallback.sql` — the new one is `083_profile_color.sql` (the `065_` hint in `CLAUDE.md` is stale; trust the actual directory listing).
- RLS must be set up on any new column/table per project convention — this task only adds a column to an existing RLS-protected table, and the existing "Users can update own profile" / "Admins can view all profiles" policies on `profiles` (migration `016_auth_setup.sql`) already cover the new column, so no new policy is needed.
- **No automated test framework exists in this repo** (no `jest`/`vitest`/`playwright`, no `"test"` script in `package.json`). Every task's verification step is `npx tsc --noEmit`, `npm run lint`, and — where noted — a manual check against `npm run dev` in the browser. Do not invent a test runner.
- Norwegian UI copy throughout (matches every existing admin page).
- Follow the existing inline-`style` + local `C` color-constant convention used in every `app/admin/**/page.tsx` file — do not introduce a CSS-in-JS library or Tailwind `@apply`.
- The DB migration changes shared Supabase state. **Do not run it against the live database as part of this plan** — write the file, verify it reads correctly, and leave applying it (`npm run migrate:single supabase/migrations/083_profile_color.sql`) as a manual step for Magnus, exactly like the three migrations already listed as "blocked" in `CLAUDE.md`.

---

### Task 1: Migration — add `color` to `profiles`

**Files:**
- Create: `supabase/migrations/083_profile_color.sql`

**Interfaces:**
- Produces: `profiles.color TEXT` (nullable), constrained to the 15 hex values used by Task 2's `AVATAR_COLORS`, unique among non-null values via `profiles_color_unique`.

- [ ] **Step 1: Write the migration file**

```sql
-- Avatarfarge: brukeren velger selv én av 15 faste farger på sin profilside.
-- NULL betyr "ikke valgt ennå" — appen faller da tilbake til en hash-basert
-- farge (se lib/avatar-colors.ts). Unik partial index sikrer at to brukere
-- aldri kan eie samme farge samtidig, selv ved samtidige valg.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS color TEXT;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_color_check CHECK (
    color IS NULL OR color IN (
      '#7C5CFC', '#9B6BD9', '#6B7EC4', '#4A8FA8', '#4A9AC4',
      '#50C8C8', '#4CAF7D', '#5C9E6B', '#8FA84A', '#C49434',
      '#E0A840', '#E07B54', '#C4634A', '#B85C8A', '#E8529A'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS profiles_color_unique
  ON profiles(color)
  WHERE color IS NOT NULL;

COMMENT ON COLUMN profiles.color IS 'Valgfri, unik avatarfarge valgt av brukeren selv på /admin/profile. NULL = hash-basert fallback.';
```

- [ ] **Step 2: Verify the file is syntactically sane**

Run: `cat supabase/migrations/083_profile_color.sql`
Expected: file exists, prints exactly the SQL above, no shell errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/083_profile_color.sql
git commit -m "feat: add profiles.color column with unique constraint (migration not yet applied)"
```

Note in the PR/commit body (or tell Magnus directly) that this migration still needs to be run against Supabase — do not run it yourself.

---

### Task 2: Shared avatar-color module

**Files:**
- Create: `lib/avatar-colors.ts`

**Interfaces:**
- Produces: `AVATAR_COLORS: readonly string[]` (15 hex strings, same order/values as Task 1's CHECK constraint), `type AvatarColor`, `getAvatarColor(profile: { id: string; color?: string | null }): string`.
- Consumed by: Tasks 4, 5, 6, and the rollout in Tasks 9-13.

- [ ] **Step 1: Write the module**

```ts
export const AVATAR_COLORS = [
  '#7C5CFC', // lilla (brand-aksent)
  '#9B6BD9', // orkide
  '#6B7EC4', // lavendel
  '#4A8FA8', // stålblå
  '#4A9AC4', // himmelblå
  '#50C8C8', // turkis
  '#4CAF7D', // grønn
  '#5C9E6B', // mosegrønn
  '#8FA84A', // oliven
  '#C49434', // gull
  '#E0A840', // rav
  '#E07B54', // terrakotta
  '#C4634A', // rust
  '#B85C8A', // rosa
  '#E8529A', // magenta
] as const

export type AvatarColor = typeof AVATAR_COLORS[number]

function hashFallback(id: string): AvatarColor {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

/**
 * Returns a profile's chosen color, or a deterministic hash-based fallback
 * if they haven't picked one yet (profile.color is null/undefined).
 */
export function getAvatarColor(profile: { id: string; color?: string | null }): string {
  return profile.color ?? hashFallback(profile.id)
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `lib/avatar-colors.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/avatar-colors.ts
git commit -m "feat: add shared avatar color palette and resolver"
```

---

### Task 3: Extend `useAuth`'s `Profile` type

**Files:**
- Modify: `hooks/useAuth.ts:8-14`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Profile.color: string | null`, available to every component that calls `useAuth()`.

- [ ] **Step 1: Add the field**

In `hooks/useAuth.ts`, change:

```ts
interface Profile {
  id: string
  email: string
  role: 'admin' | 'customer'
  name: string | null
  customer_id: string | null
}
```

to:

```ts
interface Profile {
  id: string
  email: string
  role: 'admin' | 'customer'
  name: string | null
  customer_id: string | null
  color: string | null
}
```

`fetchProfile` already does `.select('*')` (line 84-87), so no query change is needed here — the new column flows through automatically once Task 1's migration is applied.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/useAuth.ts
git commit -m "feat: add color field to useAuth Profile type"
```

---

### Task 4: Server actions — `lib/actions/profile.ts`

**Files:**
- Create: `lib/actions/profile.ts`

**Interfaces:**
- Consumes: `AVATAR_COLORS`, `AvatarColor` from `lib/avatar-colors.ts` (Task 2); `createClient` from `lib/supabase-server.ts`.
- Produces: `updateProfileName(name: string): Promise<{ error?: string }>`, `updateProfileColor(color: string): Promise<{ error?: string }>`, `getTakenColors(): Promise<ProfileColorOwner[]>`, `type ProfileColorOwner = { id: string; name: string | null; color: string }`. Consumed by Task 5.

- [ ] **Step 1: Write the actions**

```ts
'use server'

import { createClient } from '@/lib/supabase-server'
import { AVATAR_COLORS, type AvatarColor } from '@/lib/avatar-colors'

export async function updateProfileName(name: string): Promise<{ error?: string }> {
  const trimmed = name.trim()
  if (!trimmed) return { error: 'Navn kan ikke være tomt.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke innlogget.' }

  const { error } = await supabase
    .from('profiles')
    .update({ name: trimmed })
    .eq('id', user.id)

  if (error) {
    console.error('updateProfileName error:', error)
    return { error: 'Kunne ikke lagre navn.' }
  }
  return {}
}

export async function updateProfileColor(color: string): Promise<{ error?: string }> {
  if (!AVATAR_COLORS.includes(color as AvatarColor)) {
    return { error: 'Ugyldig farge.' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke innlogget.' }

  const { data: taken } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('color', color)
    .neq('id', user.id)
    .maybeSingle()

  if (taken) {
    return { error: `Fargen er allerede tatt av ${taken.name ?? 'en annen bruker'}.` }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ color })
    .eq('id', user.id)

  if (error) {
    if (error.code === '23505') {
      return { error: 'Fargen ble nettopp tatt av noen andre, velg en annen.' }
    }
    console.error('updateProfileColor error:', error)
    return { error: 'Kunne ikke lagre farge.' }
  }
  return {}
}

export type ProfileColorOwner = { id: string; name: string | null; color: string }

export async function getTakenColors(): Promise<ProfileColorOwner[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, color')
    .not('color', 'is', null)

  if (error) {
    console.error('getTakenColors error:', error)
    return []
  }
  return (data ?? []) as ProfileColorOwner[]
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. (These functions will fail at runtime until Task 1's migration is applied — that's expected and out of scope for type-checking.)

- [ ] **Step 3: Commit**

```bash
git add lib/actions/profile.ts
git commit -m "feat: add updateProfileName/updateProfileColor/getTakenColors server actions"
```

---

### Task 5: Profile page — `app/admin/profile/page.tsx`

**Files:**
- Create: `app/admin/profile/page.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 3's extended `Profile`), `AVATAR_COLORS`/`getAvatarColor` (Task 2), `updateProfileName`/`updateProfileColor`/`getTakenColors`/`ProfileColorOwner` (Task 4), `C` from `lib/admin-theme.ts`.

- [ ] **Step 1: Write the page**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { C } from '@/lib/admin-theme'
import { AVATAR_COLORS, getAvatarColor } from '@/lib/avatar-colors'
import { updateProfileName, updateProfileColor, getTakenColors, type ProfileColorOwner } from '@/lib/actions/profile'

export default function ProfilePage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  const [name, setName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const [takenColors, setTakenColors] = useState<ProfileColorOwner[]>([])
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [colorSavingHex, setColorSavingHex] = useState<string | null>(null)
  const [colorError, setColorError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '')
      setSelectedColor(profile.color ?? null)
    }
  }, [profile])

  useEffect(() => {
    getTakenColors().then(setTakenColors)
  }, [])

  async function handleSaveName() {
    setNameSaving(true)
    setNameError(null)
    setNameSaved(false)
    const result = await updateProfileName(name)
    if (result.error) {
      setNameError(result.error)
    } else {
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    }
    setNameSaving(false)
  }

  async function handleSelectColor(color: string) {
    if (colorSavingHex || !profile) return
    const previous = selectedColor
    setSelectedColor(color)
    setColorSavingHex(color)
    setColorError(null)
    const result = await updateProfileColor(color)
    if (result.error) {
      setSelectedColor(previous)
      setColorError(result.error)
      getTakenColors().then(setTakenColors)
    } else {
      setTakenColors(prev => [
        ...prev.filter(p => p.id !== profile.id),
        { id: profile.id, name: profile.name, color },
      ])
    }
    setColorSavingHex(null)
  }

  if (loading || !profile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  const previewColor = getAvatarColor({ id: profile.id, color: selectedColor })
  const initials = (name || profile.email)[0]?.toUpperCase() ?? '?'

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 24px' }}>

        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Min profil
        </h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 28 }}>
          {profile.email}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
            background: `${previewColor}22`,
            border: `2px solid ${previewColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-dm-sans)', fontSize: '1.3rem', fontWeight: 700,
            color: previewColor,
          }}>
            {initials}
          </div>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.text2 }}>
            Slik ser ikonet ditt ut andre steder i appen
          </span>
        </div>

        <section style={{ marginBottom: 32 }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
            Navn
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.text,
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px',
              }}
            />
            <button
              onClick={handleSaveName}
              disabled={nameSaving || !name.trim()}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 600,
                padding: '9px 16px', borderRadius: 8, cursor: nameSaving ? 'wait' : 'pointer',
                background: C.accent, color: '#fff', border: 'none',
                opacity: nameSaving || !name.trim() ? 0.6 : 1,
              }}
            >
              Lagre
            </button>
          </div>
          {nameError && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#E05555', marginTop: 8 }}>{nameError}</p>}
          {nameSaved && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#4CAF7D', marginTop: 8 }}>Lagret.</p>}
        </section>

        <section>
          <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
            Farge
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, maxWidth: 260 }}>
            {AVATAR_COLORS.map(hex => {
              const owner = takenColors.find(p => p.color === hex && p.id !== profile.id)
              const isMine = selectedColor === hex
              const isTaken = !!owner
              return (
                <button
                  key={hex}
                  disabled={isTaken || colorSavingHex !== null}
                  onClick={() => handleSelectColor(hex)}
                  title={isTaken ? `Opptatt av ${owner!.name ?? 'en annen bruker'}` : undefined}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', cursor: isTaken ? 'not-allowed' : 'pointer',
                    background: hex, border: isMine ? `3px solid ${C.text}` : '3px solid transparent',
                    opacity: isTaken ? 0.25 : colorSavingHex && colorSavingHex !== hex ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'opacity 0.15s',
                  }}
                >
                  {isMine && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5L6.5 12L13 4.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
          {colorError && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#E05555', marginTop: 12 }}>{colorError}</p>}
        </section>

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, log in, navigate to `http://localhost:3000/admin/profile`.
Expected (once Task 1's migration has been applied to the DB you're pointed at): page loads, shows your email, name field prefilled, 15 color swatches render, editing the name and clicking "Lagre" persists across a page reload, clicking an unclaimed color swatch immediately shows a checkmark on it.
If the migration hasn't been applied yet, expect a console error from `getTakenColors`/`updateProfileName` about the missing `color` column — that's expected until Task 1 is applied; the page should still render without crashing.

- [ ] **Step 4: Commit**

```bash
git add app/admin/profile/page.tsx
git commit -m "feat: add /admin/profile page for name and avatar color"
```

---

### Task 6: Header integration — clickable name + avatar

**Files:**
- Modify: `app/admin/layout.tsx:1-10` (imports), `app/admin/layout.tsx:213-219` (header right side)

**Interfaces:**
- Consumes: `getAvatarColor` from `lib/avatar-colors.ts` (Task 2), `profile` from `useAuth()` (already in scope in this file, now typed with `color` via Task 3).

- [ ] **Step 1: Add the import**

In `app/admin/layout.tsx`, change:

```tsx
import { C } from '@/lib/admin-theme'
```

to:

```tsx
import { C } from '@/lib/admin-theme'
import { getAvatarColor } from '@/lib/avatar-colors'
```

- [ ] **Step 2: Make the name clickable with an avatar**

Change:

```tsx
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <NotificationBell />
          {profile && (
            <span className="hidden sm:block" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
              {profile.name || profile.email}
            </span>
          )}
          <button
            onClick={logout}
```

to:

```tsx
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <NotificationBell />
          {profile && (
            <Link
              href="/admin/profile"
              className="hidden sm:flex"
              style={{ alignItems: 'center', gap: 8, textDecoration: 'none' }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: getAvatarColor(profile), color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700,
              }}>
                {(profile.name || profile.email)[0].toUpperCase()}
              </span>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                {profile.name || profile.email}
              </span>
            </Link>
          )}
          <button
            onClick={logout}
```

`Link` is already imported at the top of this file (`import Link from 'next/link'`), so no new import is needed for it.

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no new errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, log into `/admin`.
Expected: top-right header shows a small colored initial-circle plus your name, and clicking it navigates to `/admin/profile`.

- [ ] **Step 5: Commit**

```bash
git add app/admin/layout.tsx
git commit -m "feat: make admin header name clickable, link to profile page"
```

---

### Task 7: Wire `color` through `lib/actions/pipeline.ts`

**Files:**
- Modify: `lib/actions/pipeline.ts:1151-1163` (`getAllProfiles`), `lib/actions/pipeline.ts:1277-1292` (`getCurrentUserProfile`)

**Interfaces:**
- Produces: `getAllProfiles(): Promise<{ id: string; name: string | null; email: string; color: string | null }[]>`, `getCurrentUserProfile(): Promise<{ id: string; name: string | null; email: string; color: string | null } | null>`. Consumed by Tasks 10 (pipeline page), 11 (projects page), 13 (postprod page).

- [ ] **Step 1: Update `getAllProfiles`**

Change:

```ts
export async function getAllProfiles(): Promise<{ id: string; name: string | null; email: string }[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .order('name', { ascending: true })
```

to:

```ts
export async function getAllProfiles(): Promise<{ id: string; name: string | null; email: string; color: string | null }[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, color')
      .order('name', { ascending: true })
```

- [ ] **Step 2: Update `getCurrentUserProfile`**

Change:

```ts
export async function getCurrentUserProfile(): Promise<{
  id: string
  name: string | null
  email: string
} | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', user.id)
      .single()
```

to:

```ts
export async function getCurrentUserProfile(): Promise<{
  id: string
  name: string | null
  email: string
  color: string | null
} | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, email, color')
      .eq('id', user.id)
      .single()
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors in `app/admin/pipeline/page.tsx`, `app/admin/projects/[id]/page.tsx`, `app/admin/postprod/[id]/page.tsx` about their local `Profile`/inline types not matching — this is expected and resolved by Tasks 10, 11, 13. Confirm there are no errors inside `lib/actions/pipeline.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: select color in getAllProfiles and getCurrentUserProfile"
```

---

### Task 8: Wire `color` through `lib/actions/preprod.ts`

**Files:**
- Modify: `lib/actions/preprod.ts:86-90` (`PreprodDetail.profiles` type), `lib/actions/preprod.ts:111-114` (profiles select), `lib/actions/preprod.ts:150` (cast)

**Interfaces:**
- Produces: `PreprodDetail.profiles: { id: string; name: string | null; email: string; color: string | null }[]`. Consumed by Tasks 9 (faktura page reads `getPreprodDetail`) and 12 (preprod page).

- [ ] **Step 1: Update the type**

Change:

```ts
export type PreprodDetail = {
  project: ProjectWithPipeline & { preprod: PreprodData; quote_equipment: { name: string }[] }
  tasks: Task[]
  profiles: { id: string; name: string | null; email: string }[]
}
```

to:

```ts
export type PreprodDetail = {
  project: ProjectWithPipeline & { preprod: PreprodData; quote_equipment: { name: string }[] }
  tasks: Task[]
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
}
```

- [ ] **Step 2: Update the select and cast**

Change:

```ts
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email')
      .order('name', { ascending: true })
```

to:

```ts
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email, color')
      .order('name', { ascending: true })
```

Change:

```ts
      profiles: (profiles ?? []) as { id: string; name: string | null; email: string }[],
```

to:

```ts
      profiles: (profiles ?? []) as { id: string; name: string | null; email: string; color: string | null }[],
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors in `app/admin/faktura/[id]/page.tsx` and `app/admin/preprod/[id]/page.tsx` about their local types — expected, resolved by Tasks 9 and 12. No errors inside `lib/actions/preprod.ts` itself.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/preprod.ts
git commit -m "feat: select color in getPreprodDetail profiles list"
```

---

### Task 9: Rollout — `app/admin/faktura/[id]/page.tsx`

**Files:**
- Modify: `app/admin/faktura/[id]/page.tsx:22-45` (palette, hash fn, `Avatar`, `Profile` type), `app/admin/faktura/[id]/page.tsx:183` and `:230` (call sites)

**Interfaces:**
- Consumes: `getAvatarColor` from `lib/avatar-colors.ts` (Task 2); `PreprodDetail.profiles` now carries `color` (Task 8).

- [ ] **Step 1: Add the import**

Near the top of the file, add:

```ts
import { getAvatarColor } from '@/lib/avatar-colors'
```

- [ ] **Step 2: Delete the local palette/hash function, update `Avatar` and `Profile`**

Change:

```tsx
const AVATAR_COLORS = ['#7C5CFC','#4A8FA8','#4CAF7D','#E07B54','#C49434','#B85C8A','#5C9E6B','#6B7EC4']
function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function Avatar({ id, name, size = 28 }: { id: string; name: string | null; size?: number }) {
  const initials = (name ?? 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const color = avatarColor(id)
```

to:

```tsx
function Avatar({ id, name, color, size = 28 }: { id: string; name: string | null; color?: string | null; size?: number }) {
  const initials = (name ?? 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const resolvedColor = getAvatarColor({ id, color })
```

and in the same component, change every remaining `color` reference in the returned JSX (the `background`, `border`, and text `color` style values) from the bare `color` variable to `resolvedColor`:

```tsx
  return (
    <div title={name ?? 'Ukjent'} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${resolvedColor}22`, border: `1.5px solid ${resolvedColor}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-dm-sans)', fontSize: size * 0.38, fontWeight: 700, color: resolvedColor,
    }}>
      {initials}
    </div>
  )
}
```

Change:

```ts
type Profile = { id: string; name: string | null; email: string }
```

to:

```ts
type Profile = { id: string; name: string | null; email: string; color: string | null }
```

- [ ] **Step 3: Pass `color` at both call sites**

Change:

```tsx
                <Avatar id={assignee.id} name={assignee.name} size={24} />
```

to:

```tsx
                <Avatar id={assignee.id} name={assignee.name} color={assignee.color} size={24} />
```

Change:

```tsx
                      <Avatar id={p.id} name={p.name} size={22} />
```

to:

```tsx
                      <Avatar id={p.id} name={p.name} color={p.color} size={22} />
```

(Use the surrounding context from the file to confirm each match — `assignee` is the one rendered in the "Ansvarlig" row, `p` is inside the assignee-picker dropdown's `profiles.map`.)

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors referencing this file.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open any project's `/admin/faktura/[id]` page.
Expected: avatars render identically to before (same hash fallback) since no user has picked a color yet; no console errors.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/faktura/[id]/page.tsx"
git commit -m "refactor: use shared getAvatarColor in faktura page"
```

---

### Task 10: Rollout — `app/admin/pipeline/page.tsx`

**Files:**
- Modify: `app/admin/pipeline/page.tsx:26` (`Profile` type), `app/admin/pipeline/page.tsx:30-45` (palette/hash fn), and all 13 call sites listed below.

**Interfaces:**
- Consumes: `getAvatarColor` from `lib/avatar-colors.ts` (Task 2); `getAllProfiles()` now returns `color` (Task 7).

- [ ] **Step 1: Add the import, delete local palette/hash, extend `Profile`**

Add near the top:

```ts
import { getAvatarColor } from '@/lib/avatar-colors'
```

Change:

```ts
type Profile = { id: string; name: string | null; email: string }
```

to:

```ts
type Profile = { id: string; name: string | null; email: string; color: string | null }
```

Delete entirely:

```ts
const AVATAR_COLORS = [
  '#7C5CFC', // lilla
  '#4A8FA8', // stålblå
  '#4CAF7D', // grønn
  '#E07B54', // terrakotta
  '#C49434', // gull
  '#B85C8A', // rosa
  '#5C9E6B', // mosegrønn
  '#6B7EC4', // lavendel
]

function avatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
```

- [ ] **Step 2: Replace every call site**

Every remaining reference to `avatarColor(X.id)` in this file becomes `getAvatarColor(X)` (pass the whole object, not just its `id` — this is always safe: `getAvatarColor`'s `color` parameter is optional, so objects without a `color` field, like `Task['assignees']` elements, still type-check and simply fall back to the hash). Apply this replacement at each of the following exact occurrences:

- `background: avatarColor(a.id), color: '#fff',` → `background: getAvatarColor(a), color: '#fff',` (inside `MiniAssigneePicker`, `task.assignees.slice(0, 3).map((a, i) => ...)`)
- `background: isAssigned ? avatarColor(p.id) : C.surface, border: ... avatarColor(p.id) : C.border` (two occurrences of `avatarColor(p.id)` on the same style block, inside `MiniAssigneePicker`'s `profiles.map(p => {...})`) → both become `getAvatarColor(p)`
- `background: avatarColor(assignee.id), color: '#fff',` (inside `QuoteAssigneePicker`) → `background: getAvatarColor(assignee), color: '#fff',`
- `color: assignee ? avatarColor(assignee.id) : C.text3,` (inside `QuoteAssigneePicker`) → `color: assignee ? getAvatarColor(assignee) : C.text3,`
- `background: isSelected ? avatarColor(p.id) : C.surface, border: ... avatarColor(p.id) : C.border` (inside `QuoteAssigneePicker`'s `profiles.map(p => {...})`) → both become `getAvatarColor(p)`
- `color: isSelected ? avatarColor(p.id) : C.text,` (inside `QuoteAssigneePicker`) → `color: isSelected ? getAvatarColor(p) : C.text,`
- `stroke={avatarColor(p.id)}` (inside `QuoteAssigneePicker`) → `stroke={getAvatarColor(p)}`
- `background: avatarColor(assignee.id), color: '#fff',` (inside `InvoiceAssigneePicker`) → `background: getAvatarColor(assignee), color: '#fff',`
- `color: assignee ? avatarColor(assignee.id) : C.text3,` (inside `InvoiceAssigneePicker`) → `color: assignee ? getAvatarColor(assignee) : C.text3,`
- `background: isSelected ? avatarColor(p.id) : C.surface, border: ... avatarColor(p.id) : C.border` (inside `InvoiceAssigneePicker`'s `profiles.map(p => {...})`) → both become `getAvatarColor(p)`
- `color: isSelected ? avatarColor(p.id) : C.text,` (inside `InvoiceAssigneePicker`) → `color: isSelected ? getAvatarColor(p) : C.text,`
- `stroke={avatarColor(p.id)}` (inside `InvoiceAssigneePicker`) → `stroke={getAvatarColor(p)}`
- `background: avatarColor(a.id), color: '#fff',` (inside `DraggableCard`'s footer, `allAssignees.slice(0, 5).map((a, i) => ...)`) → `background: getAvatarColor(a), color: '#fff',`

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors referencing this file, and no remaining references to `avatarColor` (verify with `grep -n "avatarColor" app/admin/pipeline/page.tsx` — expect no output).

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open `/admin/pipeline`, open a task's assignee picker and a project's quote/invoice assignee picker.
Expected: avatars render identically to before (no one has picked a color yet); no console errors.

- [ ] **Step 5: Commit**

```bash
git add app/admin/pipeline/page.tsx
git commit -m "refactor: use shared getAvatarColor in pipeline page"
```

---

### Task 11: Rollout — `app/admin/projects/[id]/page.tsx`

**Files:**
- Modify: `app/admin/projects/[id]/page.tsx:30-35` (palette/hash fn), `app/admin/projects/[id]/page.tsx:72` (`Profile` type), `app/admin/projects/[id]/page.tsx:866` and `:920` (call sites)

**Interfaces:**
- Consumes: `getAvatarColor` from `lib/avatar-colors.ts` (Task 2); `getAllProfiles()` now returns `color` (Task 7).

- [ ] **Step 1: Add the import, delete local palette/hash, extend `Profile`**

Add near the top:

```ts
import { getAvatarColor } from '@/lib/avatar-colors'
```

Delete entirely:

```ts
const PROFILE_COLORS = ['#7C5CFC', '#4A9AC4', '#4CAF7D', '#F0A500', '#E8529A', '#E07C3A', '#50C8C8']
function getProfileColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff
  return PROFILE_COLORS[h % PROFILE_COLORS.length]
}
```

Change:

```ts
type Profile = { id: string; name: string | null; email: string }
```

to:

```ts
type Profile = { id: string; name: string | null; email: string; color: string | null }
```

- [ ] **Step 2: Replace both call sites**

Change:

```tsx
                          background: getProfileColor(projectLead.id), color: '#fff',
```

to:

```tsx
                          background: getAvatarColor(projectLead), color: '#fff',
```

Change:

```tsx
                            background: getProfileColor(p.id), color: '#fff',
```

to:

```tsx
                            background: getAvatarColor(p), color: '#fff',
```

(This second one is inside the "Prosjektleder" dropdown's `profiles.map(p => ...)`.)

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors referencing this file, and `grep -n "getProfileColor\|PROFILE_COLORS" "app/admin/projects/[id]/page.tsx"` returns no output.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open any `/admin/projects/[id]` page, open the "Prosjektleder" picker.
Expected: avatars render identically to before; no console errors.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/projects/[id]/page.tsx"
git commit -m "refactor: use shared getAvatarColor in projects page"
```

---

### Task 12: Rollout — `app/admin/preprod/[id]/page.tsx`

**Files:**
- Modify: `app/admin/preprod/[id]/page.tsx:30-50` (palette/hash fn, `Avatar`), lines `284`, `557`, `726`, `877` (four `profiles` prop type declarations), lines `1085-1170`-area call sites (`profileColor` direct calls), and the `Avatar` call sites at lines `453`, `634`, `695`, `803`, `909`, `955`.

**Interfaces:**
- Consumes: `getAvatarColor` from `lib/avatar-colors.ts` (Task 2); `PreprodDetail.profiles` now carries `color` (Task 8).

- [ ] **Step 1: Add the import, delete local palette/hash, update `Avatar`**

Add near the top:

```ts
import { getAvatarColor } from '@/lib/avatar-colors'
```

Change:

```tsx
const PROFILE_COLORS = ['#7C5CFC', '#4A9AC4', '#4CAF7D', '#F0A500', '#E8529A', '#E07C3A']
function profileColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff
  return PROFILE_COLORS[h % PROFILE_COLORS.length]
}

function Avatar({ id, name, size = 26 }: { id: string; name: string | null; size?: number }) {
  const initials = (name ?? 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const color = profileColor(id)
  return (
    <div title={name ?? 'Ukjent'} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${color}22`, border: `1.5px solid ${color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-dm-sans)', fontSize: size * 0.38, fontWeight: 700, color,
    }}>
      {initials}
    </div>
  )
}
```

to:

```tsx
function Avatar({ id, name, color, size = 26 }: { id: string; name: string | null; color?: string | null; size?: number }) {
  const initials = (name ?? 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const resolvedColor = getAvatarColor({ id, color })
  return (
    <div title={name ?? 'Ukjent'} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${resolvedColor}22`, border: `1.5px solid ${resolvedColor}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-dm-sans)', fontSize: size * 0.38, fontWeight: 700, color: resolvedColor,
    }}>
      {initials}
    </div>
  )
}
```

- [ ] **Step 2: Extend the three `profiles` prop types that back real profile lists**

This file declares the same inline profile-list shape in four component signatures: `CrewSection` (line 284), `PostCrewSection` (line 557), `TaskList` (line 726), `InvoiceAssigneeCard` (line 877). All four currently read:

```ts
  profiles: { id: string; name: string | null; email: string }[]
```

Change **all four** occurrences to:

```ts
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
```

- [ ] **Step 3: Replace the two direct `profileColor()` calls**

Change (inside the "Prosjektleder" trigger button):

```tsx
                    background: profileColor(projectLead.id), color: '#fff',
```

to:

```tsx
                    background: getAvatarColor(projectLead), color: '#fff',
```

Change (inside the "Prosjektleder" dropdown's `profiles.map(p => ...)`):

```tsx
                      background: profileColor(p.id), color: '#fff',
```

to:

```tsx
                      background: getAvatarColor(p), color: '#fff',
```

Also update the state declaration for `projectLead` so its type matches (it currently has no `color` field):

```ts
useState<{ id: string; name: string | null; email: string } | null>(null)
```

→ find this exact declaration (it initializes `projectLead`) and change it to:

```ts
useState<{ id: string; name: string | null; email: string; color: string | null } | null>(null)
```

- [ ] **Step 4: Pass `color` at the `Avatar` call sites sourced from a `profiles` list**

These three call sites read from a `profiles`-prop-typed array (now carrying `color` per Step 2) — add the `color` prop:

Change:

```tsx
                          <Avatar id={assigned.id} name={assigned.name} size={22} />
```

to:

```tsx
                          <Avatar id={assigned.id} name={assigned.name} color={assigned.color} size={22} />
```

Change:

```tsx
                              <Avatar id={p.id} name={p.name} size={22} />
```

to:

```tsx
                              <Avatar id={p.id} name={p.name} color={p.color} size={22} />
```

(this occurs twice in the file with this exact text — once inside the crew "Tildel" dropdown around line 695, once inside `InvoiceAssigneeCard`'s dropdown around line 955; apply to both)

Change:

```tsx
            <Avatar id={assignee.id} name={assignee.name} size={22} />
```

to:

```tsx
            <Avatar id={assignee.id} name={assignee.name} color={assignee.color} size={22} />
```

(inside `InvoiceAssigneeCard`, around line 909)

Leave the remaining two `Avatar` call sites **unchanged** — they read from `PreprodCrewMember`/`Task['assignees']`, which don't carry `color` in this plan's scope, so they keep using the hash fallback automatically via the updated `Avatar` component:

```tsx
                          <Avatar id={member.profile_id} name={member.name} />
```

(crew member, ~line 453 — no change)

```tsx
                  <Avatar key={a.id} id={a.id} name={a.name} size={24} />
```

(task assignee, ~line 803 — no change)

- [ ] **Step 5: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors referencing this file, and `grep -n "profileColor\|PROFILE_COLORS" "app/admin/preprod/[id]/page.tsx"` returns no output.

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, open any `/admin/preprod/[id]` page, open the crew "Tildel" picker, the "Prosjektleder" picker, and the invoice-assignee picker.
Expected: avatars render identically to before; no console errors.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/preprod/[id]/page.tsx"
git commit -m "refactor: use shared getAvatarColor in preprod page"
```

---

### Task 13: Rollout — `app/admin/postprod/[id]/page.tsx`

**Files:**
- Modify: `app/admin/postprod/[id]/page.tsx:40-45` (palette/hash fn), the `profiles`/`projectLead`/`currentUser` `useState` type declarations (lines `194`, `200`, `209`), and the 6 direct `getProfileColor()` call sites.

**Interfaces:**
- Consumes: `getAvatarColor` from `lib/avatar-colors.ts` (Task 2); `getAllProfiles()` now returns `color` (Task 7).

- [ ] **Step 1: Add the import, delete local palette/hash**

Add near the top:

```ts
import { getAvatarColor } from '@/lib/avatar-colors'
```

Delete entirely:

```ts
const PROFILE_COLORS = ['#7C5CFC', '#4A9AC4', '#4CAF7D', '#F0A500', '#E8529A', '#E07C3A', '#50C8C8']
function getProfileColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0x7fffffff
  return PROFILE_COLORS[hash % PROFILE_COLORS.length]
}
```

- [ ] **Step 2: Extend the `profiles` and `projectLead` state types**

Find the `useState` declaration that initializes the page's `profiles` list:

```ts
useState<{ id: string; name: string | null; email: string }[]>([])
```

Change it to:

```ts
useState<{ id: string; name: string | null; email: string; color: string | null }[]>([])
```

Find the `useState` declaration that initializes `projectLead`:

```ts
useState<{ id: string; name: string | null; email: string } | null>(null)
```

Change it to:

```ts
useState<{ id: string; name: string | null; email: string; color: string | null } | null>(null)
```

Leave the `currentUser` state declaration unchanged (it isn't rendered through `getProfileColor` anywhere in this file).

- [ ] **Step 3: Replace all 6 call sites**

Change (Prosjektleder trigger button):

```tsx
                          background: getProfileColor(projectLead.id), color: '#fff',
```

to:

```tsx
                          background: getAvatarColor(projectLead), color: '#fff',
```

Change (Prosjektleder dropdown, `profiles.map(p => ...)`):

```tsx
                            background: getProfileColor(p.id), color: '#fff',
```

to:

```tsx
                            background: getAvatarColor(p), color: '#fff',
```

Change (task "Tildelt" button, `selectedTask.assignees.slice(0, 3).map((a, i) => ...)` — `a` has no `color` field, but passing the whole object is still safe and keeps behavior identical to before via the hash fallback):

```tsx
                              background: getProfileColor(a.id), color: '#fff',
```

to:

```tsx
                              background: getAvatarColor(a), color: '#fff',
```

Change (task assignee dropdown, `profiles.map(profile => {...})` — two occurrences of `getProfileColor(profile.id)` in the same style block):

```tsx
                              background: isAssigned ? getProfileColor(profile.id) : C.surface,
                              border: `1px solid ${isAssigned ? getProfileColor(profile.id) : C.border}`,
```

to:

```tsx
                              background: isAssigned ? getAvatarColor(profile) : C.surface,
                              border: `1px solid ${isAssigned ? getAvatarColor(profile) : C.border}`,
```

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors referencing this file, and `grep -n "getProfileColor\|PROFILE_COLORS" "app/admin/postprod/[id]/page.tsx"` returns no output.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open any `/admin/postprod/[id]` page, open the "Prosjektleder" picker and a task's "Tildelt" assignee dropdown.
Expected: avatars render identically to before; no console errors.

- [ ] **Step 6: Commit**

```bash
git add "app/admin/postprod/[id]/page.tsx"
git commit -m "refactor: use shared getAvatarColor in postprod page"
```

---

### Task 14: Full build check

**Files:** none (verification-only task)

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: build succeeds with no type or lint errors across the whole app (this catches any cross-file type mismatch the per-task `tsc --noEmit` runs might have missed once everything is combined).

- [ ] **Step 2: Confirm no leftover references to the old local color helpers**

Run: `grep -rn "avatarColor\|profileColor\|getProfileColor\|PROFILE_COLORS\|AVATAR_COLORS" app/admin --include="*.tsx" | grep -v "lib/avatar-colors"`
Expected: no output (all 5 files now import the shared `getAvatarColor`/`AVATAR_COLORS` from `lib/avatar-colors.ts` instead of declaring their own).

- [ ] **Step 3: Remind Magnus about the pending migration**

Tell the user that `supabase/migrations/083_profile_color.sql` (Task 1) still needs to be applied to the live database before the color feature works end-to-end — the app will run fine without it (falls back to hash colors everywhere, and `/admin/profile`'s color-save calls will error until then).
