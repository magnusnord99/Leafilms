import type { Metadata } from 'next'
import { Schibsted_Grotesk, Newsreader } from 'next/font/google'
import { EnergiBodyClass } from './EnergiBodyClass'
import { SmoothScroll } from './SmoothScroll'

const schibsted = Schibsted_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-schibsted',
  display: 'swap',
})

const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['italic'],
  variable: '--font-newsreader',
  display: 'swap',
})

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
  return (
    <div className={`${schibsted.variable} ${newsreader.variable}`} style={{ fontFamily: 'var(--font-schibsted)' }}>
      <EnergiBodyClass />
      <SmoothScroll />
      {children}
    </div>
  )
}
