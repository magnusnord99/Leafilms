'use server'

import { createClient } from '@/lib/supabase-server'
import type { QuoteBuilderData, ContractFormFields, OurSignature } from '@/lib/types'
import { calculateQuoteTotals, addonTotalPrice } from '@/lib/quote-builder-utils'
import { combinedDeliveryText } from '@/lib/delivery-format'

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
function reiseDekkesAvLabel(who: 'oppdragsgiver' | 'oppdragstaker', language: ContractLang): string {
  if (language === 'en') return who === 'oppdragstaker' ? 'The Contractor' : 'The Client'
  return who === 'oppdragstaker' ? 'Oppdragstaker' : 'Oppdragsgiver'
}

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
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

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
  const proj = project as unknown as {
    shoot_start?: string | null
    shoot_end?: string | null
    delivery_description?: string | null
    delivery_video?: string | null
    delivery_photo?: string | null
  }

  let totalprisStr = '___'
  let antallCrewStr = '___'
  if (quote?.quote_data) {
    try {
      const qd = quote.quote_data as QuoteBuilderData
      const selectedAddonIds = (quote as { selected_addon_ids?: string[] }).selected_addon_ids ?? []
      const total = Math.round(calculateQuoteTotals(qd, selectedAddonIds).afterDiscount)
      totalprisStr = total.toLocaleString('nb-NO') + ',-'
      // Antall personer på opptak (crew som faktisk reiser til produksjonen) — ikke
      // post-produksjonscrew, som normalt jobber eksternt/hjemmefra.
      if (qd.crew?.length) antallCrewStr = String(qd.crew.length)
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
    leveranse: combinedDeliveryText(proj, lang) || '___',
    totalpris: totalprisStr,
    antall_crew: antallCrewStr,
  }

  const savedFields = (contract?.form_fields ?? null) as ContractFormFields | null

  // totalpris/antallCrew er utledet fra tilbudet som var gjeldende sist kontrakten ble
  // lagret (contract.quote_id). Hvis et annet tilbud er blitt gjeldende siden (ny
  // tilbudsversjon akseptert/valgt, eller en ny kontraktversjon forgrenet fra en gammel),
  // er den lagrede overrideen fra det gamle tilbudet og skal ignoreres — ellers fortsetter
  // kontrakten å vise summen fra et utdatert tilbud (feedback 3ca4c71b).
  const contractQuoteId = (contract as { quote_id?: string | null } | null)?.quote_id ?? null
  const quoteChanged = contractQuoteId !== null && contractQuoteId !== (quote?.id ?? null)

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
    totalpris: (quoteChanged ? undefined : savedFields?.totalprisOverride) ?? autoVars.totalpris,
    reiseDekkesAv: savedFields?.reiseDekkesAv ?? 'oppdragsgiver' as const,
    antallCrew: (quoteChanged ? undefined : savedFields?.antallCrewOverride) ?? autoVars.antall_crew,
  }

  return { template, autoVars, formDefaults, contract, lang, quoteId: quote?.id ?? null }
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
    antall_crew: string
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
    reiseDekkesAv: 'oppdragsgiver' | 'oppdragstaker'
    antallCrew: string
  }
  ourSignature: OurSignature | null
  mySignatureImage: string | null
  myName: string
  currentQuoteId: string | null
  contractQuoteId: string | null
}> {
  const { autoVars, formDefaults, contract, quoteId } = await buildContractContext(projectId)

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
    currentQuoteId: quoteId,
    contractQuoteId: (contract as { quote_id?: string | null } | null)?.quote_id ?? null,
  }
}

// ---------------------------------------------------------------------------
// Strukturert oppsummering av det aksepterte tilbudet — riktige priser og
// tilvalg kunden faktisk krysset av — til visning under Kontrakt-fanen
// (feedback 7b2b2879: dagens kontraktstekst vever kun totalsummen inn i
// prosa, ingen strukturert oversikt over hva som faktisk ble akseptert).
// ---------------------------------------------------------------------------
export type AcceptedQuoteSummary = {
  version: string
  acceptedAt: string | null
  categoryTotals: { startup: number; production: number; equipment: number; post: number; expenses: number }
  discountAmount: number
  vatAmount: number
  totalExclVat: number
  totalInclVat: number
  selectedAddons: { id: string; description: string; amount: number }[]
} | null

export async function getAcceptedQuoteSummary(projectId: string): Promise<AcceptedQuoteSummary> {
  const supabase = await createClient()

  const { data: quote } = await supabase
    .from('quotes')
    .select('version, status, accepted_at, quote_data, selected_addon_ids')
    .eq('project_id', projectId)
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!quote?.quote_data) return null

  try {
    const qd = quote.quote_data as QuoteBuilderData
    const selectedAddonIds = (quote.selected_addon_ids ?? []) as string[]
    const totals = calculateQuoteTotals(qd, selectedAddonIds)
    const selectedAddons = (qd.optionalAddons ?? [])
      .filter(a => selectedAddonIds.includes(a.id))
      .map(a => ({ id: a.id, description: a.description, amount: Math.round(addonTotalPrice(a)) }))

    return {
      version: quote.version || 'V1',
      acceptedAt: quote.accepted_at,
      categoryTotals: {
        startup: Math.round(totals.categoryTotals.startup),
        production: Math.round(totals.categoryTotals.production),
        equipment: Math.round(totals.categoryTotals.equipment),
        post: Math.round(totals.categoryTotals.post),
        expenses: Math.round(totals.categoryTotals.expenses),
      },
      discountAmount: Math.round(totals.discountAmount),
      vatAmount: Math.round(totals.vatAmount),
      totalExclVat: Math.round(totals.afterDiscount),
      totalInclVat: Math.round(totals.finalInclVat),
      selectedAddons,
    }
  } catch (e) {
    console.error('getAcceptedQuoteSummary error:', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Generer kontraktteksten fra mal + auto-variabler + skjemaverdier.
// Ren beregning — lagrer ingenting (det gjør publishContract).
// ---------------------------------------------------------------------------
export async function generateContractText(projectId: string, formFields: ContractFormFields): Promise<{ text: string; quoteId: string | null }> {
  const { template, autoVars, lang, quoteId } = await buildContractContext(projectId)

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
    antall_crew: formFields.antallCrewOverride ?? autoVars.antall_crew,
    reise_dekkes_av: reiseDekkesAvLabel(formFields.reiseDekkesAv ?? 'oppdragsgiver', lang),
  }

  return { text: fillTemplate(template, vars), quoteId }
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

  // Hent gjeldende kontrakt (om noen)
  const { data: existing } = await supabase
    .from('contracts')
    .select('id, our_signature, status')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // En signert avtale skal aldri overskrives — den fryses som historikk, og et nytt
  // tilbud (f.eks. videresalg til samme kunde) publiseres i stedet som en ny,
  // gjeldende kontraktrad. En upublisert/usignert kontrakt oppdateres fortsatt i samme
  // rad som før, slik at vanlig redigering ikke lager en ny versjon per lagring.
  if (existing?.id && existing.status !== 'signed') {
    const { error } = await supabase
      .from('contracts')
      .update({
        quote_id: quoteId,
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
    if (existing?.id) {
      const { error: archiveError } = await supabase
        .from('contracts')
        .update({ is_current: false })
        .eq('id', existing.id)

      if (archiveError) {
        console.error('publishContract archive error:', archiveError)
        throw new Error('Kunne ikke arkivere forrige kontrakt')
      }
    }

    const { error } = await supabase
      .from('contracts')
      .insert({
        project_id: projectId,
        quote_id: quoteId,
        contract_text: contractText,
        form_fields: formFields ?? null,
        // Leafilms' egen signatur følger med til den nye versjonen hvis den allerede
        // finnes (handlePublishClick ber ikke om ny signatur når vi allerede har en) —
        // uten dette ville en videresalgs-kontrakt manglet vår signatur helt.
        our_signature: existing?.our_signature ?? ourSignaturePayload ?? null,
        published_at: publishedAt,
        status: 'sent',
        is_current: true,
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
    .eq('is_current', true)
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
    .eq('is_current', true)
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
// Versjonering av kontrakter — samme mønster som tilbud (feedback a28522fb):
// flere versjoner per prosjekt, én er_current ("gjeldende"), fritekst-label,
// mulighet til å forgrene en ny kladd fra gjeldende, bytte hvilken som er
// gjeldende, og slette utkast. contracts-tabellen har hatt is_current/label
// siden migrasjon 106 — ingen ny migrasjon nødvendig.
//
// generateContractText/publishContract/unpublishContract/unsignContract ser
// alle opp raden med is_current=true implisitt (se buildContractContext) —
// derfor er "sett som gjeldende" nok til at resten av kontrakt-flyten
// automatisk virker på riktig versjon, uten å endre de funksjonene.
// ---------------------------------------------------------------------------
export type ContractVersion = {
  id: string
  label: string | null
  status: 'pending' | 'sent' | 'signed' | 'cancelled'
  isCurrent: boolean
  signedAt: string | null
  publishedAt: string | null
  pdfUrl: string | null
  createdAt: string
}

export async function getAllContractVersions(projectId: string): Promise<ContractVersion[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('contracts')
    .select('id, label, status, signed_at, published_at, pdf_url, is_current, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('getAllContractVersions error:', error)
    return []
  }

  return (data ?? []).map(row => ({
    id: row.id,
    label: row.label,
    status: row.status,
    isCurrent: row.is_current,
    signedAt: row.signed_at,
    publishedAt: row.published_at,
    pdfUrl: row.pdf_url,
    createdAt: row.created_at,
  }))
}

// Forgrener en ny kladd-versjon fra gjeldende kontrakt (tekst + skjemafelt kopieres),
// arkiverer den gamle (is_current = false) og gjør den nye gjeldende. Fungerer også
// når gjeldende er signert — da forblir den signerte avtalen trygt som historikk.
export async function duplicateContractVersion(projectId: string): Promise<{ id: string } | null> {
  const supabase = await createClient()

  const { data: current } = await supabase
    .from('contracts')
    .select('id, quote_id, contract_text, form_fields, our_signature')
    .eq('project_id', projectId)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!current) return null

  await supabase.from('contracts').update({ is_current: false }).eq('id', current.id)

  const { data: inserted, error } = await supabase
    .from('contracts')
    .insert({
      project_id: projectId,
      quote_id: current.quote_id,
      contract_text: current.contract_text,
      form_fields: current.form_fields,
      status: 'pending' as const,
      is_current: true,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    console.error('duplicateContractVersion error:', error)
    // Rull tilbake arkiveringen slik at prosjektet ikke står uten en gjeldende kontrakt
    await supabase.from('contracts').update({ is_current: true }).eq('id', current.id)
    return null
  }

  return { id: inserted.id }
}

export async function setCurrentContractVersion(projectId: string, contractId: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('contracts').update({ is_current: false }).eq('project_id', projectId)
  await supabase.from('contracts').update({ is_current: true }).eq('id', contractId)
}

export async function updateContractLabel(contractId: string, label: string | null): Promise<void> {
  const supabase = await createClient()
  await supabase.from('contracts').update({ label: label?.trim() || null }).eq('id', contractId)
}

export async function deleteContractVersion(projectId: string, contractId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: target } = await supabase
    .from('contracts')
    .select('status, is_current')
    .eq('id', contractId)
    .single()

  if (!target) return { ok: false, error: 'Fant ikke kontrakten' }
  if (target.status === 'signed') return { ok: false, error: 'Kan ikke slette en signert kontrakt' }

  const { count } = await supabase
    .from('contracts')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  if ((count ?? 0) <= 1) return { ok: false, error: 'Kan ikke slette den eneste versjonen' }

  const { error } = await supabase.from('contracts').delete().eq('id', contractId)
  if (error) return { ok: false, error: 'Kunne ikke slette' }

  if (target.is_current) {
    const { data: fallback } = await supabase
      .from('contracts')
      .select('id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (fallback) {
      await supabase.from('contracts').update({ is_current: true }).eq('id', fallback.id)
    }
  }

  return { ok: true }
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

// ---------------------------------------------------------------------------
// Skru av/på om kunden må oppgi fakturainformasjon ved signering (f.eks. hvis
// vi allerede har den fra før). Default er på — fraværende felt tolkes som på.
// ---------------------------------------------------------------------------
export async function setRequestInvoiceInfo(projectId: string, requested: boolean): Promise<void> {
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
      pipeline_data: { ...existingPipelineData, request_invoice_info: requested },
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)

  if (error) {
    console.error('setRequestInvoiceInfo error:', error)
    throw new Error('Kunne ikke oppdatere fakturainfo-innstillingen')
  }
}
