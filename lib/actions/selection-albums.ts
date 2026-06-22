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
