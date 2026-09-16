'use server'

import { createClient } from '@/lib/supabase-server'
import { randomBytes } from 'crypto'
import { r2, R2_BUCKET } from '@/lib/r2'
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// Under denne størrelsen (og for siste del av enhver opplasting) godtar R2/S3
// hvilken som helst delstørrelse — 25 MB gir et jevnt antall presigned URLer
// uten å bli unødvendig mange for de aller største filene.
// (Ikke exportert: "use server"-filer kan kun eksportere async-funksjoner —
// klienten får verdien via initiateUpload()'s returverdi i stedet.)
const UPLOAD_PART_SIZE = 25 * 1024 * 1024

export type ProjectForTransfer = {
  id: string
  title: string
  language: 'no' | 'en'
  customer: {
    id: string
    name: string
    company: string | null
    email: string | null
    logo_path: string | null
  } | null
  deliverables: Array<{
    name?: string
    quantity?: number | null
    format?: string
    description?: string
  }>
}

// Henter prosjekt + kunde + leveranseinfo for pre-utfylling av leveringssiden
export async function getProjectForTransfer(projectId: string): Promise<ProjectForTransfer | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: project } = await supabase
    .from('projects')
    .select(`
      id, title, language, deliverables,
      customers (id, name, company, email, logo_path)
    `)
    .eq('id', projectId)
    .single()

  if (!project) return null

  const deliverables = (project as { deliverables?: ProjectForTransfer['deliverables'] }).deliverables ?? []

  const customer = Array.isArray(project.customers)
    ? project.customers[0] ?? null
    : (project.customers as ProjectForTransfer['customer'] | null)

  return {
    id: project.id,
    title: project.title,
    language: (project as { language?: string }).language === 'en' ? 'en' : 'no',
    customer: customer ? {
      id: customer.id,
      name: customer.name,
      company: customer.company ?? null,
      email: customer.email ?? null,
      logo_path: customer.logo_path ?? null,
    } : null,
    deliverables,
  }
}

export type Transfer = {
  id: string
  created_by: string | null
  r2_key: string
  filename: string
  filesize_bytes: number
  content_type: string | null
  title: string | null
  message: string | null
  password_hash: string | null
  expires_at: string | null
  max_downloads: number | null
  download_count: number
  status: 'active' | 'expired' | 'deleted'
  language: 'no' | 'en'
  customer_id: string | null
  background_image_path: string | null
  created_at: string
  updated_at: string
  // joined
  links?: TransferLink[]
  customer?: { logo_path: string | null } | null
}

export type TransferLink = {
  id: string
  transfer_id: string
  token: string
  recipient_email: string | null
  recipient_name: string | null
  created_at: string
}

export type TransferWithLink = Transfer & {
  primary_link: TransferLink | null
}

export type CreateTransferInput = {
  filename: string
  filesize_bytes: number
  content_type?: string
  title?: string
  message?: string
  expires_in_days?: number
  max_downloads?: number
  recipient_email?: string
  recipient_name?: string
  language?: 'no' | 'en'
  // Må være satt til en fullført R2-nøkkel fra completeUpload() før kall
  r2_key?: string
  customer_id?: string
  // Sti i "assets"-bucketen (ikke R2) — kundelogo/leveransebilde er ikke
  // like sensitivt som selve leveransefilen og trenger ikke presigned URL
  background_image_path?: string
}

// Henter alle leveranser for admin-oversikten
export async function getTransfers(): Promise<TransferWithLink[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('transfers')
    .select(`
      *,
      links:transfer_links(*)
    `)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getTransfers]', error)
    return []
  }

  return (data || []).map(t => ({
    ...t,
    primary_link: t.links?.[0] ?? null,
  }))
}

// Henter én leveranse med token-validering (for kundesiden)
export async function getTransferByToken(token: string): Promise<{
  transfer: Transfer
  link: TransferLink
} | null> {
  const supabase = await createClient()

  const { data: link, error: linkError } = await supabase
    .from('transfer_links')
    .select('*, transfer:transfers(*, customer:customers(logo_path))')
    .eq('token', token)
    .single()

  if (linkError || !link) return null

  const transfer = link.transfer as Transfer
  if (!transfer || transfer.status === 'deleted') return null

  // Sjekk utløp
  if (transfer.expires_at && new Date(transfer.expires_at) < new Date()) {
    return null
  }

  // Sjekk max nedlastinger
  if (transfer.max_downloads != null && transfer.download_count >= transfer.max_downloads) {
    return null
  }

  return { transfer, link: link as TransferLink }
}

// Starter en multipart-opplasting til R2 og returnerer det som trengs for at
// klienten skal kunne laste opp delene direkte (uten å gå via Next.js-serveren
// — nødvendig for filer i GB/TB-klassen).
export async function initiateUpload(input: { filename: string; contentType?: string }): Promise<
  { key: string; uploadId: string; partSize: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke autentisert' }

  const key = `transfers/${randomBytes(16).toString('hex')}/${input.filename}`

  try {
    const { UploadId } = await r2.send(new CreateMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: input.contentType || undefined,
    }))
    if (!UploadId) return { error: 'R2 returnerte ingen upload-ID' }
    return { key, uploadId: UploadId, partSize: UPLOAD_PART_SIZE }
  } catch (err) {
    console.error('[initiateUpload]', err)
    return { error: 'Kunne ikke starte opplasting til R2' }
  }
}

// Genererer en presigned URL for én enkelt del av en multipart-opplasting.
// Klienten PUT-er filbiten direkte til denne URL-en.
export async function getUploadPartUrl(input: { key: string; uploadId: string; partNumber: number }): Promise<
  { url: string } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke autentisert' }

  try {
    const url = await getSignedUrl(r2, new UploadPartCommand({
      Bucket: R2_BUCKET,
      Key: input.key,
      UploadId: input.uploadId,
      PartNumber: input.partNumber,
    }), { expiresIn: 3600 })
    return { url }
  } catch (err) {
    console.error('[getUploadPartUrl]', err)
    return { error: 'Kunne ikke generere opplastings-URL' }
  }
}

// Fullfører multipart-opplastingen etter at alle delene er PUT-et til R2.
export async function completeUpload(input: {
  key: string
  uploadId: string
  parts: { ETag: string; PartNumber: number }[]
}): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke autentisert' }

  try {
    await r2.send(new CompleteMultipartUploadCommand({
      Bucket: R2_BUCKET,
      Key: input.key,
      UploadId: input.uploadId,
      MultipartUpload: { Parts: input.parts },
    }))
    return { ok: true }
  } catch (err) {
    console.error('[completeUpload]', err)
    return { error: 'Kunne ikke fullføre opplastingen' }
  }
}

// Rydder opp i R2 hvis opplastingen avbrytes eller feiler underveis.
export async function abortUpload(input: { key: string; uploadId: string }): Promise<void> {
  try {
    await r2.send(new AbortMultipartUploadCommand({ Bucket: R2_BUCKET, Key: input.key, UploadId: input.uploadId }))
  } catch (err) {
    console.error('[abortUpload]', err)
  }
}

// Oppretter en ny leveranse. Kalles ETTER at filen allerede er ferdig lastet
// opp til R2 (input.r2_key peker på et fullført objekt) — se initiateUpload/
// completeUpload over.
export async function createTransfer(input: CreateTransferInput): Promise<{
  transfer: Transfer
  link: TransferLink
  downloadUrl: string
} | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke autentisert' }

  if (!input.r2_key) return { error: 'Mangler r2_key — filen må lastes opp før leveransen opprettes' }
  const r2Key = input.r2_key

  const expiresAt = input.expires_in_days
    ? new Date(Date.now() + input.expires_in_days * 24 * 60 * 60 * 1000).toISOString()
    : null

  const { data: transfer, error: tError } = await supabase
    .from('transfers')
    .insert({
      created_by: user.id,
      r2_key: r2Key,
      filename: input.filename,
      filesize_bytes: input.filesize_bytes,
      content_type: input.content_type ?? null,
      title: input.title ?? null,
      message: input.message ?? null,
      expires_at: expiresAt,
      max_downloads: input.max_downloads ?? null,
      language: input.language ?? 'no',
      customer_id: input.customer_id ?? null,
      background_image_path: input.background_image_path ?? null,
    })
    .select()
    .single()

  if (tError || !transfer) {
    console.error('[createTransfer]', tError)
    return { error: tError?.message ?? 'Kunne ikke opprette leveranse' }
  }

  const token = randomBytes(32).toString('hex')

  const { data: link, error: lError } = await supabase
    .from('transfer_links')
    .insert({
      transfer_id: transfer.id,
      token,
      recipient_email: input.recipient_email ?? null,
      recipient_name: input.recipient_name ?? null,
    })
    .select()
    .single()

  if (lError || !link) {
    console.error('[createTransfer link]', lError)
    return { error: lError?.message ?? 'Kunne ikke opprette lenke' }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://leafilms.no'
  const downloadUrl = `${siteUrl}/d/${token}`

  return { transfer: transfer as Transfer, link: link as TransferLink, downloadUrl }
}

// Registrerer en nedlasting og returnerer en presigned R2-URL gyldig i 1 time
export async function recordDownload(token: string): Promise<{
  downloadUrl: string
  filename: string
} | { error: string }> {
  const result = await getTransferByToken(token)
  if (!result) return { error: 'Leveransen finnes ikke eller er utløpt' }

  const supabase = await createClient()

  await supabase
    .from('transfers')
    .update({ download_count: result.transfer.download_count + 1 })
    .eq('id', result.transfer.id)

  try {
    const downloadUrl = await getSignedUrl(r2, new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: result.transfer.r2_key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(result.transfer.filename)}"`,
    }), { expiresIn: 3600 })

    return { downloadUrl, filename: result.transfer.filename }
  } catch (err) {
    console.error('[recordDownload]', err)
    return { error: 'Kunne ikke generere nedlastingslenke' }
  }
}

// Sletter en leveranse (soft delete)
export async function deleteTransfer(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke autentisert' }

  const { error } = await supabase
    .from('transfers')
    .update({ status: 'deleted' })
    .eq('id', id)

  if (error) return { error: error.message }
  return {}
}

