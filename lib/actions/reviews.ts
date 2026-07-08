'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { notifyAssignment } from '@/lib/notify-assignment'
import type { Review, ReviewSubjectType } from '@/lib/types'

type ProfileRow = { id: string; name: string | null; email: string }

async function attachProfiles(supabase: Awaited<ReturnType<typeof createClient>>, rows: Omit<Review, 'requester' | 'reviewer'>[]): Promise<Review[]> {
  if (rows.length === 0) return []
  const userIds = [...new Set(rows.flatMap(r => [r.requested_by, r.reviewer_id]))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('id', userIds)
  const profileMap = Object.fromEntries(((profiles ?? []) as ProfileRow[]).map(p => [p.id, p]))
  return rows.map(r => ({
    ...r,
    requester: profileMap[r.requested_by] ?? null,
    reviewer: profileMap[r.reviewer_id] ?? null,
  }))
}

export async function getReviewHistory(projectId: string, subjectType: ReviewSubjectType): Promise<Review[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('reviews')
      .select('id, project_id, subject_type, status, requested_by, reviewer_id, comment, requested_at, responded_at, created_at')
      .eq('project_id', projectId)
      .eq('subject_type', subjectType)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('getReviewHistory error:', error)
      return []
    }
    return attachProfiles(supabase, (data ?? []) as Omit<Review, 'requester' | 'reviewer'>[])
  } catch (err) {
    console.error('getReviewHistory unexpected error:', err)
    return []
  }
}

export async function getLatestReview(projectId: string, subjectType: ReviewSubjectType): Promise<Review | null> {
  const history = await getReviewHistory(projectId, subjectType)
  return history[0] ?? null
}

export async function requestReview(projectId: string, subjectType: ReviewSubjectType): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const reviewerColumn = subjectType === 'pitch' ? 'pitch_reviewer_id' : 'quote_reviewer_id'
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`${reviewerColumn}, title`)
      .eq('id', projectId)
      .single()

    if (projectError || !project) return { ok: false, error: 'Fant ikke prosjektet' }

    const reviewerId = (project as unknown as Record<string, string | null>)[reviewerColumn]
    if (!reviewerId) {
      return { ok: false, error: 'Ingen reviewer valgt for denne typen ennå — velg en i prosjektinnstillingene' }
    }

    const { error: insertError } = await supabase.from('reviews').insert({
      project_id: projectId,
      subject_type: subjectType,
      status: 'pending',
      requested_by: user.id,
      reviewer_id: reviewerId,
    })

    if (insertError) {
      console.error('requestReview insert error:', insertError)
      return { ok: false, error: 'Kunne ikke sende til review' }
    }

    const label = subjectType === 'pitch' ? 'pitchen' : 'tilbudet'
    await notifyAssignment({
      recipientId: reviewerId,
      type: subjectType === 'pitch' ? 'pitch_review_requested' : 'quote_review_requested',
      projectId,
      preview: `Ber deg godkjenne ${label} for "${(project as unknown as { title: string }).title}"`,
    })

    revalidatePath(`/admin/projects/${projectId}`)
    return { ok: true }
  } catch (err) {
    console.error('requestReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function respondToReview(reviewId: string, decision: 'approved' | 'changes_requested', comment?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: review, error: fetchError } = await supabase
      .from('reviews')
      .select('id, project_id, subject_type, requested_by, reviewer_id')
      .eq('id', reviewId)
      .single()

    if (fetchError || !review) return { ok: false, error: 'Fant ikke review-forespørselen' }

    if (user.id !== review.reviewer_id) {
      return { ok: false, error: 'Du er ikke satt som reviewer for denne forespørselen' }
    }

    const { error: updateError } = await supabase
      .from('reviews')
      .update({
        status: decision,
        comment: comment?.trim() || null,
        responded_at: new Date().toISOString(),
      })
      .eq('id', reviewId)

    if (updateError) {
      console.error('respondToReview update error:', updateError)
      return { ok: false, error: 'Kunne ikke lagre svaret' }
    }

    const label = review.subject_type === 'pitch' ? 'pitchen' : 'tilbudet'
    const preview = decision === 'approved'
      ? `Godkjente ${label}`
      : `Ba om endringer på ${label}${comment ? `: ${comment}` : ''}`

    await notifyAssignment({
      recipientId: review.requested_by,
      type: review.subject_type === 'pitch' ? 'pitch_review_responded' : 'quote_review_responded',
      projectId: review.project_id,
      preview,
    })

    revalidatePath(`/admin/projects/${review.project_id}`)
    return { ok: true }
  } catch (err) {
    console.error('respondToReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function updateReviewSettings(projectId: string, settings: {
  pitch_review_enabled?: boolean
  pitch_reviewer_id?: string | null
  quote_review_enabled?: boolean
  quote_reviewer_id?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('projects')
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq('id', projectId)

    if (error) {
      console.error('updateReviewSettings error:', error)
      return { ok: false, error: 'Kunne ikke oppdatere review-innstillinger' }
    }

    revalidatePath(`/admin/projects/${projectId}`)
    return { ok: true }
  } catch (err) {
    console.error('updateReviewSettings unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
