'use server'

import { createClient, createServiceClient } from '@/lib/supabase-server'
import { SalesFlyer, CaseStudy, SalesFlyerPackageCategory, SalesFlyerReferenceLink, QuotePackageShowcaseItem } from '@/lib/types'
import { validateSlug } from '@/lib/industry-landing-pages'
import { getAuthenticatedStaffUser } from '@/lib/auth/staff'
import { getQuoteAmountExclVat, getPackageDeliverableCounts } from '@/lib/quote-builder-utils'

// Kun de feltene besøkende/editoren faktisk trenger for å vise en pakke —
// ALDRI hele Quote-raden. getSalesFlyerBySlug serialiseres som initialFlyer
// til den klient-rendrede SalesFlyerView, og denne listen går derfor rett i
// side-payloaden til hver anonyme flyer-besøkende. Et fullt quotes(*)-embed
// (som tidligere) lekket crew-navn/dagspriser, linjepriser, discountFactor,
// ourContact/companyEmail, kontraktsvilkår, project_id, created_by, pdf_path
// — og hvis et ekte kundetilbud merkes som pakke, kundens navn/nummer/
// prosjektnavn også.
export type SalesFlyerPackageItem = {
  id: string
  order_index: number
  quote_id: string
  package_label: string
  package_category: SalesFlyerPackageCategory
  amount: number
  deliverableCounts: { hovedvideo: number; klipp: number; photo: number }
  showcaseItems: QuotePackageShowcaseItem[]
}

export type SalesFlyerWithRelations = SalesFlyer & {
  cases: (CaseStudy & { order_index: number })[]
  packages: SalesFlyerPackageItem[]
  referenceLinks: SalesFlyerReferenceLink[]
}

// view_count er totalt antall rader i sales_flyer_views for flyeren (ikke
// unike besøkende) — brukes av admin-listen (/admin/landingssider) for å
// vise "X visninger" pr. flyer.
export type SalesFlyerListItem = SalesFlyer & { view_count: number }

export async function listSalesFlyers(): Promise<SalesFlyerListItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sales_flyers')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('listSalesFlyers:', error)
    return []
  }
  const flyers = (data ?? []) as SalesFlyer[]
  if (flyers.length === 0) return []

  // IKKE hent rå rader og tell i JS (som loadChildMeta i boards.ts/
  // equipment.ts gjør) — Supabase begrenser ett enkelt svar til 1000 rader by
  // default, og denne tabellen har ingen lokal override. Når sales_flyer_views
  // samlet passerer 1000 rader ville enhver flyers view_count stille sluttet å
  // øke. count: 'exact', head: true pr. flyer unngår grensen (hver spørring
  // returnerer kun selve tallet, ingen rader).
  const counts = await Promise.all(
    flyers.map(async f => {
      const { count, error: viewsError } = await supabase
        .from('sales_flyer_views')
        .select('*', { count: 'exact', head: true })
        .eq('flyer_id', f.id)
      if (viewsError) console.error('listSalesFlyers (views):', viewsError)
      return count ?? 0
    })
  )

  return flyers.map((f, i) => ({ ...f, view_count: counts[i] }))
}

// Brukes av den offentlige ruten (app/(marketing)/[slug]/page.tsx), besøkt av
// anonyme flyer-mottakere uten innlogging. Derfor service-klient (bypasser
// RLS) her — samme mønster som /p/[token] — i stedet for den cookie-bundne
// klienten: quotes har ingen anon-read-policy (kun authenticated_read_quotes,
// se migrasjon 019/087), så et vanlig klient-kall ville stille RLS-nullet
// quotes (*)-embedet og vist tomme pakke-lister for alle ekte besøkende.
// published/includeDraft-gatingen er allerede håndtert på applikasjonsnivå
// (kalleren avgjør includeDraft etter egen staff-sjekk), ikke av RLS, så
// dette endrer ikke autorisasjonsgrensen — bare hvilken klient utfører
// selve databasekallet.
// includeDraft=true lar innlogget staff forhåndsvise en upublisert flyer.
export async function getSalesFlyerBySlug(
  slug: string,
  { includeDraft = false }: { includeDraft?: boolean } = {}
): Promise<SalesFlyerWithRelations | null> {
  // includeDraft er kallerens PÅSTAND, ikke en tillatelse: som 'use server'-
  // eksport kan denne kalles direkte fra nettleseren av hvem som helst (action-
  // ID-en ligger i klient-bundelen til SalesFlyerView). Med service-klienten
  // over finnes ingen RLS som fanger det, så staff-statusen sjekkes her,
  // server-side. Ikke-staff faller stille tilbake til kun publiserte flyers.
  const allowDraft = includeDraft ? (await getAuthenticatedStaffUser()).ok : false
  const supabase = createServiceClient()
  let query = supabase.from('sales_flyers').select('*').eq('slug', slug)
  if (!allowDraft) query = query.eq('published', true)
  const { data: flyer, error } = await query.maybeSingle()
  if (error || !flyer) {
    if (error) console.error('getSalesFlyerBySlug:', error)
    return null
  }
  const [cases, packages, referenceLinks] = await Promise.all([
    getOrderedCases(flyer.id),
    getOrderedPackages(flyer.id),
    getOrderedReferenceLinks(flyer.id),
  ])
  return { ...(flyer as SalesFlyer), cases, packages, referenceLinks }
}

async function getOrderedReferenceLinks(flyerId: string): Promise<SalesFlyerReferenceLink[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('sales_flyer_reference_links')
    .select('*')
    .eq('flyer_id', flyerId)
    .order('order_index', { ascending: true })
  if (error) {
    console.error('getOrderedReferenceLinks:', error)
    return []
  }
  return (data ?? []) as SalesFlyerReferenceLink[]
}

async function getOrderedCases(flyerId: string): Promise<(CaseStudy & { order_index: number })[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('sales_flyer_cases')
    .select('order_index, case_studies (*)')
    .eq('flyer_id', flyerId)
    .order('order_index', { ascending: true })
  if (error) {
    console.error('getOrderedCases:', error)
    return []
  }
  const rows = (data ?? []) as unknown as { order_index: number; case_studies: CaseStudy | null }[]
  return rows
    .filter((row): row is { order_index: number; case_studies: CaseStudy } => row.case_studies !== null)
    .map(row => ({ ...row.case_studies, order_index: row.order_index }))
}

async function getOrderedPackages(flyerId: string): Promise<SalesFlyerPackageItem[]> {
  const supabase = createServiceClient()
  // quote_data hentes KUN for å beregne amount under — den selve forblir
  // internt i denne funksjonen og går aldri ut til kalleren/klienten.
  const { data, error } = await supabase
    .from('sales_flyer_packages')
    .select('id, order_index, quote_id, quotes (package_label, package_category, quote_data)')
    .eq('flyer_id', flyerId)
    .order('order_index', { ascending: true })
  if (error) {
    console.error('getOrderedPackages:', error)
    return []
  }
  type Row = {
    id: string
    order_index: number
    quote_id: string
    quotes: { package_label: string | null; package_category: SalesFlyerPackageCategory | null; quote_data: unknown } | null
  }
  const rows = (data ?? []) as unknown as Row[]
  // Samme defensive filter som listPackageTemplateQuotes: package_category
  // (og dermed package_label) er nullbar i DB uavhengig av koblingen her —
  // en pakke uten kategori kan ikke plasseres i noen fane og utelates.
  const packages = rows
    .filter((row): row is Row & { quotes: { package_label: string; package_category: SalesFlyerPackageCategory; quote_data: unknown } } =>
      row.quotes !== null && row.quotes.package_label !== null && row.quotes.package_category !== null
    )
    .map(row => ({
      id: row.id,
      order_index: row.order_index,
      quote_id: row.quote_id,
      package_label: row.quotes.package_label,
      package_category: row.quotes.package_category,
      amount: getQuoteAmountExclVat(row.quotes.quote_data) ?? 0,
      deliverableCounts: getPackageDeliverableCounts(row.quotes.quote_data),
    }))

  // Separat oppslag (ikke et embed over) fordi quote_package_showcase_items
  // har en annen kardinalitet (0-mange pr. quote) enn quotes-embedet over, og
  // fordi batch-henting via .in() på quote_id-listen er billigere enn ett
  // PostgREST-embed pr. pakke.
  const showcaseByQuoteId = await getShowcaseItemsByFlyerAndQuoteId(flyerId, packages.map(p => p.quote_id))
  return packages.map(p => ({ ...p, showcaseItems: showcaseByQuoteId.get(p.quote_id) ?? [] }))
}

// quote_package_showcase_items har ingen public/anon-policy (kun staff, se
// migrasjon 193) — samme autorisasjonsbegrunnelse som resten av denne filen
// for quotes/quote_data: en publisert flyer er anonymt besøkt, og uten
// service-klienten her ville RLS stille nullet ut eksempelmedia for alle
// ekte besøkende. Scopet på flyer_id i tillegg til quote_id (migrasjon 194)
// — samme pakke kan nå vise forskjellig eksempelmedia på to ulike flyers.
async function getShowcaseItemsByFlyerAndQuoteId(flyerId: string, quoteIds: string[]): Promise<Map<string, QuotePackageShowcaseItem[]>> {
  const map = new Map<string, QuotePackageShowcaseItem[]>()
  if (quoteIds.length === 0) return map
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('quote_package_showcase_items')
    .select('*')
    .eq('flyer_id', flyerId)
    .in('quote_id', quoteIds)
    .order('kind', { ascending: true })
    .order('order_index', { ascending: true })
  if (error) {
    console.error('getShowcaseItemsByFlyerAndQuoteId:', error)
    return map
  }
  for (const row of (data ?? []) as QuotePackageShowcaseItem[]) {
    const existing = map.get(row.quote_id)
    if (existing) existing.push(row)
    else map.set(row.quote_id, [row])
  }
  return map
}

// Standard sitat-tekst for en ny flyer — en hilsen fra Leafilms, vist i
// anførselstegn (se SalesFlyerView). Satt som verdi ved opprettelse, ikke
// som DB-kolonnedefault, siden dette er redigerbar markedstekst som kan
// endres over tid, ikke en strukturell standardverdi.
const DEFAULT_ENGAGEMENT_TEXT = 'Vi tror på innhold som rører — som får folk til å stoppe opp, føle noe, og huske det.'

export async function createSalesFlyer(slug: string): Promise<{ id: string } | { error: string }> {
  const trimmed = slug.trim().toLowerCase()
  const validationError = validateSlug(trimmed)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sales_flyers')
    .insert({ slug: trimmed, published: false, engagement_text: DEFAULT_ENGAGEMENT_TEXT })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: `Slugen "${trimmed}" er allerede i bruk` }
    console.error('createSalesFlyer:', error)
    return { error: 'Kunne ikke opprette flyeren' }
  }
  return { id: data.id }
}

export type SalesFlyerUpdate = Partial<Omit<SalesFlyer, 'id' | 'slug' | 'created_at' | 'updated_at' | 'updated_by'>>

export async function updateSalesFlyer(id: string, fields: SalesFlyerUpdate): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // .select() + bekreft at raden faktisk ble truffet — uten dette rapporterer
  // Supabase "ok" (ingen error) selv om RLS stille filtrerte bort raden eller
  // den var slettet i mellomtiden, og editoren ville trodd endringen var
  // lagret når den aldri nådde databasen (samme mønster som
  // updateIndustryLandingPage).
  const { data, error } = await supabase
    .from('sales_flyers')
    .update({ ...fields, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
    .eq('id', id)
    .select('id')

  if (error) {
    console.error('updateSalesFlyer:', error)
    return { error: 'Kunne ikke lagre endringene' }
  }
  if (!data || data.length === 0) {
    return { error: 'Flyeren finnes ikke lenger, eller du har ikke tilgang' }
  }
  return { ok: true }
}

// Erstatter hele case-listen i riktig rekkefølge via replace_sales_flyer_cases
// (migrasjon 191) — én atomisk RPC i stedet for separate delete+insert-kall,
// som kunne la flyeren stå igjen med en tom case-liste hvis noe feilet mellom dem.
export async function setSalesFlyerCases(flyerId: string, caseStudyIds: string[]): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('replace_sales_flyer_cases', {
    p_flyer_id: flyerId,
    p_case_study_ids: caseStudyIds,
  })
  if (error) {
    console.error('setSalesFlyerCases:', error)
    return { error: 'Kunne ikke oppdatere case-listen' }
  }
  return { ok: true }
}

// Samme atomiske mønster for pakke-listen (quote-id-er) via
// replace_sales_flyer_packages (migrasjon 191).
export async function setSalesFlyerPackages(flyerId: string, quoteIds: string[]): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('replace_sales_flyer_packages', {
    p_flyer_id: flyerId,
    p_quote_ids: quoteIds,
  })
  if (error) {
    console.error('setSalesFlyerPackages:', error)
    return { error: 'Kunne ikke oppdatere pakke-listen' }
  }
  return { ok: true }
}

// Samme atomiske mønster som setSalesFlyerCases/setSalesFlyerPackages, men
// via replace_sales_flyer_reference_links (migrasjon 194) — lenkene er
// fritekst (navn + URL), ikke referanse-id-er inn mot en annen tabell, så
// RPC-en tar et jsonb-array og regenererer radene (inkl. id) fra bunnen.
export async function setSalesFlyerReferenceLinks(
  flyerId: string,
  links: { label: string; url: string }[]
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('replace_sales_flyer_reference_links', {
    p_flyer_id: flyerId,
    p_links: links,
  })
  if (error) {
    console.error('setSalesFlyerReferenceLinks:', error)
    return { error: 'Kunne ikke oppdatere referanselenkene' }
  }
  return { ok: true }
}

export async function deleteSalesFlyer(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('sales_flyers').delete().eq('id', id)
  if (error) {
    console.error('deleteSalesFlyer:', error)
    return { error: 'Kunne ikke slette flyeren' }
  }
  return { ok: true }
}

// Kopierer et valgt biblioteksbilde (images-tabellen) til flyerens eget
// lagringsområde i stedet for å lagre en levende referanse — samme grunn som
// copyLibraryImageToPage: /admin/images sletter det underliggende
// storage-objektet når et biblioteksbilde slettes, uavhengig av flyeren.
export async function copyLibraryImageToFlyer(
  slug: string,
  imageId: string,
  field: 'hero_poster' | 'bts_image_1' | 'bts_image_2' |
    'example_image_1' | 'example_image_2' | 'example_image_3' | 'example_image_4' |
    'example_image_5' | 'example_image_6' | 'example_image_7' | 'example_image_8'
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()

  const { data: image, error: imageError } = await supabase
    .from('images')
    .select('file_path')
    .eq('id', imageId)
    .maybeSingle()
  if (imageError || !image) {
    console.error('copyLibraryImageToFlyer lookup:', imageError)
    return { error: 'Fant ikke bildet' }
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from('assets').download(image.file_path)
  if (downloadError || !fileBlob) {
    console.error('copyLibraryImageToFlyer download:', downloadError)
    return { error: 'Kunne ikke laste ned bildet' }
  }

  const ext = image.file_path.split('.').pop() ?? 'jpg'
  const destPath = `sales-flyers/${slug}/${field}-${Math.random().toString(36).substring(2)}.${ext}`

  const { error: uploadError } = await supabase.storage.from('assets').upload(destPath, fileBlob, {
    contentType: fileBlob.type || 'image/jpeg',
  })
  if (uploadError) {
    console.error('copyLibraryImageToFlyer upload:', uploadError)
    return { error: 'Kunne ikke kopiere bildet' }
  }

  const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(destPath)
  return { url: publicUrl }
}

// Samme kopier-ikke-referer-begrunnelse som copyLibraryImageToFlyer over:
// /admin/videos sletter det underliggende storage-objektet når en video
// slettes fra biblioteket, så en levende referanse ville kunne brekke en
// publisert flyers hero uten varsel.
export async function copyLibraryVideoToFlyer(
  slug: string,
  videoId: string,
  field: 'hero_video'
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()

  const { data: video, error: videoError } = await supabase
    .from('video_library')
    .select('file_path')
    .eq('id', videoId)
    .maybeSingle()
  if (videoError || !video) {
    console.error('copyLibraryVideoToFlyer lookup:', videoError)
    return { error: 'Fant ikke videoen' }
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from('assets').download(video.file_path)
  if (downloadError || !fileBlob) {
    console.error('copyLibraryVideoToFlyer download:', downloadError)
    return { error: 'Kunne ikke laste ned videoen' }
  }

  const ext = video.file_path.split('.').pop() ?? 'mp4'
  const destPath = `sales-flyers/${slug}/${field}-${Math.random().toString(36).substring(2)}.${ext}`

  const { error: uploadError } = await supabase.storage.from('assets').upload(destPath, fileBlob, {
    contentType: fileBlob.type || 'video/mp4',
  })
  if (uploadError) {
    console.error('copyLibraryVideoToFlyer upload:', uploadError)
    return { error: 'Kunne ikke kopiere videoen' }
  }

  const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(destPath)
  return { url: publicUrl }
}
