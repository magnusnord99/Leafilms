'use server'

import { createClient } from '@/lib/supabase-server'
import type { QuoteBuilderData, ContractFormFields, OurSignature } from '@/lib/types'
import { calculateQuoteTotals } from '@/lib/quote-builder-utils'

// ---------------------------------------------------------------------------
// Intern hjelpefunksjon: erstatt {{variabel}}-plassholdere
// ---------------------------------------------------------------------------
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// ---------------------------------------------------------------------------
// Intern hjelpefunksjon: formater dato etter kontraktspråket (dag. måned år)
// ---------------------------------------------------------------------------
type ContractLang = 'no' | 'en'

function contractLocale(language: ContractLang): string {
  return language === 'en' ? 'en-GB' : 'nb-NO'
}

function formatContractDate(isoDate: string | null | undefined, language: ContractLang): string {
  if (!isoDate) return ''
  try {
    const date = new Date(isoDate)
    return date.toLocaleDateString(contractLocale(language), { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return isoDate
  }
}

// ---------------------------------------------------------------------------
// Intern hjelpefunksjon: foreslå produksjonsperiode ut fra opptaksdatoer
// ("juli 2026", eller "juli–august 2026" hvis start og slutt er ulike måneder)
// ---------------------------------------------------------------------------
function deriveProduksjonsPeriode(shootStart?: string | null, shootEnd?: string | null, language: ContractLang = 'no'): string {
  if (!shootStart) return ''
  try {
    const locale = contractLocale(language)
    const start = new Date(shootStart)
    const end = shootEnd ? new Date(shootEnd) : start
    const startLabel = start.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    const endLabel = end.toLocaleDateString(locale, { month: 'long', year: 'numeric' })
    if (startLabel === endLabel) return startLabel
    return `${start.toLocaleDateString(locale, { month: 'long' })}–${endLabel}`
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// Intern hjelpefunksjon: hent mal, auto-variabler og skjema-default-verdier
// for et prosjekt. Delt mellom getProjectContractData og generateContractText.
// ---------------------------------------------------------------------------
async function buildContractContext(projectId: string) {
  const supabase = await createClient()

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*, customers(*)')
    .eq('id', projectId)
    .single()

  if (projectError) {
    console.error('buildContractContext project error:', projectError)
    throw new Error('Fant ikke prosjekt')
  }

  const { data: quote } = await supabase
    .from('quotes')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: contract } = await supabase
    .from('contracts')
    .select('*')
    .eq('project_id', projectId)
    .single()

  // Mal velges etter prosjektspråket — finnes ingen engelsk mal ennå, faller vi
  // tilbake til den norske i stedet for å generere en tom kontrakt.
  const lang: ContractLang = (project as { language?: string }).language === 'en' ? 'en' : 'no'

  const { data: templateRows } = await supabase
    .from('contract_templates')
    .select('content')
    .eq('language', lang)
    .order('updated_at', { ascending: false })
    .limit(1)
  let template = templateRows?.[0]?.content ?? ''

  if (!template && lang === 'en') {
    const { data: fallbackRows } = await supabase
      .from('contract_templates')
      .select('content')
      .eq('language', 'no')
      .order('updated_at', { ascending: false })
      .limit(1)
    template = fallbackRows?.[0]?.content ?? ''
  }

  const customer = (project as unknown as { customers?: { name: string | null; company: string | null; org_nummer: string | null } | null }).customers ?? null
  const proj = project as unknown as { shoot_start?: string | null; shoot_end?: string | null; delivery_description?: string | null }

  let totalprisStr = '___'
  if (quote?.quote_data) {
    try {
      const qd = quote.quote_data as QuoteBuilderData
      const total = Math.round(calculateQuoteTotals(qd).afterDiscount)
      totalprisStr = total.toLocaleString('nb-NO') + ',-'
    } catch (e) {
      console.error('Feil ved beregning av totalpris:', e)
    }
  }

  const shootStart = proj.shoot_start ?? null
  const shootEnd = proj.shoot_end ?? null
  const oppstartDato = formatContractDate(shootStart, lang)
  const opptakDatoer =
    shootStart && shootEnd
      ? `${formatContractDate(shootStart, lang)} – ${formatContractDate(shootEnd, lang)}`
      : oppstartDato

  const autoVars = {
    bedrift: customer?.company || customer?.name || '',
    kunde_kontakt: customer?.name || '',
    oppstart_dato: oppstartDato,
    opptak_datoer: opptakDatoer,
    leveranse: proj.delivery_description || '___',
    totalpris: totalprisStr,
  }

  const savedFields = (contract?.form_fields ?? null) as ContractFormFields | null

  const formDefaults = {
    orgNummer: savedFields?.orgNummerOverride ?? customer?.org_nummer ?? '',
    produksjonsPeriode: savedFields?.produksjonsPeriode ?? deriveProduksjonsPeriode(shootStart, shootEnd, lang),
    signeringsSted: savedFields?.signeringsSted ?? 'Asker',
    signeringsDato: savedFields?.signeringsDato ?? new Date().toISOString().split('T')[0],
    bedrift: savedFields?.bedriftOverride ?? autoVars.bedrift,
    kundeKontakt: savedFields?.kundeKontaktOverride ?? autoVars.kunde_kontakt,
    oppstartDato: savedFields?.oppstartDatoOverride ?? autoVars.oppstart_dato,
    opptakDatoer: savedFields?.opptakDatoerOverride ?? autoVars.opptak_datoer,
    leveranse: savedFields?.leveranseOverride ?? autoVars.leveranse,
    totalpris: savedFields?.totalprisOverride ?? autoVars.totalpris,
  }

  return { template, autoVars, formDefaults, contract, lang }
}

// ---------------------------------------------------------------------------
// Hent global mal (én per språk — norsk er default)
// ---------------------------------------------------------------------------
export async function getContractTemplate(language: 'no' | 'en' = 'no'): Promise<string> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('contract_templates')
    .select('content')
    .eq('language', language)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) {
    console.error('getContractTemplate error:', error)
    return ''
  }

  return data?.[0]?.content ?? ''
}

// ---------------------------------------------------------------------------
// Lagre global mal (én per språk)
// ---------------------------------------------------------------------------
export async function saveContractTemplate(content: string, language: 'no' | 'en' = 'no'): Promise<void> {
  const supabase = await createClient()

  // Sjekk om det finnes en rad for språket
  const { data: existingRows } = await supabase
    .from('contract_templates')
    .select('id')
    .eq('language', language)
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
      .insert({ content, language })

    if (error) {
      console.error('saveContractTemplate insert error:', error)
      throw new Error('Kunne ikke opprette mal')
    }
  }
}

// ---------------------------------------------------------------------------
// Hent kontraktdata for prosjekt: lagret tekst (hvis noen) + auto-variabler
// og skjema-default-verdier til det nye kontraktskjemaet.
// ---------------------------------------------------------------------------
export async function getProjectContractData(projectId: string): Promise<{
  contractText: string
  hasContractText: boolean
  isPublished: boolean
  contractId: string | null
  pdfUrl: string | null
  signature: {
    signerName: string
    signerEmail: string
    signedAt: string
  } | null
  autoVars: {
    bedrift: string
    kunde_kontakt: string
    oppstart_dato: string
    opptak_datoer: string
    leveranse: string
    totalpris: string
  }
  formDefaults: {
    orgNummer: string
    produksjonsPeriode: string
    signeringsSted: string
    signeringsDato: string
    bedrift: string
    kundeKontakt: string
    oppstartDato: string
    opptakDatoer: string
    leveranse: string
    totalpris: string
  }
  ourSignature: OurSignature | null
  mySignatureImage: string | null
  myName: string
}> {
  const { autoVars, formDefaults, contract } = await buildContractContext(projectId)

  const signature =
    contract?.status === 'signed' && contract.signature_data
      ? {
          signerName: contract.signature_data.signerName ?? '',
          signerEmail: contract.signed_by ?? '',
          signedAt: contract.signed_at ?? '',
        }
      : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let mySignatureImage: string | null = null
  let myName = ''
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, signature_image')
      .eq('id', user.id)
      .single()
    mySignatureImage = profile?.signature_image ?? null
    myName = profile?.name ?? user.email ?? ''
  }

  return {
    contractText: contract?.contract_text ?? '',
    hasContractText: !!contract?.contract_text,
    isPublished: !!contract?.published_at,
    contractId: contract?.id ?? null,
    pdfUrl: contract?.pdf_url ?? null,
    signature,
    autoVars,
    formDefaults,
    ourSignature: (contract?.our_signature ?? null) as OurSignature | null,
    mySignatureImage,
    myName,
  }
}

// ---------------------------------------------------------------------------
// Generer kontraktteksten fra mal + auto-variabler + skjemaverdier.
// Ren beregning — lagrer ingenting (det gjør publishContract).
// ---------------------------------------------------------------------------
export async function generateContractText(projectId: string, formFields: ContractFormFields): Promise<string> {
  const { template, autoVars, lang } = await buildContractContext(projectId)

  const vars: Record<string, string> = {
    ...autoVars,
    bedrift: formFields.bedriftOverride ?? autoVars.bedrift,
    kunde_kontakt: formFields.kundeKontaktOverride ?? autoVars.kunde_kontakt,
    oppstart_dato: formFields.oppstartDatoOverride ?? autoVars.oppstart_dato,
    opptak_datoer: formFields.opptakDatoerOverride ?? autoVars.opptak_datoer,
    leveranse: formFields.leveranseOverride ?? autoVars.leveranse,
    totalpris: formFields.totalprisOverride ?? autoVars.totalpris,
    org_nummer: formFields.orgNummerOverride ?? '',
    produksjons_periode: formFields.produksjonsPeriode ?? '',
    signerings_sted: formFields.signeringsSted ?? '',
    signerings_dato: formFields.signeringsDato ? formatContractDate(formFields.signeringsDato, lang) : '',
  }

  return fillTemplate(template, vars)
}

// ---------------------------------------------------------------------------
// Publiser kontrakt for prosjekt (opprett eller oppdater)
// ---------------------------------------------------------------------------
export async function publishContract(
  projectId: string,
  contractText: string,
  formFields?: ContractFormFields,
  newSignature?: { signatureImage: string; saveToProfile: boolean }
): Promise<void> {
  const supabase = await createClient()

  // Hent gjeldende quote_id
  const { data: quote } = await supabase
    .from('quotes')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const quoteId = quote?.id ?? null
  const publishedAt = new Date().toISOString()

  // Bygg vår signatur hvis dette er første gang kontrakten signeres internt
  let ourSignaturePayload: OurSignature | null = null
  if (newSignature) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
      const signerName = profile?.name ?? user.email ?? 'Leafilms'
      if (newSignature.saveToProfile) {
        await supabase.from('profiles').update({ signature_image: newSignature.signatureImage }).eq('id', user.id)
      }
      ourSignaturePayload = {
        profileId: user.id,
        signerName,
        signatureImage: newSignature.signatureImage,
        signedAt: publishedAt,
      }
    }
  }

  // Sjekk om kontrakt allerede eksisterer
  const { data: existing } = await supabase
    .from('contracts')
    .select('id, our_signature')
    .eq('project_id', projectId)
    .single()

  if (existing?.id) {
    const { error } = await supabase
      .from('contracts')
      .update({
        contract_text: contractText,
        form_fields: formFields ?? null,
        our_signature: existing.our_signature ?? ourSignaturePayload ?? null,
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
        form_fields: formFields ?? null,
        our_signature: ourSignaturePayload,
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
// Angre signering — åpner en signert kontrakt for redigering igjen (f.eks. hvis
// tilbudet/kontrakten må endres og kunden skal signere på nytt). Signatur, tidsstempel,
// og tidligere generert PDF beholdes som historikk til kontrakten faktisk signeres på
// nytt (da overskriver sign-flyten dem naturlig) — vi nullstiller kun status, slik at
// admin-UI-et åpner for redigering igjen og kunden ser signeringsskjemaet på nytt.
export async function unsignContract(projectId: string): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('contracts')
    .update({ status: 'sent', updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('status', 'signed')

  if (error) {
    console.error('unsignContract error:', error)
    throw new Error('Kunne ikke angre signeringen')
  }

  // Speiler oppdateringen sign-flyten gjør motsatt vei (app/api/contracts/sign/route.ts) —
  // uten dette blir tilbudet stående som "akseptert" i prosjektoversikten selv om
  // signeringen er nullstilt.
  const { error: quoteError } = await supabase
    .from('quotes')
    .update({ status: 'sent', accepted_at: null, accepted_by: null, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .eq('is_current', true)
    .eq('status', 'accepted')

  if (quoteError) {
    console.error('unsignContract quote reset error:', quoteError)
    throw new Error('Kunne ikke angre signeringen')
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
