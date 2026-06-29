'use server'

import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase-server'

// ── Konstanter ────────────────────────────────────────────────────────────────

const COOKIE_MAX_AGE = 60 * 60 * 24 * 7   // 7 dager
const SIGNED_URL_EXPIRY = 60 * 60 * 4     // 4 timer

// ── Typer ─────────────────────────────────────────────────────────────────────

export type VideoReview = {
  id: string
  project_id: string
  gallery_id: string | null
  title: string
  storage_path: string
  duration_seconds: number | null
  token: string
  pin_code: string
  status: 'open' | 'submitted'
  created_at: string
  updated_at: string
}

export type VideoComment = {
  id: string
  review_id: string
  timestamp_seconds: number | null
  text: string
  author_name: string | null
  resolved: boolean
  created_at: string
}

// ── Hjelpefunksjoner ──────────────────────────────────────────────────────────

function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function cookieKey(token: string): string {
  return `vr_${token.slice(0, 16)}`
}

// ── Admin-funksjoner ──────────────────────────────────────────────────────────

export async function createVideoReview(
  projectId: string,
  title: string,
  storagePath: string,
  galleryId?: string,
): Promise<VideoReview> {
  const service = createServiceClient()

  const { data, error } = await service
    .from('video_reviews')
    .insert({
      project_id: projectId,
      gallery_id: galleryId ?? null,
      title,
      storage_path: storagePath,
      token: generateToken(),
      pin_code: generatePin(),
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Kunne ikke opprette video review')
  return data as VideoReview
}

export async function getGalleryVideos(galleryId: string): Promise<VideoReview[]> {
  const service = createServiceClient()
  const { data } = await service
    .from('video_reviews')
    .select('*')
    .eq('gallery_id', galleryId)
    .order('created_at', { ascending: true })
  return (data ?? []) as VideoReview[]
}

// Gallery-scoped video auth — bruker seksjonsgalleriets cookie (sel_...)
const GALLERY_COOKIE_PREFIX = 'sel_'
function galleryCookieKey(token: string) { return `${GALLERY_COOKIE_PREFIX}${token.slice(0, 16)}` }

export async function getVideoForGallery(
  galleryToken: string,
  reviewId: string,
): Promise<{ review: VideoReview; comments: VideoComment[]; signedUrl: string } | null> {
  const cookieStore = await cookies()
  const galleryId = cookieStore.get(galleryCookieKey(galleryToken))?.value
  if (!galleryId) return null

  const service = createServiceClient()

  const { data: review } = await service
    .from('video_reviews')
    .select('*')
    .eq('id', reviewId)
    .eq('gallery_id', galleryId)
    .single()

  if (!review) return null

  const [commentsResult, signedUrlResult] = await Promise.all([
    service
      .from('video_comments')
      .select('*')
      .eq('review_id', reviewId)
      .order('timestamp_seconds', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    service.storage
      .from('videos')
      .createSignedUrl((review as VideoReview).storage_path, SIGNED_URL_EXPIRY),
  ])

  if (!signedUrlResult.data?.signedUrl) return null

  return {
    review: review as VideoReview,
    comments: (commentsResult.data ?? []) as VideoComment[],
    signedUrl: signedUrlResult.data.signedUrl,
  }
}

export async function addVideoCommentViaGallery(
  galleryToken: string,
  reviewId: string,
  text: string,
  timestampSeconds: number | null,
  authorName?: string,
): Promise<VideoComment> {
  const cookieStore = await cookies()
  const galleryId = cookieStore.get(galleryCookieKey(galleryToken))?.value
  if (!galleryId) throw new Error('Ikke autorisert')

  const service = createServiceClient()
  const { data: review } = await service
    .from('video_reviews')
    .select('id, status')
    .eq('id', reviewId)
    .eq('gallery_id', galleryId)
    .single()

  if (!review) throw new Error('Ikke autorisert')
  if (review.status === 'submitted') throw new Error('Video review er allerede sendt inn')

  const { data, error } = await service
    .from('video_comments')
    .insert({ review_id: reviewId, text: text.trim(), timestamp_seconds: timestampSeconds, author_name: authorName?.trim() ?? null })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Kunne ikke legge til kommentar')
  return data as VideoComment
}

export async function submitVideoReviewViaGallery(
  galleryToken: string,
  reviewId: string,
): Promise<void> {
  const cookieStore = await cookies()
  const galleryId = cookieStore.get(galleryCookieKey(galleryToken))?.value
  if (!galleryId) throw new Error('Ikke autorisert')

  const service = createServiceClient()
  const { data: review } = await service
    .from('video_reviews')
    .select('id')
    .eq('id', reviewId)
    .eq('gallery_id', galleryId)
    .single()

  if (!review) throw new Error('Ikke autorisert')

  await service
    .from('video_reviews')
    .update({ status: 'submitted', updated_at: new Date().toISOString() })
    .eq('id', reviewId)
}

export async function getAdminVideoReviews(projectId: string): Promise<VideoReview[]> {
  const service = createServiceClient()

  const { data, error } = await service
    .from('video_reviews')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as VideoReview[]
}

export async function getAdminVideoComments(reviewId: string): Promise<VideoComment[]> {
  const service = createServiceClient()

  const { data, error } = await service
    .from('video_comments')
    .select('*')
    .eq('review_id', reviewId)
    .order('timestamp_seconds', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as VideoComment[]
}

export async function getVideoSignedUrl(storagePath: string): Promise<string> {
  const service = createServiceClient()

  const { data, error } = await service.storage
    .from('videos')
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY)

  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Kunne ikke lage signert URL')
  return data.signedUrl
}

export async function deleteVideoReview(
  reviewId: string,
  storagePath: string
): Promise<void> {
  const service = createServiceClient()

  // Slett filen fra storage først
  const { error: storageError } = await service.storage
    .from('videos')
    .remove([storagePath])

  if (storageError) {
    console.error('deleteVideoReview: storage feil:', storageError)
    // Fortsett selv om storage-sletting feiler — cascade-sletter kommentarer
  }

  const { error } = await service
    .from('video_reviews')
    .delete()
    .eq('id', reviewId)

  if (error) throw new Error(error.message)
}

export async function resolveVideoComment(
  commentId: string,
  resolved: boolean
): Promise<void> {
  const service = createServiceClient()

  const { error } = await service
    .from('video_comments')
    .update({ resolved })
    .eq('id', commentId)

  if (error) throw new Error(error.message)
}

export async function deleteVideoComment(commentId: string): Promise<void> {
  const service = createServiceClient()

  const { error } = await service
    .from('video_comments')
    .delete()
    .eq('id', commentId)

  if (error) throw new Error(error.message)
}

// ── Kunde-autentisering ───────────────────────────────────────────────────────

export async function videoTokenExists(token: string): Promise<boolean> {
  const service = createServiceClient()

  const { count } = await service
    .from('video_reviews')
    .select('id', { count: 'exact', head: true })
    .eq('token', token)

  return (count ?? 0) > 0
}

export async function verifyVideoPin(
  token: string,
  pin: string
): Promise<{ ok: boolean; error?: string }> {
  const service = createServiceClient()

  const { data: review, error } = await service
    .from('video_reviews')
    .select('id, pin_code')
    .eq('token', token)
    .single()

  if (error || !review) return { ok: false, error: 'Fant ikke video review' }
  if (pin !== review.pin_code) return { ok: false, error: 'Feil PIN' }

  const cookieStore = await cookies()
  cookieStore.set(cookieKey(token), review.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/v/${token}`,
    maxAge: COOKIE_MAX_AGE,
  })

  return { ok: true }
}

// ── Kunde-datauthenting ───────────────────────────────────────────────────────

export async function getVideoForCustomer(token: string): Promise<{
  review: VideoReview
  comments: VideoComment[]
  signedUrl: string
} | null> {
  const cookieStore = await cookies()
  const reviewId = cookieStore.get(cookieKey(token))?.value
  if (!reviewId) return null

  const service = createServiceClient()

  const { data: review } = await service
    .from('video_reviews')
    .select('*')
    .eq('id', reviewId)
    .eq('token', token)
    .single()

  if (!review) return null

  const [commentsResult, signedUrlResult] = await Promise.all([
    service
      .from('video_comments')
      .select('*')
      .eq('review_id', reviewId)
      .order('timestamp_seconds', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true }),
    service.storage
      .from('videos')
      .createSignedUrl((review as VideoReview).storage_path, SIGNED_URL_EXPIRY),
  ])

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) return null

  return {
    review: review as VideoReview,
    comments: (commentsResult.data ?? []) as VideoComment[],
    signedUrl: signedUrlResult.data.signedUrl,
  }
}

// ── Kunde-handlinger (krever gyldig cookie) ───────────────────────────────────

export async function addVideoComment(
  token: string,
  text: string,
  timestampSeconds: number | null,
  authorName?: string
): Promise<VideoComment> {
  const cookieStore = await cookies()
  const reviewId = cookieStore.get(cookieKey(token))?.value
  if (!reviewId) throw new Error('Ikke autorisert')

  const service = createServiceClient()

  // Verifiser at reviewId tilhører token
  const { data: review } = await service
    .from('video_reviews')
    .select('id, status')
    .eq('id', reviewId)
    .eq('token', token)
    .single()

  if (!review) throw new Error('Ikke autorisert')
  if (review.status === 'submitted') throw new Error('Video review er allerede sendt inn')

  const { data, error } = await service
    .from('video_comments')
    .insert({
      review_id: reviewId,
      text: text.trim(),
      timestamp_seconds: timestampSeconds,
      author_name: authorName?.trim() ?? null,
    })
    .select()
    .single()

  if (error || !data) throw new Error(error?.message ?? 'Kunne ikke legge til kommentar')
  return data as VideoComment
}

export async function submitVideoReview(token: string): Promise<void> {
  const cookieStore = await cookies()
  const reviewId = cookieStore.get(cookieKey(token))?.value
  if (!reviewId) throw new Error('Ikke autorisert')

  const service = createServiceClient()

  // Verifiser at reviewId tilhører token
  const { data: review } = await service
    .from('video_reviews')
    .select('id')
    .eq('id', reviewId)
    .eq('token', token)
    .single()

  if (!review) throw new Error('Ikke autorisert')

  const { error } = await service
    .from('video_reviews')
    .update({ status: 'submitted', updated_at: new Date().toISOString() })
    .eq('id', reviewId)

  if (error) throw new Error(error.message)
}
