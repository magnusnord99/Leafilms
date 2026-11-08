import type { Metadata } from 'next'
import { getSalesFlyerBySlug } from '@/lib/actions/sales-flyers'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const flyer = await getSalesFlyerBySlug(slug, { includeDraft: true })

  const title = flyer?.meta_title || 'Leafilms'
  const description = flyer?.meta_description || ''
  const ogImage = flyer?.hero_poster_path

  return {
    metadataBase: new URL('https://app.leafilms.no'),
    title,
    description,
    // Flyers deles direkte med mottakere via lenke — ikke ment for søkemotorer,
    // samme mønster som app/(marketing)/[slug]/layout.tsx.
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: `/flyer/${slug}`,
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

export default function SalesFlyerLayout({ children }: { children: React.ReactNode }) {
  return children
}
