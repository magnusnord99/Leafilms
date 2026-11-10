'use server'

import { createClient } from '@/lib/supabase-server'
import { QuoteBuilderData, SalesFlyerPackageCategory } from '@/lib/types'
import { createEmptyBuilderData, getQuoteAmountExclVat, isBuilderData } from '@/lib/quote-builder-utils'
import { seedTasksFromTemplates } from '@/lib/actions/pipeline'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

export type PackageTemplateQuote = {
  id: string
  package_label: string
  package_category: SalesFlyerPackageCategory
  package_order: number
  amount: number
}

// Fast, gjenkjennelig navn på det delte, skjulte prosjektet (og kunden) som huser
// pakke-maler opprettet direkte fra flyer-editoren. is_package_template = true holder
// det ute av pipeline/Kanban og alle omsetningstall (migrasjon 190).
const PACKAGE_TEMPLATE_NAME = 'Leafilms — Pakkemaler'

// Samme slug-mønster som ProjectForm.tsx (handleSubmit).
function slugifyTitle(title: string): string {
  const baseSlug = title
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const uniqueSuffix = Date.now().toString(36).slice(-6)
  return `${baseSlug || 'prosjekt'}-${uniqueSuffix}`
}

// Escaper ILIKE-jokertegn slik at et kundenavn som "50% Film" matches bokstavelig.
function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, c => `\\${c}`)
}

export async function listPackageTemplateQuotes(): Promise<PackageTemplateQuote[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quotes')
    .select('id, package_label, package_category, package_order, quote_data')
    .not('package_label', 'is', null)
    .order('package_category')
    .order('package_order')
  if (error) {
    console.error('listPackageTemplateQuotes:', error)
    return []
  }
  const rows = (data ?? []) as {
    id: string
    package_label: string
    package_category: SalesFlyerPackageCategory | null
    package_order: number
    quote_data: unknown
  }[]
  return rows
    // package_category er nullbar i DB uavhengig av package_label — en pakke uten
    // kategori kan ikke plasseres i noen flyer-fane, så den utelates.
    .filter((row): row is typeof row & { package_category: SalesFlyerPackageCategory } => row.package_category !== null)
    .map(row => ({
      id: row.id,
      package_label: row.package_label,
      package_category: row.package_category,
      package_order: row.package_order,
      // Samme beløp (eks. mva, etter rabatt, uten tillegg) som /admin/quotes,
      // Økonomi og pipeline-listen viser for et tilbud — robust for begge
      // quote_data-formene (rå builder-data og konvertert akseptert-form).
      amount: getQuoteAmountExclVat(row.quote_data) ?? 0,
    }))
}

export async function markQuoteAsPackage(
  quoteId: string,
  fields: { package_label: string; package_category: SalesFlyerPackageCategory; package_order?: number }
): Promise<{ ok: true } | { error: string }> {
  const label = fields.package_label.trim()
  if (!label) return { error: 'Pakken må ha et navn' }

  const supabase = await createClient()
  // .select() + bekreft at raden ble truffet (samme mønster som updateIndustryLandingPage)
  const { data, error } = await supabase
    .from('quotes')
    .update({
      package_label: label,
      package_category: fields.package_category,
      package_order: fields.package_order ?? 0,
    })
    .eq('id', quoteId)
    .select('id')

  if (error) {
    console.error('markQuoteAsPackage:', error)
    return { error: 'Kunne ikke merke tilbudet som pakke' }
  }
  if (!data || data.length === 0) {
    return { error: 'Tilbudet finnes ikke lenger, eller du har ikke tilgang' }
  }
  return { ok: true }
}

// To separate spørringer i stedet for et embedded-resource-filter
// (sales_flyers!inner + .eq('sales_flyers.published', true)) — samme tryggere
// mønster som app/admin/okonomi/page.tsx, og uavhengig av hvordan PostgREST
// tolker filteret på den innebygde relasjonen.
export async function checkQuoteUsedOnPublishedFlyers(quoteId: string): Promise<{ flyerSlugs: string[] }> {
  const supabase = await createClient()
  const { data: links, error: linksError } = await supabase
    .from('sales_flyer_packages')
    .select('flyer_id')
    .eq('quote_id', quoteId)
  if (linksError) {
    console.error('checkQuoteUsedOnPublishedFlyers links:', linksError)
    return { flyerSlugs: [] }
  }
  const flyerIds = [...new Set((links ?? []).map((l: { flyer_id: string }) => l.flyer_id))]
  if (flyerIds.length === 0) return { flyerSlugs: [] }

  const { data: flyers, error: flyersError } = await supabase
    .from('sales_flyers')
    .select('slug, published')
    .in('id', flyerIds)
  if (flyersError) {
    console.error('checkQuoteUsedOnPublishedFlyers flyers:', flyersError)
    return { flyerSlugs: [] }
  }
  const flyerSlugs = ((flyers ?? []) as { slug: string; published: boolean }[])
    .filter(f => f.published)
    .map(f => f.slug)
    .sort()
  return { flyerSlugs }
}

// Fjerner tilbudet fra alle flyere først, deretter pakke-feltene. Rekkefølgen
// betyr at en feil midtveis aldri etterlater en flyer som peker på et tilbud
// som ikke lenger er merket som pakke. Kalleren (Task 7) har allerede vist
// bekreftelsesdialogen via checkQuoteUsedOnPublishedFlyers — her sjekkes ikke på nytt.
export async function unmarkQuoteAsPackage(quoteId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()

  const { error: deleteError } = await supabase
    .from('sales_flyer_packages')
    .delete()
    .eq('quote_id', quoteId)
  if (deleteError) {
    console.error('unmarkQuoteAsPackage delete links:', deleteError)
    return { error: 'Kunne ikke fjerne pakken fra flyerne' }
  }

  const { data, error } = await supabase
    .from('quotes')
    .update({ package_label: null, package_category: null, package_order: 0 })
    .eq('id', quoteId)
    .select('id')
  if (error) {
    console.error('unmarkQuoteAsPackage update quote:', error)
    return { error: 'Kunne ikke fjerne pakke-merkingen' }
  }
  if (!data || data.length === 0) {
    return { error: 'Tilbudet finnes ikke lenger, eller du har ikke tilgang' }
  }
  return { ok: true }
}

// Fjerner pakken helt (brukt fra oversikten i /admin/quotes, "Pakkemaler"-fanen) —
// i motsetning til unmarkQuoteAsPackage, som bare fjerner pakke-merkingen og lar
// selve tilbudet ligge igjen i mal-prosjektet. Samme rekkefølge som unmarkQuoteAsPackage
// (flyer-koblinger først): kalleren (Task 7-mønsteret) har allerede vist bekreftelse
// via checkQuoteUsedOnPublishedFlyers — her sjekkes ikke på nytt.
export async function deletePackageTemplateQuote(quoteId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()

  const { error: linksError } = await supabase
    .from('sales_flyer_packages')
    .delete()
    .eq('quote_id', quoteId)
  if (linksError) {
    console.error('deletePackageTemplateQuote delete links:', linksError)
    return { error: 'Kunne ikke fjerne pakken fra flyerne' }
  }

  const { error } = await supabase
    .from('quotes')
    .delete()
    .eq('id', quoteId)
  if (error) {
    console.error('deletePackageTemplateQuote delete quote:', error)
    return { error: 'Kunne ikke slette pakken' }
  }
  return { ok: true }
}

// Finner (eller oppretter) en kunde med eksakt navn, slik at en tidligere
// halvferdig kjøring (kunde opprettet, prosjekt-insert feilet) ikke etterlater
// en ny duplikatkunde for hvert forsøk.
async function findOrCreateTemplateCustomer(supabase: SupabaseServerClient): Promise<string> {
  const { data: existing, error: lookupError } = await supabase
    .from('customers')
    .select('id')
    .eq('name', PACKAGE_TEMPLATE_NAME)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (lookupError) throw lookupError
  if (existing) return existing.id

  // customers-rad: kun kontonavn — ingen email/phone/company (som ProjectForm.tsx)
  const { data: created, error: insertError } = await supabase
    .from('customers')
    .insert({ name: PACKAGE_TEMPLATE_NAME })
    .select('id')
    .single()
  if (insertError) throw insertError
  return created.id
}

// Idempotent: slår alltid opp det eksisterende mal-prosjektet før noe opprettes.
// Ingen eksplisitt låsing — to nesten samtidige første-kall kan i teorien lage to
// mal-prosjekter. Konsekvensen er harmløs (begge er skjult via is_package_template,
// og oppslaget velger alltid det eldste, så videre kall konvergerer), og en ekte
// garanti ville krevd en unik partiell indeks (egen migrasjon).
export async function ensurePackageTemplateProject(): Promise<{ projectId: string; customerId: string }> {
  const supabase = await createClient()

  const { data: existing, error: lookupError } = await supabase
    .from('projects')
    .select('id, customer_id')
    .eq('is_package_template', true)
    .eq('title', PACKAGE_TEMPLATE_NAME)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (lookupError) throw lookupError

  if (existing) {
    if (existing.customer_id) return { projectId: existing.id, customerId: existing.customer_id }
    // Prosjektet finnes, men har mistet kunden (f.eks. kunden slettet) — koble på igjen.
    const customerId = await findOrCreateTemplateCustomer(supabase)
    const { error: relinkError } = await supabase
      .from('projects')
      .update({ customer_id: customerId, client_name: PACKAGE_TEMPLATE_NAME })
      .eq('id', existing.id)
    if (relinkError) throw relinkError
    return { projectId: existing.id, customerId }
  }

  const customerId = await findOrCreateTemplateCustomer(supabase)
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      title: PACKAGE_TEMPLATE_NAME,
      slug: `pakkemaler-${Date.now()}`,
      client_name: PACKAGE_TEMPLATE_NAME,
      customer_id: customerId,
      status: 'draft',
      is_package_template: true,
      language: 'no',
    })
    .select('id')
    .single()
  if (projectError) throw projectError
  return { projectId: project.id, customerId }
}

export async function createPackageTemplateQuote(
  fields: { package_label: string; package_category: SalesFlyerPackageCategory }
): Promise<{ projectId: string; quoteId: string } | { error: string }> {
  const label = fields.package_label.trim()
  if (!label) return { error: 'Pakken må ha et navn' }

  let projectId: string
  try {
    ({ projectId } = await ensurePackageTemplateProject())
  } catch (err) {
    console.error('createPackageTemplateQuote ensure project:', err)
    return { error: 'Kunne ikke opprette mal-prosjektet for pakker' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Samme standard-skjelett som et helt nytt tilbud i tilbudsbyggeren
  // (app/admin/projects/[id]/quote/page.tsx → createEmptyBuilderData).
  const quoteData = createEmptyBuilderData(label)

  // Samme felt som handleSave i tilbudsbyggeren setter ved første insert
  // (sheet_url/version/created_by), pluss pakke-feltene.
  const { data: quote, error } = await supabase
    .from('quotes')
    .insert({
      project_id: projectId,
      sheet_url: '',
      version: quoteData.version || 'V1',
      quote_data: quoteData,
      status: 'draft',
      is_current: true,
      created_by: user?.id ?? null,
      package_label: label,
      package_category: fields.package_category,
      package_order: 0,
    })
    .select('id')
    .single()
  if (error) {
    console.error('createPackageTemplateQuote insert quote:', error)
    return { error: 'Kunne ikke opprette pakke-tilbudet' }
  }
  return { projectId, quoteId: quote.id }
}

export async function duplicatePackageAsNewProject(
  quoteId: string,
  customer: { existingCustomerId: string } | { newCustomerName: string }
): Promise<{ projectId: string; quoteId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 1. Kilde-tilbudet
  const { data: source, error: sourceError } = await supabase
    .from('quotes')
    .select('quote_data')
    .eq('id', quoteId)
    .maybeSingle()
  if (sourceError || !source) {
    if (sourceError) console.error('duplicatePackageAsNewProject source:', sourceError)
    return { error: 'Fant ikke pakke-tilbudet' }
  }
  // Kun rå builder-data kan redigeres videre i tilbudsbyggeren — en konvertert
  // (akseptert-form) quote_data ville gitt et nytt tilbud som ikke kan åpnes for redigering.
  if (!isBuilderData(source.quote_data)) {
    return { error: 'Pakke-tilbudet har et format som ikke kan kopieres — åpne og lagre det i tilbudsbyggeren først' }
  }

  // 2. Kunden
  let customerId: string
  let customerName: string
  let customerNumber: number | null = null
  if ('existingCustomerId' in customer) {
    const { data: existing, error: customerError } = await supabase
      .from('customers')
      .select('id, name, customer_number')
      .eq('id', customer.existingCustomerId)
      .maybeSingle()
    if (customerError || !existing) {
      if (customerError) console.error('duplicatePackageAsNewProject customer lookup:', customerError)
      return { error: 'Fant ikke kunden' }
    }
    customerId = existing.id
    customerName = existing.name
    customerNumber = existing.customer_number ?? null
  } else {
    const name = customer.newCustomerName.trim()
    if (!name) return { error: 'Kunden må ha et navn' }

    // Samme case-insensitive match-eller-opprett som ProjectForm.tsx
    const { data: match, error: matchError } = await supabase
      .from('customers')
      .select('id, name, customer_number')
      .ilike('name', escapeIlike(name))
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (matchError) {
      console.error('duplicatePackageAsNewProject customer match:', matchError)
      return { error: 'Kunne ikke slå opp kunden' }
    }
    if (match) {
      customerId = match.id
      customerName = match.name
      customerNumber = match.customer_number ?? null
    } else {
      // customers-rad: kun kontonavn — ingen email/phone/company (som ProjectForm.tsx)
      const { data: created, error: createError } = await supabase
        .from('customers')
        .insert({ name })
        .select('id, name, customer_number')
        .single()
      if (createError) {
        console.error('duplicatePackageAsNewProject customer insert:', createError)
        return { error: 'Kunne ikke opprette kunden' }
      }
      customerId = created.id
      customerName = created.name
      customerNumber = created.customer_number ?? null
    }
  }

  // 3. Nytt, helt vanlig prosjekt (pipeline_stage = DB-default 'lead')
  const title = customerName
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      title,
      slug: slugifyTitle(title),
      client_name: customerName,
      customer_id: customerId,
      status: 'draft',
      is_package_template: false,
      language: 'no',
    })
    .select('id, pipeline_stage')
    .single()
  if (projectError) {
    console.error('duplicatePackageAsNewProject project insert:', projectError)
    return { error: 'Kunne ikke opprette prosjektet' }
  }
  // Som ProjectForm.tsx: seed oppgaver for startsteget, ellers får prosjektet
  // ingen tasks før første stegbytte.
  await seedTasksFromTemplates(project.id, project.pipeline_stage, supabase)

  // 4. Dyp kopi av malen — aldri delt referanse, malen endres aldri. Kundespesifikke
  // topptekst-felt settes til den nye kunden, ellers ville tilbudet/PDF-en vist
  // pakkens navn og mal-kunden ("Leafilms — Pakkemaler") til en ekte kunde.
  const quoteData = JSON.parse(JSON.stringify(source.quote_data)) as QuoteBuilderData
  quoteData.projectName = title
  quoteData.clientContact = customerName
  quoteData.customerNumber = customerNumber != null ? String(customerNumber) : ''
  quoteData.version = 'V1'
  quoteData.quoteDate = new Date().toISOString().split('T')[0]

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .insert({
      project_id: project.id,
      sheet_url: '',
      version: 'V1',
      quote_data: quoteData,
      status: 'draft',
      is_current: true,
      created_by: user?.id ?? null,
      package_label: null,
      package_category: null,
      package_order: 0,
    })
    .select('id')
    .single()
  if (quoteError) {
    console.error('duplicatePackageAsNewProject quote insert:', quoteError)
    return { error: 'Prosjektet ble opprettet, men tilbudet kunne ikke kopieres' }
  }

  return { projectId: project.id, quoteId: quote.id }
}
