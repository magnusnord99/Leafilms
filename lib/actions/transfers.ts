'use server'

import { createClient } from '@/lib/supabase-server'
import { randomBytes } from 'crypto'

export type ProjectForTransfer = {
  id: string
  title: string
  customer: {
    name: string
    company: string | null
    email: string | null
  } | null
  deliverables: Array<{
    title?: string
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
      id, title,
      customers (id, name, company, email)
    `)
    .eq('id', projectId)
    .single()

  if (!project) return null

  // Hent leveranseliste fra sections (type = deliverables)
  const { data: section } = await supabase
    .from('sections')
    .select('content')
    .eq('project_id', projectId)
    .eq('type', 'deliverables')
    .maybeSingle()

  type DeliverableContent = { deliverableItems?: ProjectForTransfer['deliverables'] }
  const deliverables = (section?.content as DeliverableContent | null)?.deliverableItems ?? []

  const customer = Array.isArray(project.customers)
    ? project.customers[0] ?? null
    : (project.customers as ProjectForTransfer['customer'] | null)

  return {
    id: project.id,
    title: project.title,
    customer: customer ? {
      name: customer.name,
      company: customer.company ?? null,
      email: customer.email ?? null,
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
  created_at: string
  updated_at: string
  // joined
  links?: TransferLink[]
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
  // r2_key fylles inn etter opplasting — kan settes som placeholder
  r2_key?: string
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
    .select('*, transfer:transfers(*)')
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

// Oppretter en ny leveranse (uten R2-integrasjon ennå — r2_key settes til placeholder)
export async function createTransfer(input: CreateTransferInput): Promise<{
  transfer: Transfer
  link: TransferLink
  downloadUrl: string
} | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke autentisert' }

  const r2Key = input.r2_key || `transfers/${randomBytes(16).toString('hex')}/${input.filename}`

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

// Registrerer en nedlasting og returnerer presigned URL (stub — R2 ikke koblet til ennå)
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

  // TODO: Generer presigned R2 download-URL her
  // const url = await getSignedUrl(r2Client, new GetObjectCommand({
  //   Bucket: process.env.R2_BUCKET_NAME,
  //   Key: result.transfer.r2_key,
  // }), { expiresIn: 3600 })

  return {
    downloadUrl: '#', // erstattes med ekte R2 presigned URL
    filename: result.transfer.filename,
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

