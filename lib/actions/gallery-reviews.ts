'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { notifyAssignment } from '@/lib/notify-assignment'
import { getAdminGalleryPage, type AdminSelectionPageData } from '@/lib/actions/selection-albums'
import type { GalleryReview, GalleryReviewMark, GalleryReviewPin } from '@/lib/types'

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
  pins: GalleryReviewPin[]
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

    const [[review], gallery, marksResult, pinsResult] = await Promise.all([
      attachProfiles(supabase, [reviewRow as Omit<GalleryReview, 'requester' | 'reviewer'>]),
      getAdminGalleryPage(reviewRow.gallery_id),
      supabase.from('gallery_review_marks').select('id, review_id, image_id, keep, note').eq('review_id', reviewId),
      supabase.from('gallery_review_pins').select('id, review_id, image_id, x_pct, y_pct, text, created_by, created_at').eq('review_id', reviewId).order('created_at'),
    ])

    if (!gallery) return null

    return {
      review,
      gallery,
      marks: (marksResult.data ?? []) as GalleryReviewMark[],
      pins: (pinsResult.data ?? []) as GalleryReviewPin[],
    }
  } catch (err) {
    console.error('getGalleryForInternalReview unexpected error:', err)
    return null
  }
}

// Punkt-kommentarer på bildet, for leverings-galleri-review (se 180_gallery_review_pins.sql).
// Samme reviewer-sjekk som saveReviewMark — kun den oppsatte reviewer for denne
// runden kan legge til/endre/slette punkter.
async function assertIsReviewer(supabase: Awaited<ReturnType<typeof createClient>>, reviewId: string): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Ikke innlogget' }

  const { data: review } = await supabase
    .from('gallery_reviews')
    .select('reviewer_id')
    .eq('id', reviewId)
    .single()

  if (!review || user.id !== review.reviewer_id) {
    return { ok: false, error: 'Du er ikke satt som reviewer for denne forespørselen' }
  }
  return { ok: true, userId: user.id }
}

export async function addReviewPin(reviewId: string, imageId: string, xPct: number, yPct: number, text: string): Promise<{ ok: boolean; error?: string; pin?: GalleryReviewPin }> {
  try {
    const supabase = await createClient()
    const access = await assertIsReviewer(supabase, reviewId)
    if (!access.ok) return { ok: false, error: access.error }

    if (!text.trim()) return { ok: false, error: 'Kommentaren kan ikke være tom' }

    const { data, error } = await supabase
      .from('gallery_review_pins')
      .insert({
        review_id: reviewId,
        image_id: imageId,
        x_pct: Math.max(0, Math.min(100, xPct)),
        y_pct: Math.max(0, Math.min(100, yPct)),
        text: text.trim(),
        created_by: access.userId,
      })
      .select('id, review_id, image_id, x_pct, y_pct, text, created_by, created_at')
      .single()

    if (error || !data) {
      console.error('addReviewPin error:', error)
      return { ok: false, error: 'Kunne ikke lagre kommentaren' }
    }
    return { ok: true, pin: data as GalleryReviewPin }
  } catch (err) {
    console.error('addReviewPin unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function updateReviewPin(pinId: string, reviewId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const access = await assertIsReviewer(supabase, reviewId)
    if (!access.ok) return { ok: false, error: access.error }

    if (!text.trim()) return { ok: false, error: 'Kommentaren kan ikke være tom' }

    const { error } = await supabase
      .from('gallery_review_pins')
      .update({ text: text.trim() })
      .eq('id', pinId)
      .eq('review_id', reviewId)

    if (error) {
      console.error('updateReviewPin error:', error)
      return { ok: false, error: 'Kunne ikke lagre kommentaren' }
    }
    return { ok: true }
  } catch (err) {
    console.error('updateReviewPin unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function deleteReviewPin(pinId: string, reviewId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const access = await assertIsReviewer(supabase, reviewId)
    if (!access.ok) return { ok: false, error: access.error }

    const { error } = await supabase
      .from('gallery_review_pins')
      .delete()
      .eq('id', pinId)
      .eq('review_id', reviewId)

    if (error) {
      console.error('deleteReviewPin error:', error)
      return { ok: false, error: 'Kunne ikke slette kommentaren' }
    }
    return { ok: true }
  } catch (err) {
    console.error('deleteReviewPin unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function saveReviewMark(reviewId: string, imageId: string, keep: boolean, note?: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: review } = await supabase
      .from('gallery_reviews')
      .select('reviewer_id')
      .eq('id', reviewId)
      .single()

    if (!review || user.id !== review.reviewer_id) {
      return { ok: false, error: 'Du er ikke satt som reviewer for denne forespørselen' }
    }

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

// Henter den aktive (pending) reviewen et postprod-steg venter på, slik at
// "Redigering"-steget kan vise hvem som reviewer og lenke til tilbakemeldingene
// så langt — i stedet for å stå helt tomt mens status er 'waiting_review'.
export async function getGalleryReviewByTaskId(taskId: string): Promise<{
  reviewId: string
  galleryId: string
  reviewerName: string | null
} | null> {
  try {
    const supabase = await createClient()
    const { data: review } = await supabase
      .from('gallery_reviews')
      .select('id, gallery_id, reviewer_id')
      .eq('task_id', taskId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!review) return null

    const { data: reviewer } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', review.reviewer_id)
      .maybeSingle()

    return {
      reviewId: review.id,
      galleryId: review.gallery_id,
      reviewerName: reviewer?.name ?? reviewer?.email ?? null,
    }
  } catch (err) {
    console.error('getGalleryReviewByTaskId unexpected error:', err)
    return null
  }
}

// Lar avsender overstyre en 'waiting_review'-lås som henger fast fordi reviewer
// ikke har svart ennå (feedback 9841b60e) — f.eks. glemt det. Reviewen selv
// røres ikke (forblir 'pending'), slik at reviewer fortsatt kan svare etterpå —
// dette bare låser opp steget og minner reviewer på forespørselen på nytt.
export async function overrideWaitingReview(taskId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, status, project_id')
      .eq('id', taskId)
      .single()

    if (taskError || !task) return { ok: false, error: 'Fant ikke oppgaven' }
    if (task.status !== 'waiting_review') return { ok: false, error: 'Oppgaven venter ikke på review' }

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', taskId)

    if (updateError) {
      console.error('overrideWaitingReview update error:', updateError)
      return { ok: false, error: 'Kunne ikke låse opp steget' }
    }

    const { data: review } = await supabase
      .from('gallery_reviews')
      .select('id, gallery_id, reviewer_id')
      .eq('task_id', taskId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (review) {
      let projectTitle: string | null = null
      if (task.project_id) {
        const { data: project } = await supabase.from('projects').select('title').eq('id', task.project_id).maybeSingle()
        projectTitle = project?.title ?? null
      }
      await notifyAssignment({
        recipientId: review.reviewer_id,
        type: 'gallery_review_requested',
        projectId: task.project_id,
        galleryId: review.gallery_id,
        galleryReviewId: review.id,
        preview: projectTitle
          ? `Fortsatte uten din godkjenning på "${projectTitle}" — se gjennom bildeutvalget når du kan`
          : 'Fortsatte uten din godkjenning — se gjennom bildeutvalget når du kan',
      })
    }

    revalidatePath(`/admin/postprod/${task.project_id}`)
    return { ok: true }
  } catch (err) {
    console.error('overrideWaitingReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

// Egen oversikt for intern-review-gallerier (gallery_type='delivery') — disse
// hørte tidligere ingen steder hjemme i /admin/selections, som kun viser
// kunde-gallerier (gallery_type='selection') knyttet til Selektering-steget
// (feedback 5aec4626/6c9e4ffa).
export async function getInternalReviewGalleriesOverview(): Promise<{
  projectId: string | null
  projectName: string
  galleryId: string
  reviewId: string | null
  reviewStatus: GalleryReview['status'] | null
  reviewerName: string | null
  requestedAt: string | null
}[]> {
  try {
    const supabase = await createClient()
    const { data: galleries } = await supabase
      .from('selection_galleries')
      .select('id, project_id, created_at, projects(title)')
      .eq('gallery_type', 'delivery')
      .order('created_at', { ascending: false })

    if (!galleries || galleries.length === 0) return []

    const galleryIds = galleries.map(g => g.id)
    const { data: reviews } = await supabase
      .from('gallery_reviews')
      .select('id, gallery_id, status, reviewer_id, requested_at')
      .in('gallery_id', galleryIds)
      .order('requested_at', { ascending: false })

    const latestReviewByGallery: Record<string, NonNullable<typeof reviews>[0]> = {}
    for (const r of reviews ?? []) {
      if (!latestReviewByGallery[r.gallery_id]) latestReviewByGallery[r.gallery_id] = r
    }

    const reviewerIds = [...new Set(Object.values(latestReviewByGallery).map(r => r.reviewer_id))]
    const { data: reviewerProfiles } = reviewerIds.length > 0
      ? await supabase.from('profiles').select('id, name, email').in('id', reviewerIds)
      : { data: [] as ProfileRow[] }
    const reviewerMap = Object.fromEntries(((reviewerProfiles ?? []) as ProfileRow[]).map(p => [p.id, p]))

    return galleries.map(g => {
      const review = latestReviewByGallery[g.id] ?? null
      const reviewer = review ? reviewerMap[review.reviewer_id] : null
      const project = g.projects as unknown as { title: string } | null
      return {
        projectId: g.project_id,
        projectName: project?.title ?? 'Frittstående galleri',
        galleryId: g.id,
        reviewId: review?.id ?? null,
        reviewStatus: review?.status ?? null,
        reviewerName: reviewer ? (reviewer.name ?? reviewer.email) : null,
        requestedAt: review?.requested_at ?? null,
      }
    })
  } catch (err) {
    console.error('getInternalReviewGalleriesOverview unexpected error:', err)
    return []
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
