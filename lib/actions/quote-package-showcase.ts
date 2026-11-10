'use server'

import { createClient } from '@/lib/supabase-server'
import { QuotePackageShowcaseItem, QuotePackageShowcaseKind } from '@/lib/types'

// Kopierer et valgt biblioteksbilde (images-tabellen) til pakkens eget
// lagringsområde i stedet for å lagre en levende referanse — samme grunn som
// copyLibraryImageToFlyer/copyLibraryImageToPage: /admin/images sletter det
// underliggende storage-objektet når et biblioteksbilde slettes, uavhengig
// av pakke-visningen.
export async function copyLibraryImageToQuotePackage(
  flyerId: string,
  quoteId: string,
  imageId: string,
  kind: 'photo' | 'social_clip' | 'website_photo'
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()

  const { data: image, error: imageError } = await supabase
    .from('images')
    .select('file_path')
    .eq('id', imageId)
    .maybeSingle()
  if (imageError || !image) {
    console.error('copyLibraryImageToQuotePackage lookup:', imageError)
    return { error: 'Fant ikke bildet' }
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from('assets').download(image.file_path)
  if (downloadError || !fileBlob) {
    console.error('copyLibraryImageToQuotePackage download:', downloadError)
    return { error: 'Kunne ikke laste ned bildet' }
  }

  const ext = image.file_path.split('.').pop() ?? 'jpg'
  const destPath = `quote-packages/${flyerId}/${quoteId}/${kind}-${Math.random().toString(36).substring(2)}.${ext}`

  const { error: uploadError } = await supabase.storage.from('assets').upload(destPath, fileBlob, {
    contentType: fileBlob.type || 'image/jpeg',
  })
  if (uploadError) {
    console.error('copyLibraryImageToQuotePackage upload:', uploadError)
    return { error: 'Kunne ikke kopiere bildet' }
  }

  const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(destPath)
  return { url: publicUrl }
}

// Samme kopi-mønster for video_library-rader.
export async function copyLibraryVideoToQuotePackage(
  flyerId: string,
  quoteId: string,
  videoId: string,
  kind: 'main_video' | 'social_clip'
): Promise<{ url: string } | { error: string }> {
  const supabase = await createClient()

  const { data: video, error: videoError } = await supabase
    .from('video_library')
    .select('file_path')
    .eq('id', videoId)
    .maybeSingle()
  if (videoError || !video) {
    console.error('copyLibraryVideoToQuotePackage lookup:', videoError)
    return { error: 'Fant ikke videoen' }
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage.from('assets').download(video.file_path)
  if (downloadError || !fileBlob) {
    console.error('copyLibraryVideoToQuotePackage download:', downloadError)
    return { error: 'Kunne ikke laste ned videoen' }
  }

  const ext = video.file_path.split('.').pop() ?? 'mp4'
  const destPath = `quote-packages/${flyerId}/${quoteId}/${kind}-${Math.random().toString(36).substring(2)}.${ext}`

  const { error: uploadError } = await supabase.storage.from('assets').upload(destPath, fileBlob, {
    contentType: fileBlob.type || 'video/mp4',
  })
  if (uploadError) {
    console.error('copyLibraryVideoToQuotePackage upload:', uploadError)
    return { error: 'Kunne ikke kopiere videoen' }
  }

  const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(destPath)
  return { url: publicUrl }
}

export async function listQuotePackageShowcaseItems(flyerId: string, quoteId: string): Promise<QuotePackageShowcaseItem[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('quote_package_showcase_items')
    .select('*')
    .eq('flyer_id', flyerId)
    .eq('quote_id', quoteId)
    .order('kind')
    .order('order_index')
  if (error) {
    console.error('listQuotePackageShowcaseItems:', error)
    return []
  }
  return (data ?? []) as QuotePackageShowcaseItem[]
}

// Erstatter hele vareliste-fanen (main_video/social_clip/photo) for en pakke
// atomisk via replace_quote_package_showcase_items (migrasjon 193) — samme
// mønster som setSalesFlyerCases/setSalesFlyerPackages.
export async function setQuotePackageShowcaseItems(
  flyerId: string,
  quoteId: string,
  kind: QuotePackageShowcaseKind,
  items: { media_type: 'image' | 'video'; path: string; caption?: string | null }[]
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('replace_quote_package_showcase_items', {
    p_quote_id: quoteId,
    p_flyer_id: flyerId,
    p_kind: kind,
    p_items: items,
  })
  if (error) {
    console.error('setQuotePackageShowcaseItems:', error)
    return { error: 'Kunne ikke oppdatere eksempelmedia' }
  }
  return { ok: true }
}
