'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { notifyAssignment } from '@/lib/notify-assignment'
import { getAdminGalleryPage, type AdminSelectionPageData } from '@/lib/actions/selection-albums'
import type { GalleryReview, GalleryReviewMark } from '@/lib/types'

type ProfileRow = { id: string; name: string | null; email: string }

async function attachProfiles(supabase: Awaited<ReturnType<typeof createClient>>, rows: Omit<GalleryReview, 'requester' | 'reviewer'>[]): Promise<GalleryReview[]> {
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

export async function getGalleryReviewHistory(galleryId: string): Promise<GalleryReview[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('gallery_reviews')
      .select('id, gallery_id, status, requested_by, reviewer_id, comment, requested_at, responded_at, created_at, admin_task_id, task_id')
      .eq('gallery_id', galleryId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('getGalleryReviewHistory error:', error)
      return []
    }
    return attachProfiles(supabase, (data ?? []) as Omit<GalleryReview, 'requester' | 'reviewer'>[])
  } catch (err) {
    console.error('getGalleryReviewHistory unexpected error:', err)
    return []
  }
}

export async function getLatestGalleryReview(galleryId: string): Promise<GalleryReview | null> {
  const history = await getGalleryReviewHistory(galleryId)
  return history[0] ?? null
}

export async function requestGalleryReview(galleryId: string, reviewerId: string, dueDate?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: gallery, error: galleryError } = await supabase
      .from('selection_galleries')
      .select('id, project_id, gallery_type')
      .eq('id', galleryId)
      .single()

    if (galleryError || !gallery) return { ok: false, error: 'Fant ikke galleriet' }

    let projectTitle: string | null = null
    if (gallery.project_id) {
      const { data: project } = await supabase
        .from('projects')
        .select('title')
        .eq('id', gallery.project_id)
        .maybeSingle()
      projectTitle = project?.title ?? null
    }

    // Marker postprod-steget "venter på review" mens kollegaen ser gjennom bildene,
    // slik at det er synlig i stepperen at prosjektet ikke faktisk står stille.
    // Matcher kun eksakt tittel (samme begrensning som SELEKSJON_TITLE i postprod-siden
    // — dekker ikke mixed-prosjekters "Selektering bilder"/"Redigering bilder").
    let waitingReviewTaskId: string | null = null
    if (gallery.project_id) {
      const stepTitle = gallery.gallery_type === 'delivery' ? 'Redigering' : 'Selektering'
      const { data: step } = await supabase
        .from('tasks')
        .select('id')
        .eq('project_id', gallery.project_id)
        .eq('pipeline_stage', 'post_prod')
        .eq('title', stepTitle)
        .in('status', ['todo', 'in_progress'])
        .maybeSingle()

      if (step) {
        const { error: stepError } = await supabase
          .from('tasks')
          .update({ status: 'waiting_review', updated_at: new Date().toISOString() })
          .eq('id', step.id)
        if (!stepError) waitingReviewTaskId = step.id
      }
    }

    // Legger seg som en oppgave hos reviewer (admin_tasks — ikke prosjekt-tasks,
    // siden gallerier kan mangle prosjekt), slik at reviewen dukker opp på
    // arbeidslisten deres i tillegg til varselet.
    const { data: maxOrder } = await supabase
      .from('admin_tasks')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)

    const { data: task, error: taskError } = await supabase
      .from('admin_tasks')
      .insert({
        title: projectTitle ? `Gjennomgå bildeutvalg — ${projectTitle}` : 'Gjennomgå bildeutvalg',
        description: `Intern review før kunden får tilgang. Åpne fra varselet i /admin/varsler, eller direkte: /admin/selections/${galleryId}`,
        assignee_id: reviewerId,
        due_date: dueDate || null,
        sort_order: (maxOrder && maxOrder.length > 0 ? maxOrder[0].sort_order : 0) + 1,
        created_by: user.id,
        project_id: gallery.project_id ?? null,
      })
      .select('id')
      .single()

    if (taskError) console.error('requestGalleryReview task insert error:', taskError)

    const { data: review, error: insertError } = await supabase
      .from('gallery_reviews')
      .insert({
        gallery_id: galleryId,
        status: 'pending',
        requested_by: user.id,
        reviewer_id: reviewerId,
        admin_task_id: task?.id ?? null,
        task_id: waitingReviewTaskId,
      })
      .select('id')
      .single()

    if (insertError || !review) {
      console.error('requestGalleryReview insert error:', insertError)
      return { ok: false, error: 'Kunne ikke sende til review' }
    }

    await notifyAssignment({
      recipientId: reviewerId,
      type: 'gallery_review_requested',
      projectId: gallery.project_id,
      galleryId,
      galleryReviewId: review.id,
      preview: projectTitle
        ? `Ber deg gjennomgå bildeutvalget for "${projectTitle}"`
        : 'Ber deg gjennomgå et bildeutvalg',
    })

    revalidatePath(`/admin/selections/${galleryId}`)
    revalidatePath('/admin/internal')
    if (gallery.project_id) revalidatePath(`/admin/postprod/${gallery.project_id}`)
    return { ok: true }
  } catch (err) {
    console.error('requestGalleryReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function getGalleryForInternalReview(reviewId: string): Promise<{
  review: GalleryReview
  marks: GalleryReviewMark[]
  gallery: AdminSelectionPageData
} | null> {
  try {
    const supabase = await createClient()
    const { data: reviewRow, error } = await supabase
      .from('gallery_reviews')
      .select('id, gallery_id, status, requested_by, reviewer_id, comment, requested_at, responded_at, created_at, admin_task_id, task_id')
      .eq('id', reviewId)
      .maybeSingle()

    if (error || !reviewRow) return null

    const [[review], gallery, marksResult] = await Promise.all([
      attachProfiles(supabase, [reviewRow as Omit<GalleryReview, 'requester' | 'reviewer'>]),
      getAdminGalleryPage(reviewRow.gallery_id),
      supabase.from('gallery_review_marks').select('id, review_id, image_id, keep, note').eq('review_id', reviewId),
    ])

    if (!gallery) return null

    return {
      review,
      gallery,
      marks: (marksResult.data ?? []) as GalleryReviewMark[],
    }
  } catch (err) {
    console.error('getGalleryForInternalReview unexpected error:', err)
    return null
  }
}

export async function saveReviewMark(reviewId: string, imageId: string, keep: boolean, note?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('gallery_review_marks')
      .upsert({
        review_id: reviewId,
        image_id: imageId,
        keep,
        note: note?.trim() || null,
      }, { onConflict: 'review_id,image_id' })

    if (error) {
      console.error('saveReviewMark error:', error)
      return { ok: false, error: 'Kunne ikke lagre' }
    }
    return { ok: true }
  } catch (err) {
    console.error('saveReviewMark unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function respondToGalleryReview(reviewId: string, decision: 'approved' | 'changes_requested', comment?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: review, error: fetchError } = await supabase
      .from('gallery_reviews')
      .select('id, gallery_id, requested_by, reviewer_id, admin_task_id, task_id')
      .eq('id', reviewId)
      .single()

    if (fetchError || !review) return { ok: false, error: 'Fant ikke review-forespørselen' }

    if (user.id !== review.reviewer_id) {
      return { ok: false, error: 'Du er ikke satt som reviewer for denne forespørselen' }
    }

    if (decision === 'changes_requested' && !comment?.trim()) {
      return { ok: false, error: 'Kommentar er påkrevd når du ber om endringer' }
    }

    const { error: updateError } = await supabase
      .from('gallery_reviews')
      .update({
        status: decision,
        comment: comment?.trim() || null,
        responded_at: new Date().toISOString(),
      })
      .eq('id', reviewId)

    if (updateError) {
      console.error('respondToGalleryReview update error:', updateError)
      return { ok: false, error: 'Kunne ikke lagre svaret' }
    }

    if (review.admin_task_id) {
      await supabase.from('admin_tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', review.admin_task_id)
    }

    // Tilbakestill postprod-steget uansett utfall (godkjent/endringer ønsket) —
    // avsender markerer selv steget ferdig når de er klare, dette bare låser opp igjen.
    if (review.task_id) {
      await supabase.from('tasks').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', review.task_id)
    }

    const { data: gallery } = await supabase
      .from('selection_galleries')
      .select('project_id, gallery_type')
      .eq('id', review.gallery_id)
      .maybeSingle()

    // Skjul-ved-godkjenning gjelder kun seleksjons-gallerier — der lar en godkjent
    // review reviewer velge bort bilder fra det kunden får se. Leverings-gallerier
    // har ingen slik fjern/legg-til-funksjon: alt det ble avgjort i seleksjonen,
    // og "trenger endring"-merking der er ren tilbakemelding, ikke en eksklusjon.
    if (decision === 'approved' && gallery?.gallery_type !== 'delivery') {
      const { data: excludedMarks } = await supabase
        .from('gallery_review_marks')
        .select('image_id')
        .eq('review_id', reviewId)
        .eq('keep', false)

      const excludedIds = (excludedMarks ?? []).map(m => m.image_id)
      if (excludedIds.length > 0) {
        const { error: hideError } = await supabase
          .from('selection_images')
          .update({ hidden_from_client: true })
          .in('id', excludedIds)
        if (hideError) console.error('respondToGalleryReview hide error:', hideError)
      }
    }

    const preview = decision === 'approved'
      ? 'Godkjente bildeutvalget'
      : `Ba om endringer på bildeutvalget${comment ? `: ${comment}` : ''}`

    await notifyAssignment({
      recipientId: review.requested_by,
      type: 'gallery_review_responded',
      projectId: gallery?.project_id ?? null,
      galleryId: review.gallery_id,
      galleryReviewId: reviewId,
      preview,
    })

    revalidatePath(`/admin/selections/${review.gallery_id}`)
    revalidatePath(`/admin/selections/${review.gallery_id}/review/${reviewId}`)
    revalidatePath('/admin/internal')
    if (gallery?.project_id) revalidatePath(`/admin/postprod/${gallery.project_id}`)
    return { ok: true }
  } catch (err) {
    console.error('respondToGalleryReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
