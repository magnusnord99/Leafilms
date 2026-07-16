'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient, createServiceClient } from '@/lib/supabase-server'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 dager
const SIGNED_URL_EXPIRY = 60 * 60 * 2   // 2 timer
const MAX_PIN_ATTEMPTS = 5
const PIN_LOCKOUT_MINUTES = 15

// ---------------------------------------------------------------------------
// Typer
// ---------------------------------------------------------------------------
export type SelectionGallery = {
  id: string
  project_id: string
  token: string
  pin_code: string
  target_count: number | null
  status: 'open' | 'submitted' | 'purged'
  submitted_at: string | null
  purged_at: string | null
  created_at: string
}

export type SelectionImage = {
  id: string
  gallery_id: string
  filename: string
  storage_path: string | null
  sort_order: number
  selected: boolean
  comment: string | null
  selected_at: string | null
  album_id: string | null
  signedUrl?: string
}

export type AlbumForCustomer = {
  id: string
  name: string
  slug: string
  parent_album_id: string | null
  images: (SelectionImage & { signedUrl: string })[]
  videos: GalleryVideo[]
  selectedCount: number
}

// ---------------------------------------------------------------------------
// Intern: PIN-cookie-nøkkel
// ---------------------------------------------------------------------------
function cookieKey(token: string) {
  return `sel_${token.slice(0, 16)}`
}

// ---------------------------------------------------------------------------
// ADMIN: Opprett galleri
// ---------------------------------------------------------------------------
export async function createGallery(
  projectId: string,
  targetCount?: number
): Promise<{ token: string; pinCode: string; galleryId: string }> {
  const supabase = await createClient()

  const token = generateToken()
  const pinCode = generatePin()

  const { data, error } = await supabase
    .from('selection_galleries')
    .insert({
      project_id: projectId,
      token,
      pin_code: pinCode,
      target_count: targetCount ?? null,
      status: 'open',
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('createGallery error:', error)
    throw new Error('Kunne ikke opprette galleri')
  }

  return { token, pinCode, galleryId: data.id }
}

// ---------------------------------------------------------------------------
// ADMIN: Hent kun galleri-id + status for et prosjekt — brukt av videoadmin
// for å tilby "vis i seleksjonsgalleri" uten å hente bilder/signerte URL-er.
// ---------------------------------------------------------------------------
export async function getGalleryIdForProject(projectId: string): Promise<{ id: string; status: SelectionGallery['status'] } | null> {
  const supabase = await createClient()

  const { data: gallery } = await supabase
    .from('selection_galleries')
    .select('id, status')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return gallery ?? null
}

// ---------------------------------------------------------------------------
// ADMIN: Hent galleri for admin-visning
// ---------------------------------------------------------------------------
export async function getAdminGallery(projectId: string): Promise<{
  gallery: SelectionGallery
  images: SelectionImage[]
  selectedCount: number
  signedUrls: Record<string, string>
} | null> {
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: gallery, error } = await supabase
    .from('selection_galleries')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !gallery) return null

  const { data: images } = await supabase
    .from('selection_images')
    .select('*')
    .eq('gallery_id', gallery.id)
    .order('sort_order', { ascending: true })

  const imgs = (images ?? []) as SelectionImage[]

  // Generer signerte URL-er for bilder med storage_path
  const signedUrls: Record<string, string> = {}
  const paths = imgs.filter(i => i.storage_path).map(i => i.storage_path!)

  if (paths.length > 0) {
    const { data: urlData } = await service.storage
      .from('selections')
      .createSignedUrls(paths, SIGNED_URL_EXPIRY)

    for (const item of urlData ?? []) {
      if (item.signedUrl && item.path) signedUrls[item.path] = item.signedUrl
    }
  }

  return {
    gallery: gallery as SelectionGallery,
    images: imgs,
    selectedCount: imgs.filter(i => i.selected).length,
    signedUrls,
  }
}

// ---------------------------------------------------------------------------
// ADMIN: Registrer opplastede bilder i DB
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// ADMIN: Slett ett bilde (DB + storage)
// ---------------------------------------------------------------------------
export async function removeImage(imageId: string): Promise<void> {
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: img } = await supabase
    .from('selection_images')
    .select('storage_path')
    .eq('id', imageId)
    .single()

  if (img?.storage_path) {
    await service.storage.from('selections').remove([img.storage_path])
  }

  await supabase.from('selection_images').delete().eq('id', imageId)
}

// ---------------------------------------------------------------------------
// ADMIN: Purge — slett alle storage-filer, sett status=purged
// ---------------------------------------------------------------------------
export async function purgeGalleryImages(galleryId: string): Promise<void> {
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: images } = await supabase
    .from('selection_images')
    .select('storage_path')
    .eq('gallery_id', galleryId)
    .not('storage_path', 'is', null)

  const paths = (images ?? []).map(i => i.storage_path).filter(Boolean) as string[]

  if (paths.length > 0) {
    const { error: storageError } = await service.storage.from('selections').remove(paths)
    if (storageError) console.error('purgeGalleryImages storage error:', storageError)
  }

  const now = new Date().toISOString()
  await supabase
    .from('selection_images')
    .update({ storage_path: null })
    .eq('gallery_id', galleryId)

  await supabase
    .from('selection_galleries')
    .update({ status: 'purged', purged_at: now, updated_at: now })
    .eq('id', galleryId)
}

// ---------------------------------------------------------------------------
// ADMIN: Gjenåpne galleri
// ---------------------------------------------------------------------------
export async function reopenGallery(galleryId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('selection_galleries')
    .update({ status: 'open', submitted_at: null, updated_at: new Date().toISOString() })
    .eq('id', galleryId)
}

// ---------------------------------------------------------------------------
// ADMIN: Filnavnliste for Lightroom-import
// ---------------------------------------------------------------------------
export async function getSelectedFilenames(galleryId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('selection_images')
    .select('filename')
    .eq('gallery_id', galleryId)
    .eq('selected', true)
    .order('sort_order', { ascending: true })

  return (data ?? []).map(r => r.filename)
}

// ---------------------------------------------------------------------------
// KUNDE: Sjekk at galleri-token finnes (for 404 på ugyldig lenke)
// ---------------------------------------------------------------------------
export async function galleryTokenExists(token: string): Promise<boolean> {
  const service = createServiceClient()

  const { count } = await service
    .from('selection_galleries')
    .select('id', { count: 'exact', head: true })
    .eq('token', token)

  return (count ?? 0) > 0
}

// ---------------------------------------------------------------------------
// KUNDE: Verifiser PIN og sett cookie
// ---------------------------------------------------------------------------
export async function verifyGalleryPin(
  token: string,
  pin: string
): Promise<{ ok: boolean; error?: string; locked?: boolean }> {
  const service = createServiceClient()

  const { data: gallery, error } = await service
    .from('selection_galleries')
    .select('id, pin_code, status, pin_attempts, pin_locked_until')
    .eq('token', token)
    .single()

  if (error || !gallery) return { ok: false, error: 'Fant ikke galleriet' }

  // Sjekk lockout
  if (gallery.pin_locked_until && new Date(gallery.pin_locked_until) > new Date()) {
    const mins = Math.ceil(
      (new Date(gallery.pin_locked_until).getTime() - Date.now()) / 60000
    )
    return { ok: false, locked: true, error: `For mange forsøk. Prøv igjen om ${mins} min.` }
  }

  // Sjekk PIN
  if (pin !== gallery.pin_code) {
    const attempts = (gallery.pin_attempts ?? 0) + 1
    const lockedUntil =
      attempts >= MAX_PIN_ATTEMPTS
        ? new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60000).toISOString()
        : null

    await service
      .from('selection_galleries')
      .update({ pin_attempts: attempts, pin_locked_until: lockedUntil })
      .eq('id', gallery.id)

    const remaining = MAX_PIN_ATTEMPTS - attempts
    const msg =
      attempts >= MAX_PIN_ATTEMPTS
        ? `Kontoen er låst i ${PIN_LOCKOUT_MINUTES} minutter`
        : `Feil PIN (${remaining} forsøk igjen)`
    return { ok: false, error: msg }
  }

  // Nullstill forsøksteller
  await service
    .from('selection_galleries')
    .update({ pin_attempts: 0, pin_locked_until: null })
    .eq('id', gallery.id)

  // Sett cookie
  const cookieStore = await cookies()
  cookieStore.set(cookieKey(token), gallery.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/s/${token}`,
    maxAge: COOKIE_MAX_AGE,
  })

  return { ok: true }
}

// ---------------------------------------------------------------------------
// KUNDE: Hent galleri (krever gyldig PIN-cookie)
// ---------------------------------------------------------------------------
export type GalleryVideo = {
  id: string
  title: string
  status: 'open' | 'submitted'
  comment_count: number
}

export async function getGalleryForCustomer(token: string): Promise<{
  gallery: SelectionGallery
  albums: AlbumForCustomer[]
  legacyImages: (SelectionImage & { signedUrl: string })[]
  videos: GalleryVideo[]
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
    .select('id, name, slug, sort_order, parent_album_id')
    .eq('gallery_id', gallery.id)
    .order('sort_order', { ascending: true })

  const albumList = (albumRows ?? []) as { id: string; name: string; slug: string; sort_order: number; parent_album_id: string | null }[]

  const videos = await fetchGalleryVideos(service, gallery.id, null)

  if (albumList.length === 0) {
    return {
      gallery: gallery as SelectionGallery,
      albums: [],
      legacyImages: withUrl,
      videos,
    }
  }

  const albums: AlbumForCustomer[] = await Promise.all(albumList.map(async album => {
    const albumImages = withUrl.filter(i => i.album_id === album.id)
    const albumVideos = await fetchGalleryVideos(service, gallery.id, album.id)
    return {
      ...album,
      images: albumImages,
      videos: albumVideos,
      selectedCount: albumImages.filter(i => i.selected).length,
    }
  }))

  return {
    gallery: gallery as SelectionGallery,
    albums,
    legacyImages: [],
    videos,
  }
}

// albumId: null henter kun videoer uten album (galleriets toppnivå),
// en id henter videoene plassert i nettopp det albumet.
async function fetchGalleryVideos(
  service: ReturnType<typeof createServiceClient>,
  galleryId: string,
  albumId: string | null,
): Promise<GalleryVideo[]> {
  let query = service
    .from('video_reviews')
    .select('id, title, status')
    .eq('gallery_id', galleryId)
    .order('created_at', { ascending: true })
  query = albumId ? query.eq('album_id', albumId) : query.is('album_id', null)
  const { data: vids } = await query

  if (!vids || vids.length === 0) return []

  const { data: commentCounts } = await service
    .from('video_comments')
    .select('review_id')
    .in('review_id', vids.map(v => v.id))

  const countMap: Record<string, number> = {}
  for (const c of commentCounts ?? []) {
    countMap[c.review_id] = (countMap[c.review_id] ?? 0) + 1
  }

  return vids.map(v => ({
    id: v.id,
    title: v.title,
    status: v.status as 'open' | 'submitted',
    comment_count: countMap[v.id] ?? 0,
  }))
}

// ---------------------------------------------------------------------------
// KUNDE: Toggle bilde-seleksjon
// ---------------------------------------------------------------------------
export async function toggleImageSelection(
  token: string,
  imageId: string,
  selected: boolean
): Promise<void> {
  const cookieStore = await cookies()
  const galleryId = cookieStore.get(cookieKey(token))?.value
  if (!galleryId) throw new Error('Ikke autorisert')

  const service = createServiceClient()

  // Verifiser at bildet tilhører dette galleriet
  const { data: img } = await service
    .from('selection_images')
    .select('gallery_id')
    .eq('id', imageId)
    .single()

  if (img?.gallery_id !== galleryId) throw new Error('Ikke autorisert')

  await service
    .from('selection_images')
    .update({
      selected,
      selected_at: selected ? new Date().toISOString() : null,
    })
    .eq('id', imageId)

  revalidatePath(`/s/${token}`)
  revalidatePath(`/s/${token}/review`)
}

// ---------------------------------------------------------------------------
// KUNDE: Legg til kommentar
// ---------------------------------------------------------------------------
export async function addImageComment(
  token: string,
  imageId: string,
  comment: string
): Promise<void> {
  const cookieStore = await cookies()
  const galleryId = cookieStore.get(cookieKey(token))?.value
  if (!galleryId) throw new Error('Ikke autorisert')

  const service = createServiceClient()

  const { data: img } = await service
    .from('selection_images')
    .select('gallery_id')
    .eq('id', imageId)
    .single()

  if (img?.gallery_id !== galleryId) throw new Error('Ikke autorisert')

  await service
    .from('selection_images')
    .update({ comment: comment.trim() || null })
    .eq('id', imageId)
}

// ---------------------------------------------------------------------------
// INTERN: Varsel + task-markering ved seleksjonsinnsending
// ---------------------------------------------------------------------------
async function notifyOnSelectionSubmit(
  projectId: string,
  service: ReturnType<typeof createServiceClient>
): Promise<void> {
  const { data: taskRows } = await service
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)

  const taskIds = (taskRows ?? []).map((t: { id: string }) => t.id)
  let profileIds: string[] = []

  if (taskIds.length > 0) {
    const { data: assignees } = await service
      .from('task_assignees')
      .select('profile_id')
      .in('task_id', taskIds)

    profileIds = [...new Set((assignees ?? []).map((a: { profile_id: string }) => a.profile_id))]
  }

  if (profileIds.length === 0) {
    const { data: proj } = await service
      .from('projects')
      .select('project_lead_id')
      .eq('id', projectId)
      .single()

    if (proj?.project_lead_id) profileIds = [proj.project_lead_id]
  }

  if (profileIds.length === 0) return

  await service.from('notifications').insert(
    profileIds.map((uid: string) => ({
      user_id: uid,
      type: 'selection_submitted',
      project_id: projectId,
      message_preview: 'Kunden har sendt inn sitt bildevalg',
      sender_name: 'Kunde',
    }))
  )
}

async function markSeleksjonTaskDone(
  projectId: string,
  service: ReturnType<typeof createServiceClient>,
  now: string
): Promise<void> {
  const { data: selTask } = await service
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('pipeline_stage', 'post_prod')
    .ilike('title', 'Seleksjon til kunde')
    .maybeSingle()

  if (selTask) {
    await service
      .from('tasks')
      .update({ status: 'done', updated_at: now })
      .eq('id', selTask.id)
  }
}

// ---------------------------------------------------------------------------
// KUNDE: Send inn utvalg
// ---------------------------------------------------------------------------
export async function submitGallery(token: string): Promise<void> {
  const cookieStore = await cookies()
  const galleryId = cookieStore.get(cookieKey(token))?.value
  if (!galleryId) throw new Error('Ikke autorisert')

  const service = createServiceClient()
  const now = new Date().toISOString()

  const { data: gallery } = await service
    .from('selection_galleries')
    .select('project_id, status')
    .eq('id', galleryId)
    .single()

  if (!gallery || gallery.status !== 'open') return

  await service
    .from('selection_galleries')
    .update({ status: 'submitted', submitted_at: now, updated_at: now })
    .eq('id', galleryId)

  await Promise.all([
    notifyOnSelectionSubmit(gallery.project_id, service),
    markSeleksjonTaskDone(gallery.project_id, service, now),
  ])
}

// ---------------------------------------------------------------------------
// Hjelpefunksjoner
// ---------------------------------------------------------------------------
function generateToken(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'
  let token = ''
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}
