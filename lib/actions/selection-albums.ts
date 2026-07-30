'use server'

import { createClient, createServiceClient } from '@/lib/supabase-server'
import type { VideoReview } from './video-reviews'
import { getCommentsForImages, type ImageComment } from './selections'

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
  parent_album_id: string | null
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
    comments: ImageComment[]
    selected_at: string | null
    album_id: string | null
    hidden_from_client: boolean
    signedUrl: string
  }[]
  videos: (VideoReview & { signedUrl: string })[]
  selectedCount: number
}

export type AdminSelectionPageData = {
  gallery: {
    id: string
    project_id: string | null
    token: string
    pin_code: string
    target_count: number | null
    status: 'open' | 'submitted' | 'purged'
    submitted_at: string | null
    created_at: string
  }
  linkedProject: { id: string; title: string } | null
  albums: AlbumWithImages[]
  ungroupedImages: {
    id: string
    filename: string
    storage_path: string | null
    sort_order: number
    selected: boolean
    comments: ImageComment[]
    selected_at: string | null
    album_id: string | null
    hidden_from_client: boolean
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

export type SelectedImageForEditor = {
  id: string
  filename: string
  signedUrl: string
  comments: ImageComment[]
  albumName: string | null
  sort_order: number
}

export async function getSelectedImagesForProject(projectId: string): Promise<SelectedImageForEditor[]> {
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: gallery } = await supabase
    .from('selection_galleries')
    .select('id')
    .eq('project_id', projectId)
    .neq('status', 'purged')
    .limit(1)
    .maybeSingle()

  if (!gallery) return []

  const { data: albums } = await supabase
    .from('selection_albums')
    .select('id, name')
    .eq('gallery_id', gallery.id)

  const albumNameById: Record<string, string> = {}
  for (const a of albums ?? []) albumNameById[a.id] = a.name

  const { data: images } = await supabase
    .from('selection_images')
    .select('id, filename, storage_path, album_id, sort_order')
    .eq('gallery_id', gallery.id)
    .eq('selected', true)
    .order('sort_order', { ascending: true })

  if (!images || images.length === 0) return []

  const paths = images.filter(i => i.storage_path).map(i => i.storage_path as string)
  const signedUrlMap: Record<string, string> = {}
  if (paths.length > 0) {
    const { data: urlData } = await service.storage
      .from('selections')
      .createSignedUrls(paths, 60 * 60 * 2)
    for (const item of urlData ?? []) {
      if (item.signedUrl && item.path) signedUrlMap[item.path] = item.signedUrl
    }
  }

  const commentsByImage = await getCommentsForImages(service, images.map(i => i.id))

  return images.map(img => ({
    id: img.id,
    filename: img.filename,
    signedUrl: img.storage_path ? (signedUrlMap[img.storage_path] ?? '') : '',
    comments: commentsByImage[img.id] ?? [],
    albumName: img.album_id ? (albumNameById[img.album_id] ?? null) : null,
    sort_order: img.sort_order,
  }))
}

export async function getAdminGalleryPage(galleryId: string): Promise<AdminSelectionPageData | null> {
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: gallery } = await supabase
    .from('selection_galleries')
    .select('*')
    .eq('id', galleryId)
    .maybeSingle()

  if (!gallery) return null

  let linkedProject: { id: string; title: string } | null = null
  if (gallery.project_id) {
    const { data: proj } = await supabase
      .from('projects')
      .select('id, title')
      .eq('id', gallery.project_id)
      .maybeSingle()
    linkedProject = proj ?? null
  }

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

  // video_reviews har RLS kun for service_role — bruk service-klienten, ikke supabase
  const { data: allVideos } = await service
    .from('video_reviews')
    .select('*')
    .eq('gallery_id', gallery.id)
    .not('album_id', 'is', null)
    .order('created_at', { ascending: true })

  const videoList = (allVideos ?? []) as VideoReview[]

  // Signerte URL-er for videoenes forsidebilde (nettleseren rendrer selv første frame av
  // <video preload="metadata">, samme mønster som signedUrl for bilder over) — uten dette
  // vises kun et generisk avspillingsikon i stedet for en faktisk miniatyr av opptaket.
  const videoPaths = videoList.filter(v => v.storage_path).map(v => v.storage_path)
  const videoSignedUrlMap: Record<string, string> = {}
  if (videoPaths.length > 0) {
    const { data: videoUrlData } = await service.storage
      .from('videos')
      .createSignedUrls(videoPaths, SIGNED_URL_EXPIRY)
    for (const item of videoUrlData ?? []) {
      if (item.signedUrl && item.path) videoSignedUrlMap[item.path] = item.signedUrl
    }
  }
  const videoListWithUrl = videoList.map(v => ({
    ...v,
    signedUrl: videoSignedUrlMap[v.storage_path] ?? '',
  }))

  const rawImgs = (allImages ?? []) as {
    id: string; filename: string; storage_path: string | null
    sort_order: number; selected: boolean
    selected_at: string | null; album_id: string | null
    hidden_from_client: boolean
  }[]

  const paths = rawImgs.filter(i => i.storage_path).map(i => i.storage_path!)
  const signedUrlMap: Record<string, string> = {}

  if (paths.length > 0) {
    const { data: urlData } = await service.storage
      .from('selections')
      .createSignedUrls(paths, SIGNED_URL_EXPIRY)
    for (const item of urlData ?? []) {
      if (item.signedUrl && item.path) signedUrlMap[item.path] = item.signedUrl
    }
  }

  const commentsByImage = await getCommentsForImages(service, rawImgs.map(i => i.id))

  const withUrl = rawImgs.map(img => ({
    ...img,
    comments: commentsByImage[img.id] ?? [],
    signedUrl: img.storage_path ? (signedUrlMap[img.storage_path] ?? '') : '',
  }))

  const albumList = (albums ?? []) as SelectionAlbum[]
  const albumsWithImages: AlbumWithImages[] = albumList.map(album => {
    const albumImages = withUrl.filter(i => i.album_id === album.id)
    const albumVideos = videoListWithUrl.filter(v => v.album_id === album.id)
    return {
      ...album,
      images: albumImages,
      videos: albumVideos,
      selectedCount: albumImages.filter(i => i.selected).length,
    }
  })

  const ungroupedImages = withUrl.filter(i => i.album_id === null)
  const totalSelected = withUrl.filter(i => i.selected).length

  return {
    gallery: gallery as AdminSelectionPageData['gallery'],
    linkedProject,
    albums: albumsWithImages,
    ungroupedImages,
    totalSelected,
    totalImages: rawImgs.length,
  }
}

export async function createAlbum(galleryId: string, name: string, parentAlbumId?: string): Promise<SelectionAlbum> {
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
      parent_album_id: parentAlbumId ?? null,
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

export async function deleteAllAlbumImages(albumId: string): Promise<void> {
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

export async function moveImagesToAlbum(imageIds: string[], targetAlbumId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('selection_images')
    .update({ album_id: targetAlbumId })
    .in('id', imageIds)
}

export async function deleteAlbumImage(imageId: string, storagePath: string | null): Promise<void> {
  const supabase = await createClient()
  if (storagePath) {
    const service = createServiceClient()
    await service.storage.from('selections').remove([storagePath])
  }
  await supabase.from('selection_images').delete().eq('id', imageId)
}

// Opphever en intern reviewers skjuling av et bilde (se lib/actions/gallery-reviews.ts) —
// bildet blir synlig for kunden igjen.
export async function unhideImageFromClient(imageId: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('selection_images').update({ hidden_from_client: false }).eq('id', imageId)
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
  targetCount?: number,
  pinCode?: string,
): Promise<{ token: string; pinCode: string }> {
  const supabase = await createClient()
  const token = generateToken()
  const resolvedPin = pinCode ?? generatePin()

  await supabase
    .from('selection_albums')
    .update({
      album_token: token,
      album_pin_code: resolvedPin,
      album_target_count: targetCount ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', albumId)

  return { token, pinCode: resolvedPin }
}

export async function updateAlbumPin(albumId: string, pinCode: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('selection_albums')
    .update({ album_pin_code: pinCode, updated_at: new Date().toISOString() })
    .eq('id', albumId)
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

export async function getStandaloneGalleries(): Promise<{
  galleryId: string
  status: 'open' | 'submitted' | 'purged'
  albumCount: number
  totalSelected: number
  targetCount: number | null
  submittedAt: string | null
  createdAt: string
}[]> {
  const supabase = await createClient()

  const { data: galleries } = await supabase
    .from('selection_galleries')
    .select('id, status, target_count, submitted_at, created_at')
    .is('project_id', null)
    .order('created_at', { ascending: false })

  if (!galleries || galleries.length === 0) return []

  return Promise.all(
    galleries.map(async g => {
      const { count: ac } = await supabase
        .from('selection_albums')
        .select('id', { count: 'exact', head: true })
        .eq('gallery_id', g.id)
      const { count: sc } = await supabase
        .from('selection_images')
        .select('id', { count: 'exact', head: true })
        .eq('gallery_id', g.id)
        .eq('selected', true)

      return {
        galleryId: g.id,
        status: g.status as 'open' | 'submitted' | 'purged',
        albumCount: ac ?? 0,
        totalSelected: sc ?? 0,
        targetCount: g.target_count,
        submittedAt: g.submitted_at,
        createdAt: g.created_at,
      }
    })
  )
}

export type GalleryOverviewRow = {
  projectId: string
  projectName: string
  taskStatus: string
  galleryId: string | null
  galleryStatus: string | null
  albumCount: number
  totalSelected: number
  targetCount: number | null
  submittedAt: string | null
}

// Delt mellom getAllGalleriesOverview (Selektering ikke ferdig — aktiv seleksjonsfase)
// og getHiddenGalleriesOverview (Selektering ferdig — kunden har sendt inn, prosjektet
// har gått videre til redigering). Samme prosjekt kan aldri havne i begge listene.
async function getGalleriesOverviewByTaskDone(done: boolean): Promise<GalleryOverviewRow[]> {
  const supabase = await createClient()

  let query = supabase
    .from('tasks')
    .select('id, status, project_id, projects!inner(id, title, pipeline_stage, project_type)')
    .ilike('title', 'Selektering')
    .eq('projects.pipeline_stage', 'post_prod')
    .in('projects.project_type', ['photo', 'mixed'])
  query = done ? query.eq('status', 'done') : query.neq('status', 'done')

  const { data: tasks } = await query

  if (!tasks || tasks.length === 0) return []

  // Dedupliser — et prosjekt kan ha flere slike oppgaver
  const seen = new Set<string>()
  const uniqueTasks = tasks.filter(t => {
    if (seen.has(t.project_id)) return false
    seen.add(t.project_id)
    return true
  })

  // Hent alle gallerier for disse prosjektene (inkl. purged)
  const projectIds = uniqueTasks.map(t => t.project_id)
  const { data: galleries } = await supabase
    .from('selection_galleries')
    .select('id, project_id, status, target_count, submitted_at')
    .in('project_id', projectIds)
    .order('created_at', { ascending: false })

  // Foretrekk aktivt galleri (open/submitted) over purged
  const galleryByProject: Record<string, NonNullable<typeof galleries>[0]> = {}
  for (const g of galleries ?? []) {
    const existing = galleryByProject[g.project_id]
    if (!existing || (existing.status === 'purged' && g.status !== 'purged')) {
      galleryByProject[g.project_id] = g
    }
  }

  return Promise.all(
    uniqueTasks.map(async (task) => {
      const proj = task.projects as unknown as { id: string; title: string } | null
      const gallery = galleryByProject[task.project_id] ?? null

      let albumCount = 0
      let totalSelected = 0
      if (gallery) {
        const { count: ac } = await supabase
          .from('selection_albums')
          .select('id', { count: 'exact', head: true })
          .eq('gallery_id', gallery.id)
        const { count: sc } = await supabase
          .from('selection_images')
          .select('id', { count: 'exact', head: true })
          .eq('gallery_id', gallery.id)
          .eq('selected', true)
        albumCount = ac ?? 0
        totalSelected = sc ?? 0
      }

      return {
        projectId: task.project_id,
        projectName: proj?.title ?? '—',
        taskStatus: task.status,
        galleryId: gallery?.id ?? null,
        galleryStatus: gallery?.status ?? null,
        albumCount,
        totalSelected,
        targetCount: gallery?.target_count ?? null,
        submittedAt: gallery?.submitted_at ?? null,
      }
    })
  )
}

// Aktiv seleksjonsfase: kunden har ikke sendt inn ennå.
export async function getAllGalleriesOverview(): Promise<GalleryOverviewRow[]> {
  return getGalleriesOverviewByTaskDone(false)
}

// Skjult-fanen: kunden har sendt inn, prosjektet er videre i redigering —
// vises fortsatt her slik at galleriet ikke rett og slett forsvinner.
export async function getHiddenGalleriesOverview(): Promise<GalleryOverviewRow[]> {
  return getGalleriesOverviewByTaskDone(true)
}
