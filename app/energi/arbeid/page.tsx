import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tidligere arbeid — Leafilms',
  description: 'Utvalgt arbeid fra Leafilms — film og foto for merkevarer, arrangementer og industri.',
  openGraph: {
    title: 'Tidligere arbeid — Leafilms',
    description: 'Utvalgt arbeid fra Leafilms — film og foto for merkevarer, arrangementer og industri.',
    url: '/energi/arbeid',
  },
}

type Case = {
  title: string
  description: string
  thumbnail: string
  vimeoUrl: string
  tag?: string
}

const CASES: Case[] = [
  {
    title: 'Vitamin Well — Løp for Meg',
    description: 'Barnekreftforeningen i samarbeid med Vitamin Well og Jakob Ingebrigtsen.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/9nuf9g7szza.png',
    vimeoUrl: 'https://vimeo.com/1069413027',
    tag: 'Event · Sport',
  },
  {
    title: 'Julie Bergan',
    description: 'Konsert med Julie Bergan.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/f7yoo1gu2c.png',
    vimeoUrl: 'https://vimeo.com/1205423135',
  },
  {
    title: 'Øya',
    description: 'Dokumentasjon av Øyafestivalen med Brusjan film.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/rqnmrilla5c.png',
    vimeoUrl: 'https://vimeo.com/1205435855',
  },
  {
    title: 'Kurt Nilsen',
    description: 'Studiosesjon med Kurt Nilsen.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/vayxk5ykoxa.png',
    vimeoUrl: 'https://vimeo.com/1205426025',
  },
  {
    title: 'Scandinavian Edition',
    description: 'Luca og Joacim representerer SE når de surfer rundt om i verden.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/uz12z83ve6.png',
    vimeoUrl: 'https://vimeo.com/1055881233',
    tag: 'Sport · Fashion',
  },
  {
    title: 'Compax',
    description: 'Compax tilbyr ny teknologi for avfallshåndtering — Leafilms dokumenterer.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/qe8b2cuwec.png',
    vimeoUrl: 'https://vimeo.com/1067571851',
    tag: 'Commercial · Technology',
  },
  {
    title: 'CCM x Torsov',
    description: 'Lansering av ny skøyte for CCM.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/qxvhmdhk8l9.png',
    vimeoUrl: 'https://vimeo.com/1184865168',
  },
  {
    title: 'Toast',
    description: 'Toast lanserte sitt nye navn med en fest — vi fanget øyeblikkene.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/drvfdr1m80p.png',
    vimeoUrl: 'https://vimeo.com/1184860075',
  },
  {
    title: 'Statkraft',
    description: 'Ullaførre er Norges største vannkraftområde.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/bh01qupcagl.jpg',
    vimeoUrl: 'https://vimeo.com/1067543661',
  },
  {
    title: 'Corvus Energy',
    description: 'Se hvordan Corvus Energy er med på å forme en bærekraftig fremtid.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/9canbsqkrr7.jpg',
    vimeoUrl: 'https://vimeo.com/1099950470',
    tag: 'Commercial · Corporate',
  },
  {
    title: 'Asics Blummenfelt',
    description: 'Kristian Blummenfelt i trening mot nye mål.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/vs1tk28z6z.jpg',
    vimeoUrl: 'https://vimeo.com/1069853156',
    tag: 'Commercial',
  },
  {
    title: 'Coma Retreats',
    description: 'Pilates retreat, hovedfilm fra Frankrike.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/yf5dwt9dr3i.jpg',
    vimeoUrl: 'https://vimeo.com/1028888267',
    tag: 'Commercial',
  },
  {
    title: 'Breitling',
    description: 'Breitling i aktivitet i vann og fjell i Lyngsalpene.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/b8gzdomvkhg.jpg',
    vimeoUrl: 'https://vimeo.com/1108249207',
    tag: 'Commercial · Product',
  },
  {
    title: 'Netflix',
    description: 'Netflix lanserte kommende nyheter og fremhevet suksessserier — Leafilms dokumenterte.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/g2f0ts2yx88.jpg',
    vimeoUrl: 'https://vimeo.com/949890462',
    tag: 'Event · Corporate',
  },
  {
    title: 'Vitamin Well',
    description: 'Casper Ruud trener mot nye mål og turneringer, med Vitamin Well på veien.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/phvm1gj0zr.png',
    vimeoUrl: 'https://vimeo.com/1121820406',
    tag: 'Commercial · Sport',
  },
  {
    title: 'Aker Brygge',
    description: 'Aker Brygge klare for en ny sommersesong.',
    thumbnail:
      'https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/7wpnooqzh5b.jpg',
    vimeoUrl: 'https://vimeo.com/1069414695',
    tag: 'Event · Commercial',
  },
]

const LEFT = CASES.filter((_, i) => i % 2 === 0)
const RIGHT = CASES.filter((_, i) => i % 2 === 1)

function CaseCard({ c, priority = false }: { c: Case; priority?: boolean }) {
  return (
    <a
      href={c.vimeoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group mb-16 block last:mb-0"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[#EDEAE2]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={c.thumbnail}
          alt={c.title}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          decoding={priority ? 'sync' : 'async'}
          className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
        />
      </div>
      <div className="mt-4">
        {c.tag && <p className="text-xs font-medium tracking-[0.08em] text-[#6B675E]">{c.tag}</p>}
        <h3 className="mt-1 text-2xl font-bold sm:text-3xl">{c.title}</h3>
        <p className="mt-1 text-lg text-[#4A473F]">{c.description}</p>
      </div>
    </a>
  )
}

export default function EnergiArbeidPage() {
  return (
    <main className="bg-[#ffffff] text-[#1A1812]">
      <header className="px-6 pt-8 md:px-12 md:pt-10">
        <a href="/energi" className="text-sm text-[#6B675E] hover:text-[#1A1812]">
          Leafilms for energibransjen
        </a>
        <p className="mt-10 text-sm text-[#6B675E]">Utvalgt arbeid · {CASES.length} filmer</p>
      </header>

      <section className="px-6 py-12 md:px-12 md:py-16">
        <div className="grid gap-16 md:grid-cols-2 md:gap-10">
          <div>
            {LEFT.map((c, i) => (
              <CaseCard key={c.title} c={c} priority={i === 0} />
            ))}
          </div>
          <div className="md:mt-28">
            {RIGHT.map((c, i) => (
              <CaseCard key={c.title} c={c} priority={i === 0} />
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#16140F] px-6 py-24 text-[#ffffff] md:px-12 md:py-32">
        <h2 className="max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">
          Klare for å vise fram arbeidet deres?
        </h2>
        <a
          href="mailto:post@leafilms.no?subject=Film%20og%20foto%20for%20oss"
          className="mt-6 inline-block border-b-2 border-[#B8641F] pb-1 text-xl font-semibold"
        >
          post@leafilms.no
        </a>
      </section>
    </main>
  )
}
