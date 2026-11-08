'use server'

import { createClient } from '@/lib/supabase-server'
import { IndustryLandingPage, CaseStudy } from '@/lib/types'
import { validateSlug } from '@/lib/industry-landing-pages'

export type IndustryLandingPageWithCases = IndustryLandingPage & {
  cases: (CaseStudy & { order_index: number })[]
}

export async function listIndustryLandingPages(): Promise<IndustryLandingPage[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('industry_landing_pages')
    .select('*')
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('listIndustryLandingPages:', error)
    return []
  }
  return (data ?? []) as IndustryLandingPage[]
}

// Brukes av den offentlige ruten (app/(marketing)/[slug]/page.tsx).
// includeDraft=true lar innlogget staff forhåndsvise en upublisert side.
export async function getIndustryLandingPageBySlug(
  slug: string,
  { includeDraft = false }: { includeDraft?: boolean } = {}
): Promise<IndustryLandingPageWithCases | null> {
  const supabase = await createClient()
  let query = supabase.from('industry_landing_pages').select('*').eq('slug', slug)
  if (!includeDraft) query = query.eq('published', true)
  const { data: page, error } = await query.maybeSingle()
  if (error || !page) {
    if (error) console.error('getIndustryLandingPageBySlug:', error)
    return null
  }
  return { ...(page as IndustryLandingPage), cases: await getOrderedCases(page.id) }
}

async function getOrderedCases(pageId: string): Promise<(CaseStudy & { order_index: number })[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('industry_landing_page_cases')
    .select('order_index, case_studies (*)')
    .eq('page_id', pageId)
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

export async function createIndustryLandingPage(slug: string): Promise<{ id: string } | { error: string }> {
  const trimmed = slug.trim().toLowerCase()
  const validationError = validateSlug(trimmed)
  if (validationError) return { error: validationError }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('industry_landing_pages')
    .insert({ slug: trimmed, published: false })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: `Slugen "${trimmed}" er allerede i bruk` }
    console.error('createIndustryLandingPage:', error)
    return { error: 'Kunne ikke opprette siden' }
  }
  return { id: data.id }
}

export type IndustryLandingPageUpdate = Partial<Omit<IndustryLandingPage, 'id' | 'slug' | 'created_at' | 'updated_at' | 'updated_by'>>

export async function updateIndustryLandingPage(id: string, fields: IndustryLandingPageUpdate): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // .select() + bekreft at raden faktisk ble truffet — uten dette rapporterer
  // Supabase "ok" (ingen error) selv om RLS stille filtrerte bort raden eller
  // den var slettet i mellomtiden, og editoren ville trodd endringen var
  // lagret når den aldri nådde databasen (funnet under Codex-inspeksjon).
  const { data, error } = await supabase
    .from('industry_landing_pages')
    .update({ ...fields, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
    .eq('id', id)
    .select('id')

  if (error) {
    console.error('updateIndustryLandingPage:', error)
    return { error: 'Kunne ikke lagre endringene' }
  }
  if (!data || data.length === 0) {
    return { error: 'Siden finnes ikke lenger, eller du har ikke tilgang' }
  }
  return { ok: true }
}

// Erstatter hele case-listen i riktig rekkefølge via replace_landing_page_cases
// (migrasjon 175) — én atomisk RPC i stedet for separate delete+insert-kall,
// som kunne la siden stå igjen med en tom case-liste hvis noe feilet mellom dem.
export async function setIndustryLandingPageCases(pageId: string, caseStudyIds: string[]): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('replace_landing_page_cases', {
    p_page_id: pageId,
    p_case_study_ids: caseStudyIds,
  })
  if (error) {
    console.error('setIndustryLandingPageCases:', error)
    return { error: 'Kunne ikke oppdatere case-listen' }
  }
  return { ok: true }
}

export async function deleteIndustryLandingPage(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('industry_landing_pages').delete().eq('id', id)
  if (error) {
    console.error('deleteIndustryLandingPage:', error)
    return { error: 'Kunne ikke slette siden' }
  }
  return { ok: true }
}

// Kopierer et valgt biblioteksbilde (images-tabellen) til sidens eget
// lagringsområde i stedet for å lagre en levende referanse — se
// docs/superpowers/specs/2026-10-21-industry-landing-pages-cms-design.md
// ("Bildevalg via ImagePickerModal kopierer, refererer ikke") for hvorfor:
// /admin/images sletter det underliggende storage-objektet når et
// biblioteksbilde slettes, uavhengig av landingssiden.
export async function copyLibraryImageToPage(
  slug: string,
  imageId: string,
  field: 'hero_poster' | 'about'
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()

  const { data: image, error: imageError } = await supabase
    .from('images')
    .select('file_path')
    .eq('id', imageId)
    .maybeSingle()
  if (imageError || !image) {
    console.error('copyLibraryImageToPage lookup:', imageError)
    return { error: 'Fant ikke bildet' }
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from('assets').download(image.file_path)
  if (downloadError || !fileBlob) {
    console.error('copyLibraryImageToPage download:', downloadError)
    return { error: 'Kunne ikke laste ned bildet' }
  }

  const ext = image.file_path.split('.').pop() ?? 'jpg'
  const destPath = `landing-pages/${slug}/${field}-${Math.random().toString(36).substring(2)}.${ext}`

  const { error: uploadError } = await supabase.storage.from('assets').upload(destPath, fileBlob, {
    contentType: fileBlob.type || 'image/jpeg',
  })
  if (uploadError) {
    console.error('copyLibraryImageToPage upload:', uploadError)
    return { error: 'Kunne ikke kopiere bildet' }
  }

  const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(destPath)
  return { url: publicUrl }
}
