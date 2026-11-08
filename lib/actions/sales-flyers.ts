'use server'

import { createClient, createServiceClient } from '@/lib/supabase-server'
import { SalesFlyer, CaseStudy, Quote } from '@/lib/types'
import { validateSlug } from '@/lib/industry-landing-pages'

export type SalesFlyerWithRelations = SalesFlyer & {
  cases: (CaseStudy & { order_index: number })[]
  packages: { id: string; order_index: number; quote: Quote }[]
}

export async function listSalesFlyers(): Promise<SalesFlyer[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sales_flyers')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('listSalesFlyers:', error)
    return []
  }
  return (data ?? []) as SalesFlyer[]
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
  const supabase = createServiceClient()
  let query = supabase.from('sales_flyers').select('*').eq('slug', slug)
  if (!includeDraft) query = query.eq('published', true)
  const { data: flyer, error } = await query.maybeSingle()
  if (error || !flyer) {
    if (error) console.error('getSalesFlyerBySlug:', error)
    return null
  }
  const [cases, packages] = await Promise.all([
    getOrderedCases(flyer.id),
    getOrderedPackages(flyer.id),
  ])
  return { ...(flyer as SalesFlyer), cases, packages }
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

async function getOrderedPackages(flyerId: string): Promise<{ id: string; order_index: number; quote: Quote }[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('sales_flyer_packages')
    .select('id, order_index, quotes (*)')
    .eq('flyer_id', flyerId)
    .order('order_index', { ascending: true })
  if (error) {
    console.error('getOrderedPackages:', error)
    return []
  }
  const rows = (data ?? []) as unknown as { id: string; order_index: number; quotes: Quote | null }[]
  return rows
    .filter((row): row is { id: string; order_index: number; quotes: Quote } => row.quotes !== null)
    .map(row => ({ id: row.id, order_index: row.order_index, quote: row.quotes }))
}

export async function createSalesFlyer(slug: string): Promise<{ id: string } | { error: string }> {
  const trimmed = slug.trim().toLowerCase()
  const validationError = validateSlug(trimmed)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sales_flyers')
    .insert({ slug: trimmed, published: false })
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
  field: 'hero_poster'
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
