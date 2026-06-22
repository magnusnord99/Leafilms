# Album-seleksjon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Legg til album-struktur i kundeseleksjon, individuell album-delelenke med separat seleksjonssporing, og dedikert admin-side.

**Architecture:** Ny `selection_albums`-tabell kobler gallerier til album. `selection_images` får FK til album. `selection_album_picks` sporer individuelle album-seleksjoner separat fra hoved-galleriet. Ruten `/s/[token]` håndterer både galleri-token og album-token.

**Tech Stack:** Next.js App Router, Supabase (PostgreSQL + service client), TypeScript strict, Tailwind CSS v4 / inline styles (følg eksisterende mønster i `GalleryClient.tsx`)

---

## Filkart

**Nye filer:**
- `supabase/migrations/067_selection_albums.sql`
- `lib/actions/selection-albums.ts` — admin album-actions
- `lib/actions/selection-picks.ts` — kunde album-picks actions
- `app/s/[token]/AlbumOverviewClient.tsx` — kunde: album-oversikt
- `app/s/[token]/[album]/page.tsx` — kunde: album-side (server)
- `app/s/[token]/[album]/AlbumGalleryClient.tsx` — kunde: bildegrid per album
- `app/s/[token]/review/page.tsx` — kunde: gjennomgang (server)
- `app/s/[token]/review/ReviewClient.tsx` — kunde: gjennomgang (client)
- `app/admin/projects/[id]/selection/page.tsx` — admin: seleksjon-side (server)
- `app/admin/projects/[id]/selection/SelectionAdminClient.tsx` — admin: hovedklient
- `app/admin/projects/[id]/selection/AlbumCard.tsx` — admin: album-komponent
- `app/admin/selections/page.tsx` — admin: global oversikt

**Modifiserte filer:**
- `lib/actions/selections.ts` — `getGalleryForCustomer`, `registerUploadedImages`, `getSelectedFilenames`, `galleryTokenExists`
- `app/s/[token]/page.tsx` — routing for gallery vs album token
- `app/s/[token]/PinClient.tsx` — generalisert til å ta `verifyAction` som prop
- `app/admin/projects/[id]/page.tsx` — erstatt SelectionGallery med lenke-knapp

---

## Task 1: Database-migrasjon

**Files:**
- Create: `supabase/migrations/067_selection_albums.sql`

- [ ] **Opprett migrasjonsfilen:**

```sql
-- 067_selection_albums.sql

CREATE TABLE IF NOT EXISTS selection_albums (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id         UUID        NOT NULL REFERENCES selection_galleries(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  slug               TEXT        NOT NULL,
  sort_order         INTEGER     NOT NULL DEFAULT 0,
  album_token        TEXT        UNIQUE,
  album_pin_code     TEXT,
  album_target_count INTEGER,
  album_status       TEXT        NOT NULL DEFAULT 'open'
                     CHECK (album_status IN ('open', 'submitted')),
  album_submitted_at TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(gallery_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_selection_albums_gallery
  ON selection_albums(gallery_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_selection_albums_token
  ON selection_albums(album_token) WHERE album_token IS NOT NULL;

ALTER TABLE selection_images
  ADD COLUMN IF NOT EXISTS album_id UUID
  REFERENCES selection_albums(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_selection_images_album
  ON selection_images(album_id, sort_order);

CREATE TABLE IF NOT EXISTS selection_album_picks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id    UUID        NOT NULL REFERENCES selection_albums(id) ON DELETE CASCADE,
  image_id    UUID        NOT NULL REFERENCES selection_images(id) ON DELETE CASCADE,
  selected    BOOLEAN     NOT NULL DEFAULT false,
  selected_at TIMESTAMPTZ,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(album_id, image_id)
);

CREATE INDEX IF NOT EXISTS idx_selection_album_picks_album
  ON selection_album_picks(album_id);

ALTER TABLE selection_album_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE selection_albums      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated full access albums"
  ON selection_albums FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "authenticated full access album picks"
  ON selection_album_picks FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

- [ ] **Kjør mot Supabase:**

```bash
npx supabase db push
```

Forventet: migrasjon kjøres uten feil. Tabell `selection_albums`, kolonne `selection_images.album_id`, tabell `selection_album_picks` opprettet.

- [ ] **Commit:**

```bash
git add supabase/migrations/067_selection_albums.sql
git commit -m "feat: migrasjon 067 — selection_albums og selection_album_picks"
```

---

## Task 2: Admin album-actions

**Files:**
- Create: `lib/actions/selection-albums.ts`

- [ ] **Opprett filen med typer og actions:**

```ts
'use server'

import { createClient, createServiceClient } from '@/lib/supabase-server'

const SIGNED_URL_EXPIRY = 60 * 60 * 2

export type SelectionAlbum = {
  id: string
  gallery_id: string
  name: string
  slug: string
  sort_order: number
  album_token: string | null
  album_pin_code: string | null
  album_target_count: number | null
  album_status: 'open' | 'submitted'
  album_submitted_at: string | null
  created_at: string
  updated_at: string
}

export type AlbumWithImages = SelectionAlbum & {
  images: {
    id: string
    filename: string
    storage_path: string | null
    sort_order: number
    selected: boolean
    comment: string | null
    selected_at: string | null
    album_id: string | null
    signedUrl: string
  }[]
  selectedCount: number
}

export type AdminSelectionPageData = {
  gallery: {
    id: string
    project_id: string
    token: string
    pin_code: string
    target_count: number | null
    status: 'open' | 'submitted' | 'purged'
    submitted_at: string | null
    created_at: string
  }
  albums: AlbumWithImages[]
  ungroupedImages: {
    id: string
    filename: string
    storage_path: string | null
    sort_order: number
    selected: boolean
    comment: string | null
    selected_at: string | null
    album_id: string | null
    signedUrl: string
  }[]
  totalSelected: number
  totalImages: number
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function generateToken(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let token = ''
  for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)]
  return token
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

export async function getAdminSelectionPage(projectId: string): Promise<AdminSelectionPageData | null> {
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: gallery } = await supabase
    .from('selection_galleries')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!gallery) return null

  const { data: albums } = await supabase
    .from('selection_albums')
    .select('*')
    .eq('gallery_id', gallery.id)
    .order('sort_order', { ascending: true })

  const { data: allImages } = await supabase
    .from('selection_images')
    .select('*')
    .eq('gallery_id', gallery.id)
    .order('sort_order', { ascending: true })

  const imgs = (allImages ?? []) as {
    id: string; filename: string; storage_path: string | null
    sort_order: number; selected: boolean; comment: string | null
    selected_at: string | null; album_id: string | null
  }[]

  const paths = imgs.filter(i => i.storage_path).map(i => i.storage_path!)
  const signedUrlMap: Record<string, string> = {}

  if (paths.length > 0) {
    const { data: urlData } = await service.storage
      .from('selections')
      .createSignedUrls(paths, SIGNED_URL_EXPIRY)
    for (const item of urlData ?? []) {
      if (item.signedUrl && item.path) signedUrlMap[item.path] = item.signedUrl
    }
  }

  const withUrl = imgs.map(img => ({
    ...img,
    signedUrl: img.storage_path ? (signedUrlMap[img.storage_path] ?? '') : '',
  }))

  const albumList = (albums ?? []) as SelectionAlbum[]
  const albumsWithImages: AlbumWithImages[] = albumList.map(album => {
    const albumImages = withUrl.filter(i => i.album_id === album.id)
    return {
      ...album,
      images: albumImages,
      selectedCount: albumImages.filter(i => i.selected).length,
    }
  })

  const ungroupedImages = withUrl.filter(i => i.album_id === null)
  const totalSelected = withUrl.filter(i => i.selected).length

  return {
    gallery: gallery as AdminSelectionPageData['gallery'],
    albums: albumsWithImages,
    ungroupedImages,
    totalSelected,
    totalImages: imgs.length,
  }
}

export async function createAlbum(galleryId: string, name: string): Promise<SelectionAlbum> {
  const supabase = await createClient()
  const slug = slugify(name) || `album-${Date.now()}`

  const { data: existing } = await supabase
    .from('selection_albums')
    .select('id')
    .eq('gallery_id', galleryId)
    .eq('slug', slug)
    .maybeSingle()

  const finalSlug = existing ? `${slug}-${Date.now()}` : slug

  const { data: maxOrder } = await supabase
    .from('selection_albums')
    .select('sort_order')
    .eq('gallery_id', galleryId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('selection_albums')
    .insert({
      gallery_id: galleryId,
      name,
      slug: finalSlug,
      sort_order: (maxOrder?.sort_order ?? -1) + 1,
    })
    .select('*')
    .single()

  if (error || !data) throw new Error('Kunne ikke opprette album')
  return data as SelectionAlbum
}

export async function updateAlbum(
  albumId: string,
  updates: { name?: string; sort_order?: number }
): Promise<void> {
  const supabase = await createClient()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (updates.name !== undefined) {
    patch.name = updates.name
    patch.slug = slugify(updates.name) || `album-${Date.now()}`
  }
  if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order
  await supabase.from('selection_albums').update(patch).eq('id', albumId)
}

export async function deleteAlbum(albumId: string): Promise<void> {
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: images } = await supabase
    .from('selection_images')
    .select('storage_path')
    .eq('album_id', albumId)
    .not('storage_path', 'is', null)

  const paths = (images ?? []).map(i => i.storage_path).filter(Boolean) as string[]
  if (paths.length > 0) {
    await service.storage.from('selections').remove(paths)
  }

  await supabase.from('selection_images').delete().eq('album_id', albumId)
  await supabase.from('selection_albums').delete().eq('id', albumId)
}

export async function reorderAlbums(albumIds: string[]): Promise<void> {
  const supabase = await createClient()
  await Promise.all(
    albumIds.map((id, index) =>
      supabase
        .from('selection_albums')
        .update({ sort_order: index, updated_at: new Date().toISOString() })
        .eq('id', id)
    )
  )
}

export async function enableAlbumSharing(
  albumId: string,
  targetCount?: number
): Promise<{ token: string; pinCode: string }> {
  const supabase = await createClient()
  const token = generateToken()
  const pinCode = generatePin()

  await supabase
    .from('selection_albums')
    .update({
      album_token: token,
      album_pin_code: pinCode,
      album_target_count: targetCount ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', albumId)

  return { token, pinCode }
}

export async function disableAlbumSharing(albumId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('selection_albums')
    .update({
      album_token: null,
      album_pin_code: null,
      album_target_count: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', albumId)
}

export async function getAllGalleriesOverview(): Promise<{
  galleryId: string
  projectId: string
  projectName: string
  status: string
  albumCount: number
  totalSelected: number
  targetCount: number | null
  submittedAt: string | null
  createdAt: string
}[]> {
  const supabase = await createClient()

  const { data: galleries } = await supabase
    .from('selection_galleries')
    .select(`
      id, project_id, status, target_count, submitted_at, created_at,
      projects ( name )
    `)
    .neq('status', 'purged')
    .order('created_at', { ascending: false })

  if (!galleries) return []

  return Promise.all(
    galleries.map(async (g) => {
      const { count: albumCount } = await supabase
        .from('selection_albums')
        .select('id', { count: 'exact', head: true })
        .eq('gallery_id', g.id)

      const { count: selectedCount } = await supabase
        .from('selection_images')
        .select('id', { count: 'exact', head: true })
        .eq('gallery_id', g.id)
        .eq('selected', true)

      const proj = g.projects as unknown as { name: string } | null

      return {
        galleryId: g.id,
        projectId: g.project_id,
        projectName: proj?.name ?? '—',
        status: g.status,
        albumCount: albumCount ?? 0,
        totalSelected: selectedCount ?? 0,
        targetCount: g.target_count,
        submittedAt: g.submitted_at,
        createdAt: g.created_at,
      }
    })
  )
}
```

- [ ] **Typekontroll:**

```bash
npx tsc --noEmit
```

Forventet: ingen feil relatert til `lib/actions/selection-albums.ts`.

- [ ] **Commit:**

```bash
git add lib/actions/selection-albums.ts
git commit -m "feat: admin album-actions (create, update, delete, share, overview)"
```

---

## Task 3: Kunde album-picks actions

**Files:**
- Create: `lib/actions/selection-picks.ts`

- [ ] **Opprett filen:**

```ts
'use server'

import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase-server'
import type { SelectionAlbum } from './selection-albums'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIGNED_URL_EXPIRY = 60 * 60 * 2
const MAX_PIN_ATTEMPTS = 5
const PIN_LOCKOUT_MINUTES = 15

export type SelectionAlbumPick = {
  id: string
  album_id: string
  image_id: string
  selected: boolean
  selected_at: string | null
  comment: string | null
}

export type AlbumImageWithPick = {
  id: string
  filename: string
  storage_path: string | null
  sort_order: number
  album_id: string | null
  signedUrl: string
  pick: SelectionAlbumPick | null
}

export type CustomerAlbumData = {
  album: SelectionAlbum
  images: AlbumImageWithPick[]
  selectedCount: number
}

function albumCookieKey(albumToken: string) {
  return `salb_${albumToken.slice(0, 16)}`
}

export async function verifyAlbumPin(
  albumToken: string,
  pin: string
): Promise<{ ok: boolean; error?: string; locked?: boolean }> {
  const service = createServiceClient()

  const { data: album, error } = await service
    .from('selection_albums')
    .select('id, album_pin_code, album_status, album_token')
    .eq('album_token', albumToken)
    .single()

  if (error || !album) return { ok: false, error: 'Fant ikke albumet' }
  if (pin !== album.album_pin_code) {
    return { ok: false, error: 'Feil PIN' }
  }

  const cookieStore = await cookies()
  cookieStore.set(albumCookieKey(albumToken), album.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/s/${albumToken}`,
    maxAge: COOKIE_MAX_AGE,
  })

  return { ok: true }
}

export async function albumTokenExists(token: string): Promise<boolean> {
  const service = createServiceClient()
  const { count } = await service
    .from('selection_albums')
    .select('id', { count: 'exact', head: true })
    .eq('album_token', token)
  return (count ?? 0) > 0
}

export async function getAlbumForCustomer(
  albumToken: string
): Promise<CustomerAlbumData | null> {
  const cookieStore = await cookies()
  const albumId = cookieStore.get(albumCookieKey(albumToken))?.value
  if (!albumId) return null

  const service = createServiceClient()

  const { data: album } = await service
    .from('selection_albums')
    .select('*')
    .eq('id', albumId)
    .eq('album_token', albumToken)
    .single()

  if (!album) return null

  const { data: images } = await service
    .from('selection_images')
    .select('*')
    .eq('album_id', albumId)
    .order('sort_order', { ascending: true })

  const imgs = (images ?? []) as {
    id: string; filename: string; storage_path: string | null
    sort_order: number; album_id: string | null
  }[]

  const paths = imgs.filter(i => i.storage_path).map(i => i.storage_path!)
  const signedUrlMap: Record<string, string> = {}

  if (paths.length > 0) {
    const { data: urlData } = await service.storage
      .from('selections')
      .createSignedUrls(paths, SIGNED_URL_EXPIRY)
    for (const item of urlData ?? []) {
      if (item.signedUrl && item.path) signedUrlMap[item.path] = item.signedUrl
    }
  }

  const { data: picks } = await service
    .from('selection_album_picks')
    .select('*')
    .eq('album_id', albumId)

  const pickMap: Record<string, SelectionAlbumPick> = {}
  for (const p of picks ?? []) pickMap[p.image_id] = p as SelectionAlbumPick

  const imagesWithPicks: AlbumImageWithPick[] = imgs.map(img => ({
    ...img,
    signedUrl: img.storage_path ? (signedUrlMap[img.storage_path] ?? '') : '',
    pick: pickMap[img.id] ?? null,
  }))

  return {
    album: album as SelectionAlbum,
    images: imagesWithPicks,
    selectedCount: imagesWithPicks.filter(i => i.pick?.selected).length,
  }
}

export async function toggleAlbumImagePick(
  albumToken: string,
  imageId: string,
  selected: boolean
): Promise<void> {
  const cookieStore = await cookies()
  const albumId = cookieStore.get(albumCookieKey(albumToken))?.value
  if (!albumId) throw new Error('Ikke autorisert')

  const service = createServiceClient()

  const { data: img } = await service
    .from('selection_images')
    .select('album_id')
    .eq('id', imageId)
    .single()

  if (img?.album_id !== albumId) throw new Error('Ikke autorisert')

  await service
    .from('selection_album_picks')
    .upsert({
      album_id: albumId,
      image_id: imageId,
      selected,
      selected_at: selected ? new Date().toISOString() : null,
    }, { onConflict: 'album_id,image_id' })
}

export async function addAlbumImagePickComment(
  albumToken: string,
  imageId: string,
  comment: string
): Promise<void> {
  const cookieStore = await cookies()
  const albumId = cookieStore.get(albumCookieKey(albumToken))?.value
  if (!albumId) throw new Error('Ikke autorisert')

  const service = createServiceClient()

  await service
    .from('selection_album_picks')
    .upsert({
      album_id: albumId,
      image_id: imageId,
      comment: comment.trim() || null,
      selected: false,
    }, { onConflict: 'album_id,image_id' })
}

export async function submitAlbumPicks(albumToken: string): Promise<void> {
  const cookieStore = await cookies()
  const albumId = cookieStore.get(albumCookieKey(albumToken))?.value
  if (!albumId) throw new Error('Ikke autorisert')

  const service = createServiceClient()
  const now = new Date().toISOString()

  await service
    .from('selection_albums')
    .update({ album_status: 'submitted', album_submitted_at: now, updated_at: now })
    .eq('id', albumId)
}
```

- [ ] **Typekontroll:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add lib/actions/selection-picks.ts
git commit -m "feat: kunde album-picks actions (verify, toggle, comment, submit)"
```

---

## Task 4: Oppdater selections.ts for album-støtte

**Files:**
- Modify: `lib/actions/selections.ts`

- [ ] **Legg til `album_id` i `SelectionImage`-typen** (linje ~30):

```ts
export type SelectionImage = {
  id: string
  gallery_id: string
  filename: string
  storage_path: string | null
  sort_order: number
  selected: boolean
  comment: string | null
  selected_at: string | null
  album_id: string | null   // ← legg til denne
  signedUrl?: string
}
```

- [ ] **Oppdater `registerUploadedImages`** — legg til valgfri `albumId` i filene:

```ts
export async function registerUploadedImages(
  galleryId: string,
  files: { filename: string; storagePath: string; sortOrder: number; albumId?: string }[]
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase.from('selection_images').insert(
    files.map(f => ({
      gallery_id: galleryId,
      filename: f.filename,
      storage_path: f.storagePath,
      sort_order: f.sortOrder,
      album_id: f.albumId ?? null,
    }))
  )

  if (error) {
    console.error('registerUploadedImages error:', error)
    throw new Error('Kunne ikke registrere bilder')
  }

  await supabase
    .from('selection_galleries')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', galleryId)
}
```

- [ ] **Oppdater `galleryTokenExists`** — sjekk også album-tokens slik at PinClient kan brukes for begge typer:

Erstatt eksisterende `galleryTokenExists` med:

```ts
export async function galleryTokenExists(token: string): Promise<boolean> {
  const service = createServiceClient()

  const { count: galleryCount } = await service
    .from('selection_galleries')
    .select('id', { count: 'exact', head: true })
    .eq('token', token)

  if ((galleryCount ?? 0) > 0) return true

  const { count: albumCount } = await service
    .from('selection_albums')
    .select('id', { count: 'exact', head: true })
    .eq('album_token', token)

  return (albumCount ?? 0) > 0
}
```

- [ ] **Oppdater `getGalleryForCustomer`** — returner albums gruppert. Erstatt hele funksjonen:

```ts
export type AlbumForCustomer = {
  id: string
  name: string
  slug: string
  images: (SelectionImage & { signedUrl: string })[]
  selectedCount: number
}

export async function getGalleryForCustomer(token: string): Promise<{
  gallery: SelectionGallery
  albums: AlbumForCustomer[]
  legacyImages: (SelectionImage & { signedUrl: string })[]
} | null> {
  const cookieStore = await cookies()
  const galleryIdFromCookie = cookieStore.get(cookieKey(token))?.value
  if (!galleryIdFromCookie) return null

  const service = createServiceClient()

  const { data: gallery, error } = await service
    .from('selection_galleries')
    .select('*')
    .eq('id', galleryIdFromCookie)
    .eq('token', token)
    .single()

  if (error || !gallery) return null

  const { data: images } = await service
    .from('selection_images')
    .select('*')
    .eq('gallery_id', gallery.id)
    .order('sort_order', { ascending: true })

  const imgs = (images ?? []) as SelectionImage[]
  const paths = imgs.filter(i => i.storage_path).map(i => i.storage_path!)
  const signedUrlMap: Record<string, string> = {}

  if (paths.length > 0) {
    const { data: urlData } = await service.storage
      .from('selections')
      .createSignedUrls(paths, SIGNED_URL_EXPIRY)
    for (const item of urlData ?? []) {
      if (item.signedUrl && item.path) signedUrlMap[item.path] = item.signedUrl
    }
  }

  const withUrl = imgs.map(img => ({
    ...img,
    signedUrl: img.storage_path ? (signedUrlMap[img.storage_path] ?? '') : '',
  }))

  const { data: albumRows } = await service
    .from('selection_albums')
    .select('id, name, slug, sort_order')
    .eq('gallery_id', gallery.id)
    .order('sort_order', { ascending: true })

  const albumList = (albumRows ?? []) as { id: string; name: string; slug: string; sort_order: number }[]

  if (albumList.length === 0) {
    return {
      gallery: gallery as SelectionGallery,
      albums: [],
      legacyImages: withUrl,
    }
  }

  const albums: AlbumForCustomer[] = albumList.map(album => {
    const albumImages = withUrl.filter(i => i.album_id === album.id)
    return {
      ...album,
      images: albumImages,
      selectedCount: albumImages.filter(i => i.selected).length,
    }
  })

  return {
    gallery: gallery as SelectionGallery,
    albums,
    legacyImages: [],
  }
}
```

- [ ] **Typekontroll:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add lib/actions/selections.ts
git commit -m "feat: utvid selections.ts med album-støtte og bakoverkompatibilitet"
```

---

## Task 5: Generaliser PinClient

**Files:**
- Modify: `app/s/[token]/PinClient.tsx`

- [ ] **Endre PinClient til å ta `verifyAction` som prop** — erstatt hele filen:

```tsx
'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

const S = {
  bg:      '#0C0B09',
  surface: '#131210',
  border:  '#2A2820',
  gold:    '#C49434',
  text:    '#E8E0D0',
  text2:   '#8A8070',
  danger:  '#C0503A',
}

type VerifyResult = { ok: boolean; error?: string; locked?: boolean }

export default function PinClient({
  token,
  verifyAction,
}: {
  token: string
  verifyAction: (token: string, pin: string) => Promise<VerifyResult>
}) {
  const [pin, setPin] = useState(['', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]
  const router = useRouter()

  function handleDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...pin]
    next[index] = digit
    setPin(next)
    setError(null)
    if (digit && index < 3) refs[index + 1].current?.focus()
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      refs[index - 1].current?.focus()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = pin.join('')
    if (code.length < 4) return
    setLoading(true)
    setError(null)
    try {
      const res = await verifyAction(token, code)
      if (res.ok) {
        router.refresh()
      } else {
        setError(res.error ?? 'Feil PIN')
        if (res.locked) setLocked(true)
        setPin(['', '', '', ''])
        refs[0].current?.focus()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: S.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'Georgia, serif', fontSize: '1.6rem', letterSpacing: '0.12em',
          color: S.gold, marginBottom: 8, textTransform: 'uppercase',
        }}>
          Leafilms
        </div>
        <p style={{
          fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.82rem',
          color: S.text2, marginBottom: 40,
        }}>
          Bildeseleksjon
        </p>
        <div style={{
          background: S.surface, border: `1px solid ${S.border}`,
          borderRadius: 12, padding: '32px 28px',
        }}>
          <p style={{
            fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.95rem',
            color: S.text, marginBottom: 24, fontWeight: 500,
          }}>
            Skriv inn PIN-koden du mottok
          </p>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
              {pin.map((digit, i) => (
                <input
                  key={i}
                  ref={refs[i]}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  disabled={loading || locked}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  style={{
                    width: 52, height: 60, textAlign: 'center', fontSize: '1.4rem',
                    fontWeight: 700, fontFamily: 'var(--font-dm-sans, sans-serif)',
                    background: digit ? 'rgba(196,148,52,0.08)' : S.bg,
                    border: `2px solid ${digit ? S.gold : error ? S.danger : S.border}`,
                    borderRadius: 8, color: S.text,
                    outline: 'none', caretColor: S.gold,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                />
              ))}
            </div>
            {error && (
              <p style={{
                fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.78rem',
                color: S.danger, marginBottom: 16, minHeight: 20,
              }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pin.join('').length < 4 || loading || locked}
              style={{
                width: '100%', padding: '13px', borderRadius: 8, border: 'none',
                fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.88rem',
                fontWeight: 600, cursor: 'pointer',
                background: pin.join('').length === 4 && !locked ? S.gold : '#2A2820',
                color: pin.join('').length === 4 && !locked ? '#0C0B09' : S.text2,
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Verifiserer...' : locked ? 'Låst' : 'Åpne galleri'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Commit:**

```bash
git add app/s/\[token\]/PinClient.tsx
git commit -m "refactor: PinClient tar verifyAction som prop"
```

---

## Task 6: Oppdater /s/[token]/page.tsx routing

**Files:**
- Modify: `app/s/[token]/page.tsx`

- [ ] **Erstatt hele filen:**

```tsx
import { notFound } from 'next/navigation'
import {
  getGalleryForCustomer,
  galleryTokenExists,
  verifyGalleryPin,
} from '@/lib/actions/selections'
import { albumTokenExists, getAlbumForCustomer, verifyAlbumPin } from '@/lib/actions/selection-picks'
import PinClient from './PinClient'
import GalleryClient from './GalleryClient'
import AlbumOverviewClient from './AlbumOverviewClient'
import AlbumGalleryClient from './[album]/AlbumGalleryClient'

export default async function SelectionPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Sjekk om token er et album-token
  if (await albumTokenExists(token)) {
    const albumData = await getAlbumForCustomer(token)
    if (!albumData) {
      return <PinClient token={token} verifyAction={verifyAlbumPin} />
    }
    return (
      <AlbumGalleryClient
        token={token}
        album={albumData.album}
        images={albumData.images}
        isDirectAlbumLink
      />
    )
  }

  // Galleri-token
  const data = await getGalleryForCustomer(token)

  if (!data) {
    if (!(await galleryTokenExists(token))) notFound()
    return <PinClient token={token} verifyAction={verifyGalleryPin} />
  }

  // Bakoverkompatibilitet: ingen album → gammel flat visning
  if (data.albums.length === 0) {
    return (
      <GalleryClient
        token={token}
        gallery={data.gallery}
        images={data.legacyImages}
      />
    )
  }

  return (
    <AlbumOverviewClient
      token={token}
      gallery={data.gallery}
      albums={data.albums}
    />
  )
}
```

- [ ] **Typekontroll:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add app/s/\[token\]/page.tsx
git commit -m "feat: /s/[token] router støtter galleri-token og album-token"
```

---

## Task 7: AlbumOverviewClient

**Files:**
- Create: `app/s/[token]/AlbumOverviewClient.tsx`

- [ ] **Opprett filen:**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { SelectionGallery } from '@/lib/actions/selections'
import type { AlbumForCustomer } from '@/lib/actions/selections'

const S = {
  bg:      '#0C0B09',
  surface: '#131210',
  surface2:'#1A1916',
  border:  '#2A2820',
  gold:    '#C49434',
  goldBg:  'rgba(196,148,52,0.08)',
  text:    '#E8E0D0',
  text2:   '#8A8070',
  text3:   '#5A5448',
  green:   '#4CAF7D',
  warning: '#D4863A',
}

export default function AlbumOverviewClient({
  token,
  gallery,
  albums,
}: {
  token: string
  gallery: SelectionGallery
  albums: AlbumForCustomer[]
}) {
  const router = useRouter()
  const totalSelected = albums.reduce((sum, a) => sum + a.selectedCount, 0)
  const target = gallery.target_count
  const isOver = target != null && totalSelected > target

  const counterColor = isOver ? S.warning : (target != null && totalSelected === target) ? S.green : S.text
  const counterLabel = target != null ? `${totalSelected} av ${target} valgt` : `${totalSelected} valgt`

  return (
    <div style={{ minHeight: '100dvh', background: S.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        background: S.surface, borderBottom: `1px solid ${S.border}`,
        padding: '13px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase' }}>
          Leafilms
        </span>
        <span style={{ fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600, color: counterColor }}>
          {counterLabel}
        </span>
      </div>

      {isOver && (
        <div style={{ background: 'rgba(212,134,58,0.12)', borderBottom: '1px solid rgba(212,134,58,0.3)', padding: '8px 16px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.78rem', color: S.warning }}>
            Du har valgt {totalSelected} av {target} avtalte bilder — bilder utover avtalen kan medføre tillegg.
          </p>
        </div>
      )}

      {/* Album-grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, maxWidth: 860, margin: '0 auto' }}>
          {albums.map(album => (
            <AlbumCard
              key={album.id}
              album={album}
              onClick={() => router.push(`/s/${token}/${album.slug}`)}
            />
          ))}

          {/* Se alle valgte-kort */}
          {totalSelected > 0 && (
            <div
              onClick={() => router.push(`/s/${token}/review`)}
              style={{
                borderRadius: 8, overflow: 'hidden', border: `1px solid rgba(196,148,52,0.3)`,
                cursor: 'pointer', background: S.goldBg,
              }}
            >
              <div style={{
                aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(196,148,52,0.05)',
              }}>
                <span style={{ fontSize: '2rem' }}>✓</span>
              </div>
              <div style={{ padding: '10px 12px', background: S.goldBg }}>
                <div style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', fontWeight: 600, color: S.gold }}>
                  Se alle valgte ({totalSelected})
                </div>
                <div style={{ fontFamily: 'sans-serif', fontSize: '0.68rem', color: S.text2, marginTop: 2 }}>
                  Gjennomgå før innsending
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Send inn-knapp */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${S.border}`, background: S.surface, flexShrink: 0 }}>
        <button
          onClick={() => router.push(`/s/${token}/review`)}
          disabled={totalSelected === 0}
          style={{
            width: '100%', padding: '13px', borderRadius: 9, border: 'none',
            fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600,
            cursor: totalSelected > 0 ? 'pointer' : 'not-allowed',
            background: totalSelected > 0 ? S.gold : S.surface2,
            color: totalSelected > 0 ? '#0C0B09' : S.text3,
            transition: 'background 0.15s',
          }}
        >
          {`Send inn utvalg (${totalSelected})`}
        </button>
      </div>
    </div>
  )
}

function AlbumCard({ album, onClick }: { album: AlbumForCustomer; onClick: () => void }) {
  const coverImage = album.images[0]

  return (
    <div
      onClick={onClick}
      style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid #2A2820', cursor: 'pointer' }}
    >
      <div style={{ aspectRatio: '16/9', background: '#1A1916', overflow: 'hidden', position: 'relative' }}>
        {coverImage?.signedUrl ? (
          <img
            src={coverImage.signedUrl}
            alt={album.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: '#1A1916' }} />
        )}
        {album.selectedCount > 0 && (
          <div style={{
            position: 'absolute', bottom: 6, right: 6,
            background: 'rgba(196,148,52,0.9)', color: '#0C0B09',
            fontSize: '0.62rem', fontWeight: 700, fontFamily: 'sans-serif',
            padding: '2px 7px', borderRadius: 8,
          }}>
            {album.selectedCount} valgt
          </div>
        )}
      </div>
      <div style={{ padding: '9px 11px', background: '#131210' }}>
        <div style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', fontWeight: 600, color: '#E8E0D0' }}>
          {album.name}
        </div>
        <div style={{ fontFamily: 'sans-serif', fontSize: '0.68rem', color: '#8A8070', marginTop: 2 }}>
          {album.images.length} bilder
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Typekontroll:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add app/s/\[token\]/AlbumOverviewClient.tsx
git commit -m "feat: AlbumOverviewClient — kunde album-oversikt"
```

---

## Task 8: Album-galleri sub-rute

**Files:**
- Create: `app/s/[token]/[album]/page.tsx`
- Create: `app/s/[token]/[album]/AlbumGalleryClient.tsx`

- [ ] **Opprett `app/s/[token]/[album]/page.tsx`:**

```tsx
import { notFound } from 'next/navigation'
import { getGalleryForCustomer, galleryTokenExists, verifyGalleryPin } from '@/lib/actions/selections'
import PinClient from '../PinClient'
import AlbumGalleryClient from './AlbumGalleryClient'

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ token: string; album: string }>
}) {
  const { token, album: albumSlug } = await params

  const data = await getGalleryForCustomer(token)

  if (!data) {
    if (!(await galleryTokenExists(token))) notFound()
    return <PinClient token={token} verifyAction={verifyGalleryPin} />
  }

  const album = data.albums.find(a => a.slug === albumSlug)
  if (!album) notFound()

  return (
    <AlbumGalleryClient
      token={token}
      galleryToken={token}
      album={album}
      images={album.images}
      totalSelected={data.albums.reduce((s, a) => s + a.selectedCount, 0)}
      targetCount={data.gallery.target_count}
      isDirectAlbumLink={false}
    />
  )
}
```

- [ ] **Opprett `app/s/[token]/[album]/AlbumGalleryClient.tsx`:**

```tsx
'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toggleImageSelection, addImageComment } from '@/lib/actions/selections'
import { toggleAlbumImagePick, addAlbumImagePickComment, submitAlbumPicks } from '@/lib/actions/selection-picks'
import type { SelectionAlbum } from '@/lib/actions/selection-albums'
import type { AlbumForCustomer } from '@/lib/actions/selections'
import type { AlbumImageWithPick } from '@/lib/actions/selection-picks'

const S = {
  bg:      '#0C0B09',
  surface: '#131210',
  surface2:'#1A1916',
  border:  '#2A2820',
  gold:    '#C49434',
  text:    '#E8E0D0',
  text2:   '#8A8070',
  text3:   '#5A5448',
  green:   '#4CAF7D',
  warning: '#D4863A',
}

type MainImage = AlbumForCustomer['images'][number]
type AnyImage = MainImage | AlbumImageWithPick

function isSelected(img: AnyImage, isDirect: boolean): boolean {
  if (isDirect) return (img as AlbumImageWithPick).pick?.selected ?? false
  return (img as MainImage).selected
}

function getComment(img: AnyImage, isDirect: boolean): string | null {
  if (isDirect) return (img as AlbumImageWithPick).pick?.comment ?? null
  return (img as MainImage).comment
}

export default function AlbumGalleryClient({
  token,
  galleryToken,
  album,
  images: initialImages,
  totalSelected: initialTotal,
  targetCount,
  isDirectAlbumLink,
}: {
  token: string
  galleryToken?: string
  album: SelectionAlbum | AlbumForCustomer
  images: AnyImage[]
  totalSelected?: number
  targetCount?: number | null
  isDirectAlbumLink: boolean
}) {
  const router = useRouter()
  const [images, setImages] = useState(initialImages)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const localSelected = images.filter(img => isSelected(img, isDirectAlbumLink)).length
  const displayTotal = isDirectAlbumLink ? localSelected : (initialTotal ?? localSelected)
  const target = isDirectAlbumLink ? (album as SelectionAlbum).album_target_count : (targetCount ?? null)
  const isOver = target != null && (isDirectAlbumLink ? localSelected : displayTotal) > target

  const handleToggle = useCallback(async (imageId: string) => {
    const img = images.find(i => i.id === imageId)
    if (!img) return
    const newSelected = !isSelected(img, isDirectAlbumLink)

    setImages(prev => prev.map(i => {
      if (i.id !== imageId) return i
      if (isDirectAlbumLink) {
        const cast = i as AlbumImageWithPick
        return { ...cast, pick: { ...(cast.pick ?? { id: '', album_id: '', image_id: imageId, created_at: '' }), selected: newSelected, selected_at: newSelected ? new Date().toISOString() : null } }
      }
      return { ...(i as MainImage), selected: newSelected, selected_at: newSelected ? new Date().toISOString() : null }
    }))

    if (isDirectAlbumLink) {
      await toggleAlbumImagePick(token, imageId, newSelected)
    } else {
      await toggleImageSelection(galleryToken!, imageId, newSelected)
    }
  }, [images, token, galleryToken, isDirectAlbumLink])

  async function handleSubmit() {
    setSubmitting(true)
    if (isDirectAlbumLink) {
      await submitAlbumPicks(token)
    }
    setSubmitted(true)
    setShowConfirm(false)
    setSubmitting(false)
  }

  useEffect(() => {
    if (lightboxIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setLightboxIndex(p => p !== null ? Math.min(p + 1, images.length - 1) : null)
      if (e.key === 'ArrowLeft') setLightboxIndex(p => p !== null ? Math.max(p - 1, 0) : null)
      if (e.key === 'Escape') setLightboxIndex(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, images.length])

  const albumName = 'name' in album ? album.name : ''
  const counterLabel = target != null
    ? `${isDirectAlbumLink ? localSelected : displayTotal} av ${target} valgt`
    : `${isDirectAlbumLink ? localSelected : displayTotal} valgt`
  const counterColor = isOver ? S.warning : S.text

  if (submitted && isDirectAlbumLink) {
    return (
      <div style={{ minHeight: '100dvh', background: S.bg }}>
        <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: '13px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase' }}>Leafilms</span>
          <span style={{ fontFamily: 'sans-serif', fontSize: '0.7rem', color: S.green }}>✓ Innsendt</span>
        </div>
        <div style={{ maxWidth: 480, margin: '48px auto', padding: '0 16px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.95rem', color: S.green, fontWeight: 600 }}>Takk! Ditt utvalg er mottatt.</p>
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.8rem', color: S.text2, marginTop: 8 }}>
            Du valgte {localSelected} {localSelected === 1 ? 'bilde' : 'bilder'}.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: S.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!isDirectAlbumLink && galleryToken && (
            <button
              onClick={() => router.push(`/s/${galleryToken}`)}
              style={{ background: 'none', border: 'none', color: S.text2, cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }}
            >‹</button>
          )}
          <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase' }}>Leafilms</span>
          {albumName && <span style={{ fontFamily: 'sans-serif', fontSize: '0.75rem', color: S.text3 }}>· {albumName}</span>}
        </div>
        <span style={{ fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600, color: counterColor }}>{counterLabel}</span>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
          {images.map((img, idx) => {
            const sel = isSelected(img, isDirectAlbumLink)
            const signedUrl = (img as { signedUrl: string }).signedUrl
            return (
              <div
                key={img.id}
                style={{ borderRadius: 7, overflow: 'hidden', border: `2px solid ${sel ? S.gold : 'transparent'}`, background: S.surface2, transition: 'border-color 0.12s' }}
              >
                <div
                  style={{ position: 'relative', aspectRatio: '4/3', cursor: 'pointer' }}
                  onClick={() => setLightboxIndex(idx)}
                >
                  {signedUrl
                    ? <img src={signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.6rem', color: S.text3 }}>{img.filename}</span>
                      </div>
                  }
                  {getComment(img, isDirectAlbumLink) && (
                    <div style={{ position: 'absolute', top: 4, left: 4, width: 7, height: 7, borderRadius: '50%', background: S.gold }} />
                  )}
                </div>
                <div style={{ padding: '4px 5px 5px' }}>
                  <button
                    onClick={() => handleToggle(img.id)}
                    style={{
                      width: '100%', padding: '5px', borderRadius: 5, border: 'none',
                      fontFamily: 'sans-serif', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                      background: sel ? S.gold : S.surface,
                      color: sel ? '#0C0B09' : S.text2,
                      transition: 'background 0.12s',
                    }}
                  >
                    {sel ? '✓ Valgt' : 'Velg'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Send inn */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${S.border}`, background: S.surface, flexShrink: 0 }}>
        <button
          onClick={() => {
            if (isDirectAlbumLink) setShowConfirm(true)
            else router.push(`/s/${galleryToken}/review`)
          }}
          disabled={localSelected === 0}
          style={{
            width: '100%', padding: '12px', borderRadius: 9, border: 'none',
            fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600,
            cursor: localSelected > 0 ? 'pointer' : 'not-allowed',
            background: localSelected > 0 ? S.gold : S.surface2,
            color: localSelected > 0 ? '#0C0B09' : S.text3,
          }}
        >
          {isDirectAlbumLink ? `Send inn utvalg (${localSelected})` : `Gå til gjennomgang`}
        </button>
      </div>

      {/* Bekreft-modal for direkte album-link */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(12,11,9,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50 }}>
          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, padding: '28px 24px', maxWidth: 360, width: '100%' }}>
            <p style={{ fontFamily: 'sans-serif', fontSize: '1rem', color: S.text, fontWeight: 600, marginBottom: 12 }}>Send inn utvalg?</p>
            <p style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', color: S.text2, marginBottom: 22 }}>
              Du sender inn {localSelected} {localSelected === 1 ? 'bilde' : 'bilder'}. Dette kan ikke endres etterpå.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${S.border}`, background: 'none', color: S.text2, fontFamily: 'sans-serif', fontSize: '0.85rem', cursor: 'pointer' }}>Avbryt</button>
              <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: S.gold, color: '#0C0B09', fontFamily: 'sans-serif', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Sender...' : 'Bekreft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Typekontroll:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add "app/s/[token]/[album]/"
git commit -m "feat: album-galleri sub-rute og AlbumGalleryClient"
```

---

## Task 9: Review-side

**Files:**
- Create: `app/s/[token]/review/page.tsx`
- Create: `app/s/[token]/review/ReviewClient.tsx`

- [ ] **Opprett `app/s/[token]/review/page.tsx`:**

```tsx
import { notFound } from 'next/navigation'
import { getGalleryForCustomer, galleryTokenExists, verifyGalleryPin } from '@/lib/actions/selections'
import PinClient from '../PinClient'
import ReviewClient from './ReviewClient'

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await getGalleryForCustomer(token)

  if (!data) {
    if (!(await galleryTokenExists(token))) notFound()
    return <PinClient token={token} verifyAction={verifyGalleryPin} />
  }

  const selectedAlbums = data.albums
    .map(album => ({
      ...album,
      images: album.images.filter(i => i.selected),
    }))
    .filter(album => album.images.length > 0)

  const totalSelected = data.albums.reduce((s, a) => s + a.selectedCount, 0)

  return (
    <ReviewClient
      token={token}
      gallery={data.gallery}
      selectedAlbums={selectedAlbums}
      totalSelected={totalSelected}
    />
  )
}
```

- [ ] **Opprett `app/s/[token]/review/ReviewClient.tsx`:**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitGallery } from '@/lib/actions/selections'
import type { SelectionGallery, AlbumForCustomer } from '@/lib/actions/selections'

const S = {
  bg:      '#0C0B09',
  surface: '#131210',
  surface2:'#1A1916',
  border:  '#2A2820',
  gold:    '#C49434',
  text:    '#E8E0D0',
  text2:   '#8A8070',
  text3:   '#5A5448',
  green:   '#4CAF7D',
  warning: '#D4863A',
}

type SelectedAlbum = AlbumForCustomer & { images: AlbumForCustomer['images'] }

export default function ReviewClient({
  token,
  gallery,
  selectedAlbums,
  totalSelected,
}: {
  token: string
  gallery: SelectionGallery
  selectedAlbums: SelectedAlbum[]
  totalSelected: number
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const target = gallery.target_count
  const isOver = target != null && totalSelected > target

  async function handleSubmit() {
    setSubmitting(true)
    await submitGallery(token)
    setSubmitted(true)
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100dvh', background: S.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <p style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase', marginBottom: 24 }}>Leafilms</p>
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.95rem', color: S.green, fontWeight: 600 }}>✓ Utvalget er sendt inn</p>
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.8rem', color: S.text2, marginTop: 8 }}>
            Vi har mottatt dine {totalSelected} valgte bilder og tar kontakt.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: S.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.push(`/s/${token}`)} style={{ background: 'none', border: 'none', color: S.text2, cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }}>‹</button>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase' }}>Leafilms</span>
        </div>
        <span style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', color: S.text2 }}>Gjennomgang</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', maxWidth: 720, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {/* Totalteller */}
        <div style={{
          background: isOver ? 'rgba(212,134,58,0.08)' : 'rgba(76,175,125,0.06)',
          border: `1px solid ${isOver ? 'rgba(212,134,58,0.3)' : 'rgba(76,175,125,0.25)'}`,
          borderRadius: 10, padding: '14px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: 'sans-serif', fontSize: '1.4rem', fontWeight: 700, color: isOver ? S.warning : S.green }}>
              {totalSelected} bilder
            </div>
            <div style={{ fontFamily: 'sans-serif', fontSize: '0.68rem', color: S.text2, marginTop: 2 }}>
              {target != null ? `av ${target} avtalte` : 'valgt'}
            </div>
          </div>
          {isOver && (
            <div style={{ fontFamily: 'sans-serif', fontSize: '0.72rem', color: S.warning, textAlign: 'right', maxWidth: 180 }}>
              {totalSelected - target!} over avtalt antall — kan medføre tillegg
            </div>
          )}
        </div>

        {/* Bilder per album */}
        {selectedAlbums.map(album => (
          <div key={album.id} style={{ marginBottom: 20 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${S.border}`,
            }}>
              <span style={{ fontFamily: 'sans-serif', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: S.text3 }}>
                {album.name}
              </span>
              <span style={{ fontFamily: 'sans-serif', fontSize: '0.75rem', color: S.gold }}>
                {album.images.length} bilder
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 4 }}>
              {album.images.map(img => (
                <div key={img.id} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 5, overflow: 'hidden' }}>
                  {img.signedUrl
                    ? <img src={img.signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <div style={{ width: '100%', height: '100%', background: S.surface2 }} />
                  }
                  <div style={{ position: 'absolute', top: 3, right: 3, width: 12, height: 12, borderRadius: '50%', background: S.gold }} />
                  {img.comment && (
                    <div style={{ position: 'absolute', bottom: 3, left: 3, width: 10, height: 10, borderRadius: '50%', background: 'rgba(196,148,52,0.7)' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Send inn */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${S.border}`, background: S.surface, flexShrink: 0 }}>
        <button
          onClick={handleSubmit}
          disabled={submitting || totalSelected === 0}
          style={{
            width: '100%', padding: '13px', borderRadius: 9, border: 'none',
            fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
            background: S.gold, color: '#0C0B09', opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Sender...' : 'Bekreft og send inn'}
        </button>
        <p style={{ fontFamily: 'sans-serif', fontSize: '0.62rem', color: S.text3, textAlign: 'center', marginTop: 6 }}>
          Kan ikke endres etter innsending
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Typekontroll:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add "app/s/[token]/review/"
git commit -m "feat: review-side — gjennomgang og innsending av hoved-seleksjon"
```

---

## Task 10: Admin seleksjon-side — server component

**Files:**
- Create: `app/admin/projects/[id]/selection/page.tsx`

- [ ] **Opprett filen:**

```tsx
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getAdminSelectionPage, createAlbum } from '@/lib/actions/selection-albums'
import { createGallery } from '@/lib/actions/selections'
import SelectionAdminClient from './SelectionAdminClient'

export default async function SelectionAdminPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .single()

  if (!project) notFound()

  const selectionData = await getAdminSelectionPage(projectId)

  return (
    <SelectionAdminClient
      projectId={projectId}
      projectName={project.name}
      initialData={selectionData}
    />
  )
}
```

- [ ] **Commit:**

```bash
git add "app/admin/projects/[id]/selection/page.tsx"
git commit -m "feat: admin seleksjon-side server component"
```

---

## Task 11: SelectionAdminClient + AlbumCard

**Files:**
- Create: `app/admin/projects/[id]/selection/SelectionAdminClient.tsx`
- Create: `app/admin/projects/[id]/selection/AlbumCard.tsx`

- [ ] **Opprett `AlbumCard.tsx`:**

```tsx
'use client'

import { useState, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  updateAlbum,
  deleteAlbum,
  enableAlbumSharing,
  disableAlbumSharing,
} from '@/lib/actions/selection-albums'
import { registerUploadedImages } from '@/lib/actions/selections'
import type { AlbumWithImages } from '@/lib/actions/selection-albums'
import { C } from '@/lib/admin-theme'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type UploadStatus = { filename: string; progress: 'pending' | 'uploading' | 'done' | 'error'; error?: string }

export default function AlbumCard({
  album,
  galleryId,
  onRefresh,
}: {
  album: AlbumWithImages
  galleryId: string
  onRefresh: () => Promise<void>
}) {
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(album.name)
  const [savingName, setSavingName] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sharingOn, setSharingOn] = useState(!!album.album_token)
  const [sharingLoading, setSharingLoading] = useState(false)
  const [albumToken, setAlbumToken] = useState(album.album_token)
  const [albumPin, setAlbumPin] = useState(album.album_pin_code)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedPin, setCopiedPin] = useState(false)
  const [uploads, setUploads] = useState<UploadStatus[]>([])
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const albumUrl = albumToken ? `${origin}/s/${albumToken}` : ''

  async function saveName() {
    if (!nameInput.trim() || nameInput === album.name) { setEditingName(false); return }
    setSavingName(true)
    await updateAlbum(album.id, { name: nameInput.trim() })
    await onRefresh()
    setSavingName(false)
    setEditingName(false)
  }

  async function handleDelete() {
    if (!confirm(`Slett albumet "${album.name}" og alle bilder i det?`)) return
    setDeleting(true)
    await deleteAlbum(album.id)
    await onRefresh()
  }

  async function handleToggleSharing() {
    setSharingLoading(true)
    if (sharingOn) {
      await disableAlbumSharing(album.id)
      setAlbumToken(null)
      setAlbumPin(null)
      setSharingOn(false)
    } else {
      const { token, pinCode } = await enableAlbumSharing(album.id)
      setAlbumToken(token)
      setAlbumPin(pinCode)
      setSharingOn(true)
    }
    setSharingLoading(false)
  }

  async function handleFiles(files: File[]) {
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (!imageFiles.length) return

    const currentMax = album.images.reduce((m, i) => Math.max(m, i.sort_order), -1)
    setUploads(imageFiles.map(f => ({ filename: f.name, progress: 'pending' })))

    const uploaded: { filename: string; storagePath: string; sortOrder: number; albumId: string }[] = []

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 'uploading' } : u))

      const path = `${galleryId}/${album.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('selections').upload(path, file, {
        contentType: file.type,
        upsert: false,
      })

      if (error) {
        setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 'error', error: error.message } : u))
      } else {
        setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 'done' } : u))
        uploaded.push({ filename: file.name, storagePath: path, sortOrder: currentMax + i + 1, albumId: album.id })
      }
    }

    if (uploaded.length > 0) {
      await registerUploadedImages(galleryId, uploaded)
      await onRefresh()
    }
    setTimeout(() => setUploads([]), 2000)
  }

  function copyText(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const btnBase: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 5, border: `1px solid ${C.border}`,
    background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.68rem', cursor: 'pointer',
  }

  return (
    <div style={{ border: `1px solid ${sharingOn ? 'rgba(100,160,220,0.3)' : C.border}`, borderRadius: 9, overflow: 'hidden', background: C.surface }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: C.text3, fontSize: '0.85rem', cursor: 'grab' }}>⠿</span>
        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
            style={{ flex: 1, background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 8px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', outline: 'none' }}
          />
        ) : (
          <span
            onDoubleClick={() => setEditingName(true)}
            style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: C.text, cursor: 'text' }}
            title="Dobbeltklikk for å redigere"
          >
            {album.name}
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, background: C.surface2, borderRadius: 10, padding: '1px 8px' }}>
          {album.images.length} bilder · {album.selectedCount} valgt
        </span>
        <button onClick={() => setEditingName(true)} style={btnBase}>Rediger</button>
        <button onClick={handleDelete} disabled={deleting} style={{ ...btnBase, borderColor: 'rgba(180,60,60,0.4)', color: '#C05050' }}>
          {deleting ? '...' : 'Slett'}
        </button>
      </div>

      {/* Thumbnail-grid */}
      <div style={{ padding: '0 14px 10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 4, marginBottom: 10 }}>
          {album.images.slice(0, 12).map(img => (
            <div key={img.id} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 4, overflow: 'hidden', border: `2px solid ${img.selected ? C.accent : 'transparent'}` }}>
              {img.signedUrl
                ? <img src={img.signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                : <div style={{ width: '100%', height: '100%', background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.45rem', color: C.text3 }}>{img.filename}</span>
                  </div>
              }
              {img.selected && (
                <div style={{ position: 'absolute', top: 2, right: 2, width: 12, height: 12, borderRadius: '50%', background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="6" height="6" viewBox="0 0 10 10"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              )}
            </div>
          ))}

          {/* Opplastingssone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)) }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              aspectRatio: '4/3', borderRadius: 4, border: `1.5px dashed ${dragging ? C.accent : C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: dragging ? C.accent : C.text3, fontSize: '1.1rem',
              background: dragging ? C.accentBg : 'none',
            }}
          >+</div>
          <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display: 'none' }} onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)) }} />
        </div>

        {/* Opplastingsstatus */}
        {uploads.length > 0 && (
          <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {uploads.map((u, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: u.progress === 'done' ? '#4CAF7D' : u.progress === 'error' ? C.danger : u.progress === 'uploading' ? C.accent : C.text3, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.filename}</span>
              </div>
            ))}
          </div>
        )}

        {/* Individuell delelenke toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 6, background: sharingOn ? 'rgba(100,160,220,0.06)' : C.surface2, border: `1px solid ${sharingOn ? 'rgba(100,160,220,0.25)' : C.border}` }}>
          <span style={{ fontSize: '0.78rem' }}>🔗</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {sharingOn && albumToken ? (
              <>
                <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#64A0DC', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {origin}/s/{albumToken}
                </div>
                <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, marginTop: 1 }}>
                  PIN: <strong style={{ color: C.text, letterSpacing: '0.08em' }}>{albumPin}</strong>
                </div>
                <div style={{ display: 'flex', gap: 5, marginTop: 4 }}>
                  <button onClick={() => copyText(`${origin}/s/${albumToken}`, setCopiedLink)} style={{ ...btnBase, fontSize: '0.6rem' }}>{copiedLink ? '✓' : 'Kopier lenke'}</button>
                  <button onClick={() => copyText(albumPin!, setCopiedPin)} style={{ ...btnBase, fontSize: '0.6rem' }}>{copiedPin ? '✓' : 'Kopier PIN'}</button>
                </div>
              </>
            ) : (
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
                Individuell delelenke — ikke aktivert
              </span>
            )}
          </div>
          <button
            onClick={handleToggleSharing}
            disabled={sharingLoading}
            style={{
              width: 36, height: 20, borderRadius: 10, border: 'none', flexShrink: 0,
              background: sharingOn ? 'rgba(100,160,220,0.3)' : C.surface,
              cursor: 'pointer', position: 'relative', transition: 'background 0.15s',
            }}
          >
            <div style={{
              position: 'absolute', width: 14, height: 14, borderRadius: '50%', top: 3,
              left: sharingOn ? 19 : 3,
              background: sharingOn ? '#64A0DC' : C.text3,
              transition: 'left 0.15s, background 0.15s',
            }} />
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Opprett `SelectionAdminClient.tsx`:**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createAlbum, reorderAlbums, getAdminSelectionPage } from '@/lib/actions/selection-albums'
import { createGallery, purgeGalleryImages, reopenGallery, getSelectedFilenames } from '@/lib/actions/selections'
import AlbumCard from './AlbumCard'
import type { AdminSelectionPageData } from '@/lib/actions/selection-albums'
import { C } from '@/lib/admin-theme'

export default function SelectionAdminClient({
  projectId,
  projectName,
  initialData,
}: {
  projectId: string
  projectName: string
  initialData: AdminSelectionPageData | null
}) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [creating, setCreating] = useState(false)
  const [targetInput, setTargetInput] = useState('')
  const [newAlbumName, setNewAlbumName] = useState('')
  const [addingAlbum, setAddingAlbum] = useState(false)
  const [showAddAlbum, setShowAddAlbum] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedPin, setCopiedPin] = useState(false)
  const [copiedFilelist, setCopiedFilelist] = useState(false)
  const [purging, setPurging] = useState(false)
  const [reopening, setReopening] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  async function refresh() {
    const fresh = await getAdminSelectionPage(projectId)
    setData(fresh)
  }

  async function handleCreateGallery() {
    setCreating(true)
    await createGallery(projectId, parseInt(targetInput) || undefined)
    await refresh()
    setCreating(false)
    setTargetInput('')
  }

  async function handleAddAlbum() {
    if (!data || !newAlbumName.trim()) return
    setAddingAlbum(true)
    await createAlbum(data.gallery.id, newAlbumName.trim())
    await refresh()
    setAddingAlbum(false)
    setNewAlbumName('')
    setShowAddAlbum(false)
  }

  async function handlePurge() {
    if (!data || !confirm('Slett alle bildefiler? Valg og filnavn beholdes.')) return
    setPurging(true)
    await purgeGalleryImages(data.gallery.id)
    await refresh()
    setPurging(false)
  }

  async function handleReopen() {
    if (!data) return
    setReopening(true)
    await reopenGallery(data.gallery.id)
    await refresh()
    setReopening(false)
  }

  async function handleCopyFilelist() {
    if (!data) return
    const filenames = await getSelectedFilenames(data.gallery.id)
    await navigator.clipboard.writeText(filenames.join('\n'))
    setCopiedFilelist(true)
    setTimeout(() => setCopiedFilelist(false), 2000)
  }

  function copyText(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem',
    textTransform: 'uppercase', letterSpacing: '0.08em', color: C.text3, marginBottom: 6,
  }
  const btnGhost: React.CSSProperties = {
    padding: '7px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
    background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', cursor: 'pointer',
  }
  const btnDanger: React.CSSProperties = {
    padding: '7px 12px', borderRadius: 6, border: `1px solid rgba(180,60,60,0.4)`,
    background: 'none', color: '#C05050', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', cursor: 'pointer',
  }
  const copyBtnStyle: React.CSSProperties = {
    padding: '4px 8px', borderRadius: 5, border: `1px solid ${C.border}`,
    background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', cursor: 'pointer',
  }

  // ---- Ingen galleri enda ----
  if (!data) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginBottom: 4 }}>
          ← <button onClick={() => router.push(`/admin/projects/${projectId}`)} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: '0.72rem' }}>Tilbake til prosjekt</button>
        </p>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.1rem', fontWeight: 700, color: C.text, marginBottom: 24 }}>
          Seleksjon — {projectName}
        </h1>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 24px' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text, fontWeight: 600, marginBottom: 16 }}>Opprett seleksjonsgalleri</p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Måltall bilder (valgfritt)</label>
              <input
                type="number" min={1} value={targetInput}
                onChange={e => setTargetInput(e.target.value)}
                placeholder="f.eks. 20"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 7, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', outline: 'none' }}
              />
            </div>
            <button onClick={handleCreateGallery} disabled={creating} style={{ padding: '9px 18px', borderRadius: 7, border: 'none', cursor: 'pointer', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Oppretter...' : 'Opprett galleri'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { gallery, albums, totalSelected, totalImages } = data
  const galleryUrl = `${origin}/s/${gallery.token}`
  const isPurged = gallery.status === 'purged'
  const isSubmitted = gallery.status === 'submitted'
  const isOver = gallery.target_count != null && totalSelected > gallery.target_count

  const statusMap: Record<string, { label: string; color: string; bg: string }> = {
    open:      { label: 'Åpen', color: '#4CAF7D', bg: 'rgba(76,175,125,0.1)' },
    submitted: { label: 'Innsendt', color: C.accent, bg: C.accentBg },
    purged:    { label: 'Slettet', color: C.text3, bg: C.surface2 },
  }
  const statusStyle = statusMap[gallery.status] ?? statusMap.open

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      {/* Topbar */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={() => router.push(`/admin/projects/${projectId}`)} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'var(--font-dm-sans)' }}>
          ← {projectName}
        </button>
        <span style={{ color: C.text3 }}>/</span>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.text }}>Seleksjon</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {(isSubmitted || isPurged) && totalSelected > 0 && (
            <button onClick={handleCopyFilelist} style={btnGhost}>{copiedFilelist ? '✓ Kopiert' : 'Kopier filnavnliste'}</button>
          )}
          <button onClick={() => setShowAddAlbum(true)} style={{ padding: '7px 14px', borderRadius: 7, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
            + Nytt album
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: 'calc(100vh - 49px)' }}>
        {/* Sidebar */}
        <div style={{ borderRight: `1px solid ${C.border}`, background: C.surface, padding: 16 }}>
          {/* Totalteller */}
          <div style={{ background: isOver ? 'rgba(212,134,58,0.08)' : 'rgba(196,148,52,0.06)', border: `1px solid ${isOver ? 'rgba(212,134,58,0.3)' : 'rgba(196,148,52,0.2)'}`, borderRadius: 8, padding: '10px 12px', textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.6rem', fontWeight: 700, color: isOver ? '#D4863A' : C.accent }}>
              {totalSelected}{gallery.target_count ? ` / ${gallery.target_count}` : ''}
            </div>
            <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 2 }}>
              bilder valgt på tvers av alle album
            </div>
          </div>

          {/* Status */}
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Status</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.surface2}` }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>Galleri</span>
              <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: '0.65rem', fontWeight: 600, fontFamily: 'var(--font-dm-sans)', color: statusStyle.color, background: statusStyle.bg }}>{statusStyle.label}</span>
            </div>
            {gallery.submitted_at && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 0', borderBottom: `1px solid ${C.surface2}` }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>Innsendt</span>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text, fontWeight: 600 }}>
                  {new Date(gallery.submitted_at).toLocaleDateString('nb-NO')}
                </span>
              </div>
            )}
          </div>

          {/* Hoved-gallerilenke */}
          <div style={{ marginBottom: 16 }}>
            <div style={labelStyle}>Hoved-gallerilenke</div>
            <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 10px' }}>
              <div style={{ fontFamily: 'monospace', fontSize: '0.65rem', color: C.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>{galleryUrl}</div>
              <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2 }}>PIN: <strong style={{ color: C.text, letterSpacing: '0.1em' }}>{gallery.pin_code}</strong></div>
              <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
                <button onClick={() => copyText(galleryUrl, setCopiedLink)} style={copyBtnStyle}>{copiedLink ? '✓' : 'Kopier lenke'}</button>
                <button onClick={() => copyText(gallery.pin_code, setCopiedPin)} style={copyBtnStyle}>{copiedPin ? '✓' : 'Kopier PIN'}</button>
              </div>
            </div>
          </div>

          {/* Handlinger */}
          <div style={labelStyle}>Handlinger</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {isSubmitted && !isPurged && (
              <button onClick={handleReopen} disabled={reopening} style={btnGhost}>{reopening ? 'Åpner...' : '↺ Åpne for redigering'}</button>
            )}
            {!isPurged && (
              <button onClick={handlePurge} disabled={purging} style={btnDanger}>{purging ? 'Sletter...' : '⊗ Slett bildefiler'}</button>
            )}
          </div>
        </div>

        {/* Album-liste */}
        <div style={{ padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.text }}>Album</span>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
              {albums.length} album · {totalImages} bilder
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {albums.map(album => (
              <AlbumCard
                key={album.id}
                album={album}
                galleryId={gallery.id}
                onRefresh={refresh}
              />
            ))}

            {/* Legg til album */}
            {showAddAlbum ? (
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, padding: '12px 14px', background: C.surface, display: 'flex', gap: 8 }}>
                <input
                  autoFocus
                  value={newAlbumName}
                  onChange={e => setNewAlbumName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddAlbum(); if (e.key === 'Escape') { setShowAddAlbum(false); setNewAlbumName('') } }}
                  placeholder="Albumnavn, f.eks. Headshots"
                  style={{ flex: 1, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 12px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', outline: 'none' }}
                />
                <button onClick={handleAddAlbum} disabled={addingAlbum || !newAlbumName.trim()} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                  {addingAlbum ? '...' : 'Legg til'}
                </button>
                <button onClick={() => { setShowAddAlbum(false); setNewAlbumName('') }} style={btnGhost}>Avbryt</button>
              </div>
            ) : (
              <button onClick={() => setShowAddAlbum(true)} style={{ border: `1.5px dashed ${C.border}`, borderRadius: 9, padding: '12px', textAlign: 'center', color: C.text3, fontSize: '0.78rem', cursor: 'pointer', background: 'none', width: '100%', fontFamily: 'var(--font-dm-sans)', transition: 'border-color 0.15s' }}>
                + Legg til album
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Overlay for nytt album fra topbar */}
    </div>
  )
}
```

- [ ] **Typekontroll:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add "app/admin/projects/[id]/selection/"
git commit -m "feat: admin seleksjon-side — SelectionAdminClient og AlbumCard"
```

---

## Task 12: Oppdater prosjektsiden

**Files:**
- Modify: `app/admin/projects/[id]/page.tsx`

- [ ] **Fjern SelectionGallery-importen og erstatt med en lenke-knapp.** Finn disse linjene og fjern dem:

```ts
// Fjern disse importene (linje ~10-12):
import { getAdminGallery } from '@/lib/actions/selections'
import type { SelectionGallery as GalleryData, SelectionImage } from '@/lib/actions/selections'
import SelectionGallery from './SelectionGallery'
```

- [ ] **Fjern state og data-henting for seleksjon** — finn og fjern:

```ts
// Fjern disse linjene (~579-584):
const [selectionGalleryData, setSelectionGalleryData] = useState<{
  gallery: GalleryData
  images: SelectionImage[]
  selectedCount: number
  signedUrls: Record<string, string>
} | null>(null)
```

```ts
// Fjern disse linjene (~634-643) inne i fetchHub():
// Hent seleksjonsgalleri for post_prod
if (data.project.pipeline_stage === 'post_prod') {
  try {
    const galleryData = await getAdminGallery(projectId)
    setSelectionGalleryData(galleryData)
  } catch {
    setSelectionGalleryData(null)
  }
}
```

- [ ] **Finn der `<SelectionGallery>` rendres** (linje ~1125) og erstatt med lenke-knapp. Søk etter `<SelectionGallery` og erstatt hele blokken med:

```tsx
<Link
  href={`/admin/projects/${projectId}/selection`}
  style={{
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 7,
    border: `1px solid ${C.border}`, background: 'none',
    color: C.text2, fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.78rem', textDecoration: 'none',
  }}
>
  → Administrer seleksjon
</Link>
```

Sørg for at `Link` er importert fra `'next/link'` (det er det sannsynligvis allerede i filen).

- [ ] **Typekontroll:**

```bash
npx tsc --noEmit
```

- [ ] **Commit:**

```bash
git add "app/admin/projects/[id]/page.tsx"
git commit -m "refactor: erstatt SelectionGallery med lenke til dedikert seleksjon-side"
```

---

## Task 13: Global seleksjons-oversikt

**Files:**
- Create: `app/admin/selections/page.tsx`

- [ ] **Opprett filen:**

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { getAllGalleriesOverview } from '@/lib/actions/selection-albums'

export default async function SelectionsOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const galleries = await getAllGalleriesOverview()

  const C = {
    bg: '#181920', surface: '#21212D', surface2: '#2A2A38',
    border: '#3C3C52', text: '#EEEEF2', text2: '#B4B4CC', text3: '#8484A0',
    accent: '#7C5CFC',
  }

  const statusMap: Record<string, { label: string; color: string }> = {
    open:      { label: 'Åpen',     color: '#4CAF7D' },
    submitted: { label: 'Innsendt', color: '#C49434' },
    purged:    { label: 'Slettet',  color: '#8484A0' },
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '32px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.2rem', fontWeight: 700, color: C.text, marginBottom: 24 }}>
          Seleksjoner
        </h1>

        {galleries.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3 }}>Ingen aktive gallerier.</p>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Prosjekt', 'Status', 'Album', 'Valgt', 'Innsendt'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: C.text3, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {galleries.map((g, i) => {
                  const st = statusMap[g.status] ?? statusMap.open
                  return (
                    <tr
                      key={g.galleryId}
                      style={{ borderBottom: i < galleries.length - 1 ? `1px solid ${C.border}` : 'none' }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <Link
                          href={`/admin/projects/${g.projectId}/selection`}
                          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text, textDecoration: 'none' }}
                        >
                          {g.projectName}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: st.color }}>{st.label}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>
                        {g.albumCount}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>
                        {g.totalSelected}{g.targetCount ? ` / ${g.targetCount}` : ''}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                        {g.submittedAt ? new Date(g.submittedAt).toLocaleDateString('nb-NO') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Typekontroll + manuell test:**

```bash
npx tsc --noEmit
```

Åpne `/admin/selections` i nettleseren og bekreft at tabellen vises.

- [ ] **Commit:**

```bash
git add app/admin/selections/page.tsx
git commit -m "feat: global seleksjons-oversikt på tvers av prosjekter"
```

---

## Task 14: Manuell end-to-end test

- [ ] **Start dev-server:**

```bash
npm run dev
```

- [ ] **Test admin-flyten:**

1. Gå til `/admin/projects/[et prosjekt-id]/selection`
2. Opprett galleri med måltall
3. Legg til album «Headshots» og «Situasjonsbilder»
4. Last opp 2–3 bilder i hvert album
5. Aktiver individuell lenke på Headshots-albumet
6. Kopier hoved-gallerilenke + PIN

- [ ] **Test kunde-flyten (hoved-galleri):**

1. Åpne hoved-gallerilenken i en ny inkognito-fane
2. Logg inn med PIN
3. Bekreft at album-oversikten vises med begge album
4. Gå inn i Headshots, velg 1 bilde
5. Gå tilbake, gå inn i Situasjonsbilder, velg 1 bilde
6. Verifiser at totalteller viser 2
7. Klikk «Se alle valgte» → bekreft gjennomgangsside med begge album
8. Send inn og bekreft «Innsendt»-tilstand

- [ ] **Test individuell album-lenke:**

1. Åpne individuell headshots-lenke i ny inkognito-fane
2. Logg inn med album-PIN
3. Bekreft at kun Headshots-bilder vises (ingen album-oversikt)
4. Velg 1 bilde og send inn
5. Bekreft at seleksjonen ikke påvirker hoved-galleriet

- [ ] **Test bakoverkompatibilitet:**

1. Gå til et eksisterende galleri uten album (hvis det finnes)
2. Bekreft at gammel flat grid-visning fortsatt fungerer

- [ ] **Siste commit:**

```bash
git add -A
git commit -m "feat: album-seleksjon komplett — admin-side, kunde-flyt, individuelle lenker"
```
