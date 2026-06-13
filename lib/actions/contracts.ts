'use server'

import { createClient } from '@/lib/supabase-server'
import type { QuoteBuilderData } from '@/lib/types'

// ---------------------------------------------------------------------------
// Intern hjelpefunksjon: erstatt {{variabel}}-plassholdere
// ---------------------------------------------------------------------------
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// ---------------------------------------------------------------------------
// Intern hjelpefunksjon: beregn totalpris fra QuoteBuilderData
// ---------------------------------------------------------------------------
function calcTotalPrice(quoteData: QuoteBuilderData): number {
  let total = 0

  // Startup crew
  for (const m of quoteData.startupCrew ?? []) {
    total += (m.dailyRate ?? 0) * (m.days ?? 0)
  }

  // Shoot crew
  for (const m of quoteData.crew ?? []) {
    total += (m.dailyRate ?? 0) * (m.days ?? 0)
  }

  // Post-production crew
  for (const m of quoteData.postProductionCrew ?? []) {
    total += (m.dailyRate ?? 0) * (m.days ?? 0)
  }

  // Line-item lists
  const itemLists = [
    quoteData.equipment ?? [],
    quoteData.postProduction ?? [],
    quoteData.otherCosts ?? [],
    quoteData.licensing ?? [],
  ]
  for (const list of itemLists) {
    for (const item of list) {
      total += (item.quantity ?? 0) * (item.unitPrice ?? 0)
    }
  }

  // Rabatt
  const discount = quoteData.discountPercentage ?? 0
  if (discount > 0) {
    total = total * (1 - discount / 100)
  }

  return Math.round(total)
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
    .single()

  if (error) {
    console.error('getContractTemplate error:', error)
    return ''
  }

  return data?.content ?? ''
}

// ---------------------------------------------------------------------------
// Lagre global mal
// ---------------------------------------------------------------------------
export async function saveContractTemplate(content: string): Promise<void> {
  const supabase = await createClient()

  // Sjekk om det finnes en rad
  const { data: existing } = await supabase
    .from('contract_templates')
    .select('id')
    .single()

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
      signature,
    }
  }

  // Auto-fyll fra mal
  const { data: templateData } = await supabase
    .from('contract_templates')
    .select('content')
    .single()

  const template = templateData?.content ?? ''

  const customer = (project as unknown as { customers?: { name: string | null; company: string | null } | null }).customers ?? null

  // Beregn totalpris
  let totalprIsStr = '___'
  if (quote?.quote_data) {
    try {
      const qd = quote.quote_data as QuoteBuilderData
      const total = calcTotalPrice(qd)
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
