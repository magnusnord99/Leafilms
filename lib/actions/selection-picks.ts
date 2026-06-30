'use server'

import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase-server'
import type { SelectionAlbum } from './selection-albums'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIGNED_URL_EXPIRY = 60 * 60 * 2

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
  const now = new Date().toISOString()

  const { data: img } = await service
    .from('selection_images')
    .select('album_id')
    .eq('id', imageId)
    .single()

  if (img?.album_id !== albumId) throw new Error('Ikke autorisert')

  await Promise.all([
    service
      .from('selection_album_picks')
      .upsert({
        album_id: albumId,
        image_id: imageId,
        selected,
        selected_at: selected ? now : null,
      }, { onConflict: 'album_id,image_id' }),
    service
      .from('selection_images')
      .update({ selected, selected_at: selected ? now : null })
      .eq('id', imageId),
  ])
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

  const { data: img } = await service
    .from('selection_images')
    .select('album_id')
    .eq('id', imageId)
    .single()

  if (img?.album_id !== albumId) throw new Error('Ikke autorisert')

  const { data: existing } = await service
    .from('selection_album_picks')
    .select('selected')
    .eq('album_id', albumId)
    .eq('image_id', imageId)
    .maybeSingle()

  const trimmedComment = comment.trim() || null
  await Promise.all([
    service
      .from('selection_album_picks')
      .upsert({
        album_id: albumId,
        image_id: imageId,
        comment: trimmedComment,
        selected: existing?.selected ?? false,
      }, { onConflict: 'album_id,image_id' }),
    service
      .from('selection_images')
      .update({ comment: trimmedComment })
      .eq('id', imageId),
  ])
}

export async function submitAlbumPicks(albumToken: string): Promise<void> {
  const cookieStore = await cookies()
  const albumId = cookieStore.get(albumCookieKey(albumToken))?.value
  if (!albumId) throw new Error('Ikke autorisert')

  const service = createServiceClient()
  const now = new Date().toISOString()

  // Hent alle picks og alle bilder i albumet
  const [{ data: picks }, { data: images }] = await Promise.all([
    service.from('selection_album_picks').select('image_id, selected, comment').eq('album_id', albumId),
    service.from('selection_images').select('id').eq('album_id', albumId),
  ])

  const pickMap = Object.fromEntries((picks ?? []).map(p => [p.image_id, p]))

  // Synk alle bilder til selection_images
  await Promise.all(
    (images ?? []).map(img => {
      const pick = pickMap[img.id]
      return service
        .from('selection_images')
        .update({
          selected: pick?.selected ?? false,
          selected_at: pick?.selected ? now : null,
          comment: pick?.comment ?? null,
        })
        .eq('id', img.id)
    })
  )

  await service
    .from('selection_albums')
    .update({ album_status: 'submitted', album_submitted_at: now, updated_at: now })
    .eq('id', albumId)

  // Hent project_id via gallery
  const { data: album } = await service
    .from('selection_albums')
    .select('gallery_id')
    .eq('id', albumId)
    .single()

  if (!album?.gallery_id) return

  const { data: gallery } = await service
    .from('selection_galleries')
    .select('project_id')
    .eq('id', album.gallery_id)
    .single()

  if (!gallery?.project_id) return

  const projectId = gallery.project_id

  // Varsle task-assignees, fallback til prosjektleder
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

  // Marker "Seleksjon til kunde"-task som done
  const { data: selTask } = await service
    .from('tasks')
    .select('id')
    .eq('project_id', projectId)
    .eq('pipeline_stage', 'post_prod')
    .ilike('title', 'Seleksjon til kunde')
    .maybeSingle()

  await Promise.all([
    profileIds.length > 0
      ? service.from('notifications').insert(
          profileIds.map((uid: string) => ({
            user_id: uid,
            type: 'selection_submitted',
            project_id: projectId,
            message_preview: 'Kunden har sendt inn sitt bildevalg',
            sender_name: 'Kunde',
          }))
        )
      : Promise.resolve(),
    selTask
      ? service.from('tasks').update({ status: 'done', updated_at: now }).eq('id', selTask.id)
      : Promise.resolve(),
  ])
}
