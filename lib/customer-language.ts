// Server-side oppslag av visningsspråk for de offentlige kundeflatene som henger på
// egne tokens (/s galleri, /v videogjennomgang). Språket arves fra prosjektet
// (projects.language) via project_id — samme kilde som /p-sidene bruker.
// Kun for bruk i server components; går via service-klienten siden anon ikke har
// RLS-tilgang til disse tabellene.

import { createServiceClient } from '@/lib/supabase-server'

export type CustomerLanguage = 'no' | 'en'

async function languageForProject(projectId: string | null | undefined): Promise<CustomerLanguage> {
  if (!projectId) return 'no'
  const service = createServiceClient()
  const { data } = await service
    .from('projects')
    .select('language')
    .eq('id', projectId)
    .single()
  return data?.language === 'en' ? 'en' : 'no'
}

export async function getGalleryLanguage(token: string): Promise<CustomerLanguage> {
  const service = createServiceClient()
  const { data } = await service
    .from('selection_galleries')
    .select('project_id')
    .eq('token', token)
    .single()
  return languageForProject(data?.project_id)
}

export async function getAlbumLanguage(albumToken: string): Promise<CustomerLanguage> {
  const service = createServiceClient()
  const { data: album } = await service
    .from('selection_albums')
    .select('gallery_id')
    .eq('album_token', albumToken)
    .single()
  if (!album?.gallery_id) return 'no'
  const { data: gallery } = await service
    .from('selection_galleries')
    .select('project_id')
    .eq('id', album.gallery_id)
    .single()
  return languageForProject(gallery?.project_id)
}

export async function getVideoReviewLanguage(token: string): Promise<CustomerLanguage> {
  const service = createServiceClient()
  const { data } = await service
    .from('video_reviews')
    .select('project_id')
    .eq('token', token)
    .single()
  return languageForProject(data?.project_id)
}
