'use server'

import { createClient } from '@/lib/supabase-server'
import { QuoteBuilderData, SalesFlyerPackageCategory } from '@/lib/types'
import { createEmptyBuilderData, getQuoteAmountExclVat, isBuilderData } from '@/lib/quote-builder-utils'
import { seedTasksFromTemplates } from '@/lib/actions/pipeline'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// Kunde (eller intern/Leafilms når customerId er null) -> pakketilbud ->
// pakker side ved side (liten/stor osv.) — se 199_package_offers.sql.
// Erstatter den gamle modellen i quote-packages.ts der en pakke var et
// vanlig tilbud som måtte bo i et delt, skjult "Leafilms — Pakkemaler"-
// prosjekt for å få et project_id.

export type PackageListItem = {
  id: string
  label: string
  category: SalesFlyerPackageCategory | null
  display_order: number
  amount: number
}

export type PackageOfferWithPackages = {
  id: string
  title: string
  customerId: string | null
  customerName: string | null
  updatedAt: string
  packages: PackageListItem[]
}

// Samme slug-mønster som ProjectForm.tsx (handleSubmit) — brukt når en pakke
// dupliseres ut som et ekte tilbud til en kunde.
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

// Hele pakketilbud-oversikten for /admin/package-offers, gruppert pr. kunde
// (customerId === null => "Interne pakker"). amount beregnes fra quote_data
// på samme måte som økonomisiden/pipeline-listen.
export async function listPackageOffers(): Promise<PackageOfferWithPackages[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('package_offers')
    .select('id, title, customer_id, updated_at, customers (name), packages (id, label, category, display_order, quote_data)')
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('listPackageOffers:', error)
    return []
  }
  type Row = {
    id: string
    title: string
    customer_id: string | null
    updated_at: string
    customers: { name: string | null } | null
    packages: { id: string; label: string; category: SalesFlyerPackageCategory | null; display_order: number; quote_data: unknown }[] | null
  }
  return ((data ?? []) as unknown as Row[]).map(row => ({
    id: row.id,
    title: row.title,
    customerId: row.customer_id,
    customerName: row.customers?.name ?? null,
    updatedAt: row.updated_at,
    packages: (row.packages ?? [])
      .slice()
      .sort((a, b) => a.display_order - b.display_order)
      .map(p => ({
        id: p.id,
        label: p.label,
        category: p.category,
        display_order: p.display_order,
        amount: getQuoteAmountExclVat(p.quote_data) ?? 0,
      })),
  }))
}

// Flat liste over alle pakker uansett pakketilbud — til PackagePickerModal
// (velg pakker for en salgsflyer) og SalesFlyerView. offerTitle/customerName
// gir admin litt kontekst i plukkeren (hvilket pakketilbud/kunde pakken hører til).
export type PickerPackageItem = Omit<PackageListItem, 'category'> & {
  category: SalesFlyerPackageCategory
  offerTitle: string
  customerName: string | null
}

export async function listAllPackagesForPicker(): Promise<PickerPackageItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('packages')
    .select('id, label, category, display_order, quote_data, package_offers (title, customers (name))')
    .order('category')
    .order('display_order')
  if (error) {
    console.error('listAllPackagesForPicker:', error)
    return []
  }
  type Row = {
    id: string
    label: string
    category: SalesFlyerPackageCategory | null
    display_order: number
    quote_data: unknown
    package_offers: { title: string; customers: { name: string | null } | null } | null
  }
  return ((data ?? []) as unknown as Row[])
    // En pakke uten kategori kan ikke plasseres i noen flyer-fane, så den utelates
    // — samme defensive filter som den gamle listPackageTemplateQuotes.
    .filter((row): row is Row & { category: SalesFlyerPackageCategory } => row.category !== null)
    .map(row => ({
      id: row.id,
      label: row.label,
      category: row.category,
      display_order: row.display_order,
      amount: getQuoteAmountExclVat(row.quote_data) ?? 0,
      offerTitle: row.package_offers?.title ?? '',
      customerName: row.package_offers?.customers?.name ?? null,
    }))
}

export async function createPackageOffer(
  fields: { customerId: string | null; title: string }
): Promise<{ id: string } | { error: string }> {
  const title = fields.title.trim()
  if (!title) return { error: 'Pakketilbudet må ha en tittel' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('package_offers')
    .insert({ customer_id: fields.customerId, title, created_by: user?.id ?? null })
    .select('id')
    .single()
  if (error) {
    console.error('createPackageOffer:', error)
    return { error: 'Kunne ikke opprette pakketilbudet' }
  }
  return { id: data.id }
}

export async function renamePackageOffer(offerId: string, title: string): Promise<{ ok: true } | { error: string }> {
  const trimmed = title.trim()
  if (!trimmed) return { error: 'Pakketilbudet må ha en tittel' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('package_offers')
    .update({ title: trimmed, updated_at: new Date().toISOString() })
    .eq('id', offerId)
    .select('id')
  if (error) {
    console.error('renamePackageOffer:', error)
    return { error: 'Kunne ikke lagre tittelen' }
  }
  if (!data || data.length === 0) return { error: 'Pakketilbudet finnes ikke lenger' }
  return { ok: true }
}

// Flytter hele pakke-gruppen (package_offer) til en annen kunde, eller til internt
// (customerId null) — endrer hvem som eier/ser ALLE pakketilbudene i gruppen på én gang.
export async function moveOfferToCustomer(offerId: string, customerId: string | null): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('package_offers')
    .update({ customer_id: customerId, updated_at: new Date().toISOString() })
    .eq('id', offerId)
    .select('id')
  if (error) {
    console.error('moveOfferToCustomer:', error)
    return { error: 'Kunne ikke flytte pakke-gruppen' }
  }
  if (!data || data.length === 0) return { error: 'Pakke-gruppen finnes ikke lenger' }
  return { ok: true }
}

// Flytter ett enkelt pakketilbud (packages-rad) til en annen pakke-gruppe — havner
// sist i rekkefølgen der, samme append-mønster som createPackage/duplicatePackage.
export async function movePackageToOffer(packageId: string, targetOfferId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('packages')
    .select('display_order')
    .eq('package_offer_id', targetOfferId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = (existing?.display_order ?? -1) + 1

  const { data, error } = await supabase
    .from('packages')
    .update({ package_offer_id: targetOfferId, display_order: nextOrder, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .select('id')
  if (error) {
    console.error('movePackageToOffer:', error)
    return { error: 'Kunne ikke flytte pakketilbudet' }
  }
  if (!data || data.length === 0) return { error: 'Pakketilbudet finnes ikke lenger' }
  return { ok: true }
}

// To separate spørringer i stedet for et embedded-resource-filter — samme
// tryggere mønster som den gamle checkQuoteUsedOnPublishedFlyers.
export async function checkPackagesUsedOnPublishedFlyers(packageIds: string[]): Promise<{ flyerSlugs: string[] }> {
  if (packageIds.length === 0) return { flyerSlugs: [] }
  const supabase = await createClient()
  const { data: links, error: linksError } = await supabase
    .from('sales_flyer_packages')
    .select('flyer_id')
    .in('package_id', packageIds)
  if (linksError) {
    console.error('checkPackagesUsedOnPublishedFlyers links:', linksError)
    return { flyerSlugs: [] }
  }
  const flyerIds = [...new Set((links ?? []).map((l: { flyer_id: string }) => l.flyer_id))]
  if (flyerIds.length === 0) return { flyerSlugs: [] }

  const { data: flyers, error: flyersError } = await supabase
    .from('sales_flyers')
    .select('slug, published')
    .in('id', flyerIds)
  if (flyersError) {
    console.error('checkPackagesUsedOnPublishedFlyers flyers:', flyersError)
    return { flyerSlugs: [] }
  }
  const flyerSlugs = ((flyers ?? []) as { slug: string; published: boolean }[])
    .filter(f => f.published)
    .map(f => f.slug)
    .sort()
  return { flyerSlugs }
}

// Fjerner hele pakketilbudet, inkl. alle pakkene i det (cascade). Kalleren
// har allerede vist bekreftelsesdialogen via checkPackagesUsedOnPublishedFlyers
// — her sjekkes ikke på nytt.
export async function deletePackageOffer(offerId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('package_offers').delete().eq('id', offerId)
  if (error) {
    console.error('deletePackageOffer:', error)
    return { error: 'Kunne ikke slette pakketilbudet' }
  }
  return { ok: true }
}

export async function createPackage(
  offerId: string,
  fields: { label: string; category?: SalesFlyerPackageCategory | null }
): Promise<{ id: string } | { error: string }> {
  const label = fields.label.trim()
  if (!label) return { error: 'Pakken må ha et navn' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: existing } = await supabase
    .from('packages')
    .select('display_order')
    .eq('package_offer_id', offerId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = (existing?.display_order ?? -1) + 1

  const { data, error } = await supabase
    .from('packages')
    .insert({
      package_offer_id: offerId,
      label,
      category: fields.category ?? null,
      display_order: nextOrder,
      quote_data: createEmptyBuilderData(label),
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()
  if (error) {
    console.error('createPackage:', error)
    return { error: 'Kunne ikke opprette pakken' }
  }
  return { id: data.id }
}

// Dupliserer en pakke som en ny søster-pakke i SAMME pakketilbud — den
// vanligste måten å lage en ny pakke på, siden de ofte ligner hverandre
// (f.eks. "Stor pakke" ut fra "Liten pakke").
export async function duplicatePackage(packageId: string): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: source, error: sourceError } = await supabase
    .from('packages')
    .select('package_offer_id, label, category, quote_data')
    .eq('id', packageId)
    .maybeSingle()
  if (sourceError || !source) {
    if (sourceError) console.error('duplicatePackage source:', sourceError)
    return { error: 'Fant ikke pakken' }
  }

  const { data: existing } = await supabase
    .from('packages')
    .select('display_order')
    .eq('package_offer_id', source.package_offer_id)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = (existing?.display_order ?? -1) + 1

  const { data, error } = await supabase
    .from('packages')
    .insert({
      package_offer_id: source.package_offer_id,
      label: `${source.label} (kopi)`,
      category: source.category,
      display_order: nextOrder,
      quote_data: source.quote_data,
      created_by: user?.id ?? null,
    })
    .select('id')
    .single()
  if (error) {
    console.error('duplicatePackage insert:', error)
    return { error: 'Kunne ikke duplisere pakken' }
  }
  return { id: data.id }
}

export async function renamePackage(packageId: string, label: string): Promise<{ ok: true } | { error: string }> {
  const trimmed = label.trim()
  if (!trimmed) return { error: 'Pakken må ha et navn' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('packages')
    .update({ label: trimmed, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .select('id')
  if (error) {
    console.error('renamePackage:', error)
    return { error: 'Kunne ikke lagre navnet' }
  }
  if (!data || data.length === 0) return { error: 'Pakken finnes ikke lenger' }
  return { ok: true }
}

export async function setPackageCategory(
  packageId: string,
  category: SalesFlyerPackageCategory | null
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('packages')
    .update({ category, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .select('id')
  if (error) {
    console.error('setPackageCategory:', error)
    return { error: 'Kunne ikke lagre kategorien' }
  }
  if (!data || data.length === 0) return { error: 'Pakken finnes ikke lenger' }
  return { ok: true }
}

// Bytter plass med nærmeste søster-pakke (samme package_offer_id) i den
// ordnede listen — enkelt opp/ned i pakketilbud-oversikten.
export async function reorderPackage(
  offerId: string,
  packageId: string,
  direction: 'up' | 'down'
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: siblings, error: fetchError } = await supabase
    .from('packages')
    .select('id, display_order')
    .eq('package_offer_id', offerId)
    .order('display_order', { ascending: true })
  if (fetchError) {
    console.error('reorderPackage fetch:', fetchError)
    return { error: 'Kunne ikke hente pakkene' }
  }
  const rows = (siblings ?? []) as { id: string; display_order: number }[]
  const index = rows.findIndex(r => r.id === packageId)
  if (index === -1) return { error: 'Pakken finnes ikke lenger' }
  const swapWith = direction === 'up' ? index - 1 : index + 1
  if (swapWith < 0 || swapWith >= rows.length) return { ok: true }

  const a = rows[index]
  const b = rows[swapWith]
  const [err1, err2] = await Promise.all([
    supabase.from('packages').update({ display_order: b.display_order }).eq('id', a.id),
    supabase.from('packages').update({ display_order: a.display_order }).eq('id', b.id),
  ]).then(results => results.map(r => r.error))
  if (err1 || err2) {
    console.error('reorderPackage update:', err1 || err2)
    return { error: 'Kunne ikke lagre rekkefølgen' }
  }
  return { ok: true }
}

// Kalleren har allerede vist bekreftelsesdialogen via
// checkPackagesUsedOnPublishedFlyers — her sjekkes ikke på nytt. Sletter
// lenkene til salgsflyere først, samme sikkerhetsnett-mønster som før
// (ON DELETE CASCADE ville gjort det samme, men eksplisitt her er tydeligere).
export async function deletePackage(packageId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()

  const { error: linksError } = await supabase
    .from('sales_flyer_packages')
    .delete()
    .eq('package_id', packageId)
  if (linksError) {
    console.error('deletePackage delete links:', linksError)
    return { error: 'Kunne ikke fjerne pakken fra flyerne' }
  }

  const { error } = await supabase.from('packages').delete().eq('id', packageId)
  if (error) {
    console.error('deletePackage:', error)
    return { error: 'Kunne ikke slette pakken' }
  }
  return { ok: true }
}

export type PackageForEditor = {
  id: string
  label: string
  category: SalesFlyerPackageCategory | null
  quoteData: QuoteBuilderData
  offer: { id: string; title: string; customerId: string | null }
  siblings: { id: string; label: string }[]
}

// Henter én pakke for redigering i QuoteBuilder, pluss nok kontekst om
// pakketilbudet (inkl. søster-pakkene) til at editoren kan vise en enkel
// fane-bytter mellom pakkene i samme pakketilbud.
export async function getPackageForEditor(packageId: string): Promise<PackageForEditor | { error: string }> {
  const supabase = await createClient()
  const { data: pkg, error } = await supabase
    .from('packages')
    .select('id, label, category, quote_data, package_offers (id, title, customer_id)')
    .eq('id', packageId)
    .maybeSingle()
  if (error || !pkg) {
    if (error) console.error('getPackageForEditor:', error)
    return { error: 'Fant ikke pakken' }
  }
  type Row = {
    id: string
    label: string
    category: SalesFlyerPackageCategory | null
    quote_data: unknown
    package_offers: { id: string; title: string; customer_id: string | null } | null
  }
  const row = pkg as unknown as Row
  if (!row.package_offers) return { error: 'Pakketilbudet finnes ikke lenger' }

  const { data: siblings, error: siblingsError } = await supabase
    .from('packages')
    .select('id, label, display_order')
    .eq('package_offer_id', row.package_offers.id)
    .order('display_order', { ascending: true })
  if (siblingsError) console.error('getPackageForEditor siblings:', siblingsError)

  const quoteData = isBuilderData(row.quote_data) ? row.quote_data : createEmptyBuilderData(row.label)
  return {
    id: row.id,
    label: row.label,
    category: row.category,
    quoteData,
    offer: { id: row.package_offers.id, title: row.package_offers.title, customerId: row.package_offers.customer_id },
    siblings: ((siblings ?? []) as { id: string; label: string; display_order: number }[])
      .map(s => ({ id: s.id, label: s.label })),
  }
}

export async function savePackageQuoteData(packageId: string, data: QuoteBuilderData): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('packages')
    .update({ quote_data: data, updated_at: new Date().toISOString() })
    .eq('id', packageId)
    .select('id')
  if (error) {
    console.error('savePackageQuoteData:', error)
    return { error: 'Kunne ikke lagre pakken' }
  }
  if (!updated || updated.length === 0) return { error: 'Pakken finnes ikke lenger' }
  return { ok: true }
}

async function findOrCreateCustomerByName(supabase: SupabaseServerClient, name: string): Promise<{ id: string; name: string; customer_number: number | null }> {
  const { data: match, error: matchError } = await supabase
    .from('customers')
    .select('id, name, customer_number')
    .ilike('name', escapeIlike(name))
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (matchError) throw matchError
  if (match) return match

  // customers-rad: kun kontonavn — ingen email/phone/company (som ProjectForm.tsx, se migrasjon 186/187).
  const { data: created, error: createError } = await supabase
    .from('customers')
    .insert({ name })
    .select('id, name, customer_number')
    .single()
  if (createError) throw createError
  return created
}

// Oppretter et helt nytt, ekte prosjekt + tilbud for en kunde, basert på en
// dyp kopi av pakkens quote_data — pakken selv endres aldri. Dette er den
// eneste veien fra en pakke til et "ekte" kundetilbud; pakketilbud/pakker
// krever ikke og blir aldri et prosjekt.
export async function createProjectQuoteFromPackage(
  packageId: string,
  customer: { existingCustomerId: string } | { newCustomerName: string }
): Promise<{ projectId: string; quoteId: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: source, error: sourceError } = await supabase
    .from('packages')
    .select('label, quote_data')
    .eq('id', packageId)
    .maybeSingle()
  if (sourceError || !source) {
    if (sourceError) console.error('createProjectQuoteFromPackage source:', sourceError)
    return { error: 'Fant ikke pakken' }
  }
  if (!isBuilderData(source.quote_data)) {
    return { error: 'Pakken har et format som ikke kan kopieres — åpne og lagre den i pakke-editoren først' }
  }

  let customerId: string
  let customerName: string
  let customerNumber: number | null
  try {
    if ('existingCustomerId' in customer) {
      const { data: existing, error: customerError } = await supabase
        .from('customers')
        .select('id, name, customer_number')
        .eq('id', customer.existingCustomerId)
        .maybeSingle()
      if (customerError || !existing) {
        if (customerError) console.error('createProjectQuoteFromPackage customer lookup:', customerError)
        return { error: 'Fant ikke kunden' }
      }
      customerId = existing.id
      customerName = existing.name
      customerNumber = existing.customer_number ?? null
    } else {
      const name = customer.newCustomerName.trim()
      if (!name) return { error: 'Kunden må ha et navn' }
      const found = await findOrCreateCustomerByName(supabase, name)
      customerId = found.id
      customerName = found.name
      customerNumber = found.customer_number ?? null
    }
  } catch (err) {
    console.error('createProjectQuoteFromPackage customer:', err)
    return { error: 'Kunne ikke slå opp/opprette kunden' }
  }

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
    console.error('createProjectQuoteFromPackage project insert:', projectError)
    return { error: 'Kunne ikke opprette prosjektet' }
  }
  // Som ProjectForm.tsx: seed oppgaver for startsteget, ellers får prosjektet
  // ingen tasks før første stegbytte.
  await seedTasksFromTemplates(project.id, project.pipeline_stage, supabase)

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
    })
    .select('id')
    .single()
  if (quoteError) {
    console.error('createProjectQuoteFromPackage quote insert:', quoteError)
    return { error: 'Prosjektet ble opprettet, men tilbudet kunne ikke kopieres' }
  }

  return { projectId: project.id, quoteId: quote.id }
}
