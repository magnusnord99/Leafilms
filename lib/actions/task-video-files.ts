'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { r2, R2_BUCKET } from '@/lib/r2'
import { CreateMultipartUploadCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { completeUpload } from '@/lib/actions/transfers'
import { createVideoReview } from '@/lib/actions/video-reviews'
import { notifyAssignment } from '@/lib/notify-assignment'

// Samme delstørrelse som transfers.ts — se begrunnelse der. Ikke eksportert
// ("use server"-filer kan kun eksportere async-funksjoner); klienten får
// verdien via initiateTaskFileUpload()'s returverdi.
const UPLOAD_PART_SIZE = 25 * 1024 * 1024
const SIGNED_URL_EXPIRY = 60 * 60 * 4 // 4 timer, samme som video-reviews.ts

export type TaskVideoFile = {
  id: string
  task_id: string
  filename: string
  r2_key: string
  size_bytes: number
  content_type: string | null
  uploaded_by: string | null
  replaces_file_id: string | null
  sort_order: number
  created_at: string
}

// Starter en multipart-opplasting til R2 for et postprod-steg. Egen
// nøkkel-prefix ("postprod/") adskilt fra transfers.ts sin "transfers/"-prefix
// for sluttleveranser — for øvrig identisk mønster (se lib/actions/transfers.ts).
export async function initiateTaskFileUpload(input: {
  taskId: string
  filename: string
  contentType?: string
}): Promise<{ key: string; uploadId: string; partSize: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke autentisert' }

  const key = `postprod/${input.taskId}/${randomBytes(16).toString('hex')}/${input.filename}`

  try {
    const { UploadId } = await r2.send(new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: input.contentType || undefined,
    }))
    if (!UploadId) return { error: 'R2 returnerte ingen upload-ID' }
    return { key, uploadId: UploadId, partSize: UPLOAD_PART_SIZE }
  } catch (err) {
    console.error('[initiateTaskFileUpload]', err)
    return { error: 'Kunne ikke starte opplasting til R2' }
  }
}

// Fullfører opplastingen (via transfers.ts sin generiske completeUpload) og
// registrerer filen i task_video_files. Hvis replacesFileId er satt, kjeder
// den nye raden bakover til forrige versjon (formell versjonskjede, spec §Datamodell).
export async function completeTaskFileUpload(input: {
  taskId: string
  projectId: string
  key: string
  uploadId: string
  parts: { ETag: string; PartNumber: number }[]
  filename: string
  sizeBytes: number
  contentType?: string
  replacesFileId?: string
}): Promise<{ file: TaskVideoFile } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke autentisert' }

  const completeResult = await completeUpload({ key: input.key, uploadId: input.uploadId, parts: input.parts })
  if ('error' in completeResult) return completeResult

  const { data: maxOrder } = await supabase
    .from('task_video_files')
    .select('sort_order')
    .eq('task_id', input.taskId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const { data, error } = await supabase
    .from('task_video_files')
    .insert({
      task_id: input.taskId,
      filename: input.filename,
      r2_key: input.key,
      size_bytes: input.sizeBytes,
      content_type: input.contentType ?? null,
      uploaded_by: user.id,
      replaces_file_id: input.replacesFileId ?? null,
      sort_order: (maxOrder && maxOrder.length > 0 ? maxOrder[0].sort_order : 0) + 1,
    })
    .select()
    .single()

  if (error || !data) {
    console.error('[completeTaskFileUpload]', error)
    return { error: 'Kunne ikke lagre filen' }
  }

  revalidatePath(`/admin/postprod/${input.projectId}`)
  return { file: data as TaskVideoFile }
}

export async function listTaskVideoFiles(taskId: string): Promise<TaskVideoFile[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('task_video_files')
    .select('*')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[listTaskVideoFiles]', error)
    return []
  }
  return (data ?? []) as TaskVideoFile[]
}

// Presignet GET-URL for forhåndsvisning i selve steget — internt, admin-only,
// generalisert fra recordDownload()-mønsteret i transfers.ts til å ikke kreve
// en transfers-rad (tar r2_key direkte via task_video_files).
export async function getTaskVideoFileSignedUrl(fileId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: file } = await supabase
    .from('task_video_files')
    .select('r2_key')
    .eq('id', fileId)
    .maybeSingle()

  if (!file) return null

  try {
    return await getSignedUrl(r2, new GetObjectCommand({ Bucket: R2_BUCKET, Key: file.r2_key }), { expiresIn: SIGNED_URL_EXPIRY })
  } catch (err) {
    console.error('[getTaskVideoFileSignedUrl]', err)
    return null
  }
}

// Sender en opplastet fil til kunden for tidsankret kommentering på /v/[token] —
// gjenbruker video-review-systemet, bare med R2 som lagringskilde (spec
// §Send til kunde). Helt uavhengig av sendTaskFileToColleague under.
export async function sendTaskFileToCustomer(input: {
  fileId: string
  projectId: string
  title: string
}): Promise<{ ok: true; token: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke autentisert' }

  const { data: file, error } = await supabase
    .from('task_video_files')
    .select('id, r2_key')
    .eq('id', input.fileId)
    .single()

  if (error || !file) return { error: 'Fant ikke filen' }

  try {
    const review = await createVideoReview({
      projectId: input.projectId,
      title: input.title,
      storageProvider: 'r2',
      r2Key: file.r2_key,
      taskVideoFileId: file.id,
    })
    return { ok: true, token: review.token }
  } catch (err) {
    console.error('[sendTaskFileToCustomer]', err)
    return { error: 'Kunne ikke sende filen til kunden' }
  }
}

export async function getLatestVideoReviewForFile(fileId: string): Promise<{
  id: string
  token: string
  status: 'open' | 'submitted'
} | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('video_reviews')
    .select('id, token, status')
    .eq('task_video_file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[getLatestVideoReviewForFile]', error)
    return null
  }
  return data
}

export type TaskFileReview = {
  id: string
  status: 'pending' | 'approved' | 'changes_requested'
  comment: string | null
  reviewer_id: string
  requested_by: string
  created_at: string
}

// Intern kollega-godkjenning av en opplastet fil — samme mekanikk som
// requestGalleryReview() i lib/actions/gallery-reviews.ts (admin_tasks +
// waiting_review-status), men trigget fra task_video_files i stedet for et
// galleri. Skrevet som en egen funksjon fremfor å gjøre om den eksisterende,
// for å ikke røre den fungerende galleri-reviewflyten (spec §Send til kollega).
export async function requestTaskFileReview(
  fileId: string,
  reviewerId: string,
  dueDate?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: file, error: fileError } = await supabase
      .from('task_video_files')
      .select('id, task_id, filename')
      .eq('id', fileId)
      .single()

    if (fileError || !file) return { ok: false, error: 'Fant ikke filen' }

    const { data: task } = await supabase
      .from('tasks')
      .select('id, project_id, title')
      .eq('id', file.task_id)
      .single()

    let projectTitle: string | null = null
    if (task?.project_id) {
      const { data: project } = await supabase
        .from('projects')
        .select('title')
        .eq('id', task.project_id)
        .maybeSingle()
      projectTitle = project?.title ?? null
    }

    if (task) {
      await supabase
        .from('tasks')
        .update({ status: 'waiting_review', updated_at: new Date().toISOString() })
        .eq('id', task.id)
    }

    const { data: maxOrder } = await supabase
      .from('admin_tasks')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)

    const { data: adminTask, error: adminTaskError } = await supabase
      .from('admin_tasks')
      .insert({
        title: projectTitle ? `Gjennomgå ${file.filename} — ${projectTitle}` : `Gjennomgå ${file.filename}`,
        description: `Intern review av opplastet fil på steget "${task?.title ?? ''}". Åpne fra varselet i /admin/varsler.`,
        assignee_id: reviewerId,
        due_date: dueDate || null,
        sort_order: (maxOrder && maxOrder.length > 0 ? maxOrder[0].sort_order : 0) + 1,
        created_by: user.id,
        project_id: task?.project_id ?? null,
      })
      .select('id')
      .single()

    if (adminTaskError) console.error('requestTaskFileReview admin_task insert error:', adminTaskError)

    const { data: review, error: insertError } = await supabase
      .from('gallery_reviews')
      .insert({
        gallery_id: null,
        task_video_file_id: fileId,
        status: 'pending',
        requested_by: user.id,
        reviewer_id: reviewerId,
        admin_task_id: adminTask?.id ?? null,
        task_id: task?.id ?? null,
      })
      .select('id')
      .single()

    if (insertError || !review) {
      console.error('requestTaskFileReview insert error:', insertError)
      return { ok: false, error: 'Kunne ikke sende til review' }
    }

    await notifyAssignment({
      recipientId: reviewerId,
      type: 'gallery_review_requested',
      projectId: task?.project_id ?? null,
      galleryReviewId: review.id,
      preview: projectTitle
        ? `Ber deg gjennomgå "${file.filename}" for "${projectTitle}"`
        : `Ber deg gjennomgå "${file.filename}"`,
    })

    revalidatePath('/admin/internal')
    if (task?.project_id) revalidatePath(`/admin/postprod/${task.project_id}`)
    return { ok: true }
  } catch (err) {
    console.error('requestTaskFileReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function respondToTaskFileReview(
  reviewId: string,
  decision: 'approved' | 'changes_requested',
  comment?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: review, error: fetchError } = await supabase
      .from('gallery_reviews')
      .select('id, task_video_file_id, requested_by, reviewer_id, admin_task_id, task_id')
      .eq('id', reviewId)
      .single()

    if (fetchError || !review || !review.task_video_file_id) return { ok: false, error: 'Fant ikke review-forespørselen' }

    if (user.id !== review.reviewer_id) {
      return { ok: false, error: 'Du er ikke satt som reviewer for denne forespørselen' }
    }

    if (decision === 'changes_requested' && !comment?.trim()) {
      return { ok: false, error: 'Kommentar er påkrevd når du ber om endringer' }
    }

    const { error: updateError } = await supabase
      .from('gallery_reviews')
      .update({ status: decision, comment: comment?.trim() || null, responded_at: new Date().toISOString() })
      .eq('id', reviewId)

    if (updateError) {
      console.error('respondToTaskFileReview update error:', updateError)
      return { ok: false, error: 'Kunne ikke lagre svaret' }
    }

    if (review.admin_task_id) {
      await supabase.from('admin_tasks').update({ status: 'done', updated_at: new Date().toISOString() }).eq('id', review.admin_task_id)
    }

    if (review.task_id) {
      await supabase.from('tasks').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', review.task_id)
    }

    const { data: file } = await supabase
      .from('task_video_files')
      .select('task_id')
      .eq('id', review.task_video_file_id)
      .maybeSingle()

    let projectId: string | null = null
    if (file?.task_id) {
      const { data: task } = await supabase.from('tasks').select('project_id').eq('id', file.task_id).maybeSingle()
      projectId = task?.project_id ?? null
    }

    const preview = decision === 'approved'
      ? 'Godkjente filen'
      : `Ba om endringer på filen${comment ? `: ${comment}` : ''}`

    await notifyAssignment({
      recipientId: review.requested_by,
      type: 'gallery_review_responded',
      projectId,
      galleryReviewId: reviewId,
      preview,
    })

    revalidatePath('/admin/internal')
    if (projectId) revalidatePath(`/admin/postprod/${projectId}`)
    return { ok: true }
  } catch (err) {
    console.error('respondToTaskFileReview unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function getLatestTaskFileReview(fileId: string): Promise<TaskFileReview | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gallery_reviews')
    .select('id, status, comment, reviewer_id, requested_by, created_at')
    .eq('task_video_file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[getLatestTaskFileReview]', error)
    return null
  }
  return data as TaskFileReview | null
}

// For /admin/task-file-reviews/[reviewId] — henter alt reviewsiden trenger i ett kall.
export async function getTaskFileForInternalReview(reviewId: string): Promise<{
  review: TaskFileReview
  file: TaskVideoFile
  taskTitle: string
  projectTitle: string | null
  signedUrl: string
} | null> {
  const supabase = await createClient()
  const { data: reviewRow, error } = await supabase
    .from('gallery_reviews')
    .select('id, status, comment, reviewer_id, requested_by, created_at, task_video_file_id')
    .eq('id', reviewId)
    .maybeSingle()

  if (error || !reviewRow || !reviewRow.task_video_file_id) return null

  const { data: file } = await supabase
    .from('task_video_files')
    .select('*')
    .eq('id', reviewRow.task_video_file_id)
    .maybeSingle()

  if (!file) return null

  const { data: task } = await supabase
    .from('tasks')
    .select('title, project_id')
    .eq('id', file.task_id)
    .maybeSingle()

  let projectTitle: string | null = null
  if (task?.project_id) {
    const { data: project } = await supabase.from('projects').select('title').eq('id', task.project_id).maybeSingle()
    projectTitle = project?.title ?? null
  }

  const signedUrl = await getTaskVideoFileSignedUrl(file.id)
  if (!signedUrl) return null

  return {
    review: reviewRow as TaskFileReview,
    file: file as TaskVideoFile,
    taskTitle: task?.title ?? '',
    projectTitle,
    signedUrl,
  }
}
