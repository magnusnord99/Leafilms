'use server'

import { createClient } from '@/lib/supabase-server'
import type { QuoteBuilderData } from '@/lib/types'
import { calculateQuoteTotals } from '@/lib/quote-builder-utils'

// ---------------------------------------------------------------------------
// Intern hjelpefunksjon: erstatt {{variabel}}-plassholdere
// ---------------------------------------------------------------------------
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// ---------------------------------------------------------------------------
// Intern hjelpefunksjon: formater dato til norsk format (dag. måned år)
// ---------------------------------------------------------------------------
function formatNorwegianDate(isoDate: string | null | undefined): string {
  if (!isoDate) return ''
  try {
    const date = new Date(isoDate)
    return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return isoDate
  }
}

// ---------------------------------------------------------------------------
// Hent global mal
// ---------------------------------------------------------------------------
export async function getContractTemplate(): Promise<string> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('contract_templates')
    .select('content')
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('getContractTemplate error:', error)
    return ''
  }

  return data?.[0]?.content ?? ''
}

// ---------------------------------------------------------------------------
// Lagre global mal
// ---------------------------------------------------------------------------
export async function saveContractTemplate(content: string): Promise<void> {
  const supabase = await createClient()

  // Sjekk om det finnes en rad
  const { data: existingRows } = await supabase
    .from('contract_templates')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
  const existing = existingRows?.[0] ?? null

  if (existing?.id) {
    const { error } = await supabase
      .from('contract_templates')
      .update({ content, updated_at: new Date().toISOString() })
      .eq('id', existing.id)

    if (error) {
      console.error('saveContractTemplate update error:', error)
      throw new Error('Kunne ikke lagre mal')
    }
  } else {
    const { error } = await supabase
      .from('contract_templates')
      .insert({ content })

    if (error) {
      console.error('saveContractTemplate insert error:', error)
      throw new Error('Kunne ikke opprette mal')
    }
  }
}

// ---------------------------------------------------------------------------
// Hent kontraktdata for prosjekt (auto-fyller variabler)
// ---------------------------------------------------------------------------
export async function getProjectContractData(projectId: string): Promise<{
  contractText: string
  isPublished: boolean
  contractId: string | null
  pdfUrl: string | null
  signature: {
    signerName: string
    signerEmail: string
    signedAt: string
  } | null
}> {
  const supabase = await createClient()

  // Hent prosjekt med kunde
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*, customers(*)')
    .eq('id', projectId)
    .single()

  if (projectError) {
    console.error('getProjectContractData project error:', projectError)
    throw new Error('Fant ikke prosjekt')
  }

  // Hent quote
  const { data: quote } = await supabase
    .from('quotes')
    .select('*')
    .eq('project_id', projectId)
    .single()

  // Hent kontrakt
  const { data: contract } = await supabase
    .from('contracts')
    .select('*')
    .eq('project_id', projectId)
    .single()

  // Returner lagret tekst hvis kontrakt allerede har contract_text
  if (contract?.contract_text) {
    const signature =
      contract.status === 'signed' && contract.signature_data
        ? {
            signerName: contract.signature_data.signerName ?? '',
            signerEmail: contract.signed_by ?? '',
            signedAt: contract.signed_at ?? '',
          }
        : null

    return {
      contractText: contract.contract_text,
      isPublished: !!contract.published_at,
      contractId: contract.id,
      pdfUrl: contract.pdf_url ?? null,
      signature,
    }
  }

  // Auto-fyll fra mal
  const { data: templateRows } = await supabase
    .from('contract_templates')
    .select('content')
    .order('updated_at', { ascending: false })
    .limit(1)

  const template = templateRows?.[0]?.content ?? ''

  const customer = (project as unknown as { customers?: { name: string | null; company: string | null } | null }).customers ?? null

  // Beregn totalpris
  let totalprIsStr = '___'
  if (quote?.quote_data) {
    try {
      const qd = quote.quote_data as QuoteBuilderData
      const total = Math.round(calculateQuoteTotals(qd).afterDiscount)
      totalprIsStr = total.toLocaleString('nb-NO') + ',-'
    } catch (e) {
      console.error('Feil ved beregning av totalpris:', e)
    }
  }

  // Formater datoer
  const proj = project as unknown as { shoot_start?: string | null; shoot_end?: string | null; delivery_description?: string | null }
  const shootStart = proj.shoot_start ?? null
  const shootEnd = proj.shoot_end ?? null
  const oppstartDato = formatNorwegianDate(shootStart)
  const opptakDatoer =
    shootStart && shootEnd
      ? `${formatNorwegianDate(shootStart)} – ${formatNorwegianDate(shootEnd)}`
      : oppstartDato

  const vars: Record<string, string> = {
    bedrift: customer?.company || customer?.name || '',
    kunde_kontakt: customer?.name || '',
    oppstart_dato: oppstartDato,
    opptak_datoer: opptakDatoer,
    leveranse: proj.delivery_description || '___',
    totalpris: totalprIsStr,
    signerings_dato: formatNorwegianDate(new Date().toISOString()),
    signerings_sted: 'Asker',
    org_nummer: '',
    produksjons_periode: '',
  }

  const contractText = fillTemplate(template, vars)

  const signature =
    contract?.status === 'signed' && contract.signature_data
      ? {
          signerName: contract.signature_data.signerName ?? '',
          signerEmail: contract.signed_by ?? '',
          signedAt: contract.signed_at ?? '',
        }
      : null

  return {
    contractText,
    isPublished: !!contract?.published_at,
    contractId: contract?.id ?? null,
    pdfUrl: contract?.pdf_url ?? null,
    signature,
  }
}

// ---------------------------------------------------------------------------
// Publiser kontrakt for prosjekt (opprett eller oppdater)
// ---------------------------------------------------------------------------
export async function publishContract(projectId: string, contractText: string): Promise<void> {
  const supabase = await createClient()

  // Hent quote_id
  const { data: quote } = await supabase
    .from('quotes')
    .select('id')
    .eq('project_id', projectId)
    .single()

  const quoteId = quote?.id ?? null
  const publishedAt = new Date().toISOString()

  // Sjekk om kontrakt allerede eksisterer
  const { data: existing } = await supabase
    .from('contracts')
    .select('id')
    .eq('project_id', projectId)
    .single()

  if (existing?.id) {
    const { error } = await supabase
      .from('contracts')
      .update({
        contract_text: contractText,
        published_at: publishedAt,
        updated_at: publishedAt,
      })
      .eq('id', existing.id)

    if (error) {
      console.error('publishContract update error:', error)
      throw new Error('Kunne ikke oppdatere kontrakt')
    }
  } else {
    const { error } = await supabase
      .from('contracts')
      .insert({
        project_id: projectId,
        quote_id: quoteId,
        contract_text: contractText,
        published_at: publishedAt,
        status: 'sent',
      })

    if (error) {
      console.error('publishContract insert error:', error)
      throw new Error('Kunne ikke opprette kontrakt')
    }
  }
}

// ---------------------------------------------------------------------------
// Fjern publisering av kontrakt (tilbakestill til utkast)
// ---------------------------------------------------------------------------
export async function unpublishContract(projectId: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('contracts')
    .update({ published_at: null, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .neq('status', 'signed') // aldri fjern en allerede signert kontrakt

  if (error) {
    console.error('unpublishContract error:', error)
    throw new Error('Kunne ikke fjerne kontrakten')
  }
}

// ---------------------------------------------------------------------------
// Skjul/vis kontraktseksjonen på den offentlige pitchen (uavhengig av published_at)
// ---------------------------------------------------------------------------
export async function setContractHiddenFromPitch(projectId: string, hidden: boolean): Promise<void> {
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('pipeline_data')
    .eq('id', projectId)
    .single()

  const existingPipelineData = (project?.pipeline_data as Record<string, unknown>) ?? {}

  const { error } = await supabase
    .from('projects')
    .update({
      pipeline_data: { ...existingPipelineData, contract_hidden_from_pitch: hidden },
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)

  if (error) {
    console.error('setContractHiddenFromPitch error:', error)
    throw new Error('Kunne ikke oppdatere synlighet for kontrakten')
  }
}
