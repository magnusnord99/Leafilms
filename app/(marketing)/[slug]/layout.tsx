import type { Metadata } from 'next'
import { MarketingChrome } from '@/components/marketing/MarketingChrome'
import { getIndustryLandingPageBySlug } from '@/lib/actions/industry-landing-pages'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const page = await getIndustryLandingPageBySlug(slug, { includeDraft: true })

  const title = page?.meta_title || 'Leafilms'
  const description = page?.meta_description || ''
  // Poster/fallback-bildet finnes uansett hero_type — ikke pikselidentisk med
  // en dedikert OG-beskjæring, men et reelt delingsbilde i stedet for ingen
  // (funnet under Codex-inspeksjon: /energi mistet delingsbildet sitt helt
  // uten dette).
  const ogImage = page?.hero_poster_path

  return {
    metadataBase: new URL('https://app.leafilms.no'),
    title,
    description,
    // Oppsøkende bransjesider — ikke ment for søkemotorer, samme som
    // app/energi/layout.tsx har hatt siden starten.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: `/${slug}`,
      siteName: 'Leafilms',
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      locale: 'nb_NO',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  }
}

export default function MarketingSlugLayout({ children }: { children: React.ReactNode }) {
  return <MarketingChrome>{children}</MarketingChrome>
}
