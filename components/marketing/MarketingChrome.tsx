import { Schibsted_Grotesk, Newsreader } from 'next/font/google'
import { MarketingBodyClass } from './MarketingBodyClass'
import { SmoothScroll } from './SmoothScroll'

// Delt oppsett for alle bransje-landingssider (/energi, og undersider som
// /energi/arbeid) — fonter, kroppsklasse (demper korn-effekten) og smooth
// scroll. Trukket ut fra app/energi/layout.tsx slik at BÅDE den dynamiske
// ruten (app/(marketing)/[slug]/layout.tsx) og den statiske
// app/energi/layout.tsx (som nå kun wrapper /energi/arbeid) bruker nøyaktig
// samme oppsett, uten duplisering.

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

export function MarketingChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${schibsted.variable} ${newsreader.variable}`} style={{ fontFamily: 'var(--font-schibsted)' }}>
      <MarketingBodyClass />
      <SmoothScroll />
      {children}
    </div>
  )
}
