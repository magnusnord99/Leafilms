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

export const metadata: Metadata = {
  title: 'Leafilms for energibransjen',
  description: 'Film og foto for norske energiselskaper, fra Leafilms.',
  robots: { index: false, follow: false },
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
