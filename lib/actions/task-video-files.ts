'use server'

import { randomBytes } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { r2, R2_BUCKET } from '@/lib/r2'
import { CreateMultipartUploadCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { completeUpload } from '@/lib/actions/transfers'

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
