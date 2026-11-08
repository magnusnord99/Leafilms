import type { Metadata } from 'next'
import { MarketingChrome } from '@/components/marketing/MarketingChrome'

// /energi selv flyttet til den DB-drevne ruten app/(marketing)/[slug]/ (se
// docs/superpowers/specs/2026-10-21-industry-landing-pages-cms-design.md).
// Denne layouten lever videre kun for /energi/arbeid, som ikke er del av
// den migreringen — samme felles fonter/robots-metadata som før (arbeid sin
// egen metadata overstyrer title/description/openGraph, robots arver den
// herfra, uendret).
const title = 'Leafilms for energibransjen'
const description = 'Film og foto for norske energiselskaper, fra Leafilms.'

export const metadata: Metadata = {
  metadataBase: new URL('https://app.leafilms.no'),
  title,
  description,
  robots: { index: false, follow: false },
  openGraph: {
    title,
    description,
    url: '/energi',
    siteName: 'Leafilms',
    images: [{ url: '/energi/hero-og.jpg', width: 1200, height: 630 }],
    locale: 'nb_NO',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/energi/hero-og.jpg'],
  },
}

export default function EnergiLayout({ children }: { children: React.ReactNode }) {
  return <MarketingChrome>{children}</MarketingChrome>
}
