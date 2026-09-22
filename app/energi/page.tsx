import { HeroVideo } from './HeroVideo'

const HERO_VIDEO_URL = '/energi/hero.mp4'

const italicSerif = { fontFamily: 'var(--font-newsreader)', fontStyle: 'italic' as const }

export default function EnergiPage() {
  return (
    <main className="bg-[#ffffff] text-[#1A1812]">
      {/* Hero */}
      <section className="relative h-screen min-h-[640px] w-full bg-[#ffffff] px-6 md:px-12">
        <div className="relative h-full w-full overflow-hidden bg-[#16140F]">
          <HeroVideo src={HERO_VIDEO_URL} poster="/energi/hero-poster.jpg" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />

          <div className="relative z-10 flex h-full flex-col justify-between px-6 py-8 md:px-8 md:py-10">
            <p className="text-sm font-semibold tracking-[0.08em] text-[#ffffff]">LEAFILMS</p>

            <div className="max-w-3xl">
              <h1 className="text-4xl font-bold leading-[1.05] text-[#ffffff] sm:text-5xl md:text-7xl">
                Vi filmer selskapene som holder Norge i gang.
              </h1>
            </div>
          </div>
        </div>
      </section>

      {/* Lede */}
      <section className="px-6 pt-16 md:px-12 md:pt-24">
        <p className="max-w-2xl text-2xl font-semibold leading-snug sm:text-3xl md:text-4xl">
          Corvus Energy og Statkraft har allerede vist fram arbeidet sitt gjennom oss.
        </p>
      </section>

      {/* Corvus Energy — hovedcase, i full bredde */}
      <section className="px-6 pt-12 md:px-12 md:pt-16">
        <a
          href="https://vimeo.com/1099950470"
          target="_blank"
          rel="noopener noreferrer"
          className="group block"
        >
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#EDEAE2] md:aspect-[21/9]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/9canbsqkrr7.jpg"
              alt="Corvus Energy"
              loading="eager"
              fetchPriority="high"
              className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]"
            />
          </div>
          <div className="mt-6 flex flex-col gap-2 md:flex-row md:items-baseline md:justify-between">
            <h2 className="text-3xl font-bold sm:text-4xl">Corvus Energy</h2>
            <p className="text-lg text-[#6B675E] md:max-w-md md:text-right">
              Se hvordan Corvus Energy er med på å forme en bærekraftig fremtid.
            </p>
          </div>
        </a>
      </section>

      {/* Statkraft — mindre, forskjøvet */}
      <section className="px-6 py-16 md:px-12 md:py-24">
        <a
          href="https://vimeo.com/1067543661"
          target="_blank"
          rel="noopener noreferrer"
          className="group block md:ml-[22%]"
        >
          <div className="relative aspect-video w-full max-w-2xl overflow-hidden bg-[#EDEAE2]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://fmwcrgfxmlgfnsinnuyy.supabase.co/storage/v1/object/public/assets/case-thumbnails/bh01qupcagl.jpg"
              alt="Statkraft"
              loading="lazy"
              className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]"
            />
          </div>
          <div className="mt-5 max-w-2xl">
            <h2 className="text-3xl font-bold sm:text-4xl">Statkraft</h2>
            <p className="mt-2 text-lg text-[#6B675E]">Ullaførre er Norges største vannkraftområde.</p>
          </div>
        </a>

        <a
          href="/energi/arbeid"
          className="mt-10 inline-block border-b border-[#1A1812] pb-0.5 text-base font-medium md:ml-[22%]"
        >
          Se mer av arbeidet vårt
        </a>
      </section>

      {/* Løpende tekst: hvorfor oss, hva vi tilbyr, resultater — i én bevegelse */}
      <section className="border-t border-[#EDEAE2] px-6 py-20 md:px-12 md:py-28">
        <div className="max-w-2xl text-lg leading-relaxed text-[#3A372F] md:text-xl">
          <p>
            Vi kjenner industrien. Teamet har vært på anlegg, i produksjonshaller og på
            byggeplasser i hele landet, og vet hva som kreves av HMS-kurs og sikkerhetsrutiner før
            kamera i det hele tatt kommer fram. Et kraftverk eller en batterifabrikk er ikke
            selvforklarende — jobben vår er å gjøre prosessene forståelige og visuelt
            interessante, for kunder, investorer og fremtidige ansatte. Det gir resultater:
            kampanjer med film har gitt kundene våre over 140 % mer trafikk til landingssiden, og
            fire ganger høyere engasjement enn et vanlig tekstinnlegg.
          </p>
        </div>

        <div className="my-16 md:my-24">
          <p className="text-[5rem] font-bold leading-none text-[#B8641F] sm:text-[7rem] md:text-[9rem]">
            18
          </p>
          <p className="mt-2 max-w-xs text-lg text-[#6B675E]">
            ferdige klipp hentet ut av én produksjonsdag for Corvus Energy.
          </p>
        </div>

        <div className="max-w-2xl text-lg leading-relaxed text-[#3A372F] md:text-xl">
          <p>
            Vi leverer både video — merkefilm, reportasjer fra anlegg og prosjekter, dronefilm, og
            korte kutt til sosiale medier og internkommunikasjon — og foto:
            anleggsdokumentasjon, produktbilder, portretter til pressemateriell, og bilder til
            årsrapport og nettside. Fra opptak til ferdig klipp holder vi tidsfristene dere
            faktisk trenger. Én tidligere kunde brukte filmen direkte i et vinnende anbud. I dag
            jobber vi også med Statkraft, Netflix, Breitling, Asics og Vitamin Well.
          </p>
        </div>
      </section>

      {/* Avsluttende CTA */}
      <section className="bg-[#16140F] px-6 py-28 text-[#ffffff] md:px-12 md:py-36">
        <h2 className="max-w-2xl text-4xl font-bold leading-tight sm:text-5xl">
          Klare for å vise fram arbeidet deres?
        </h2>
        <p className="mt-5 max-w-lg text-xl text-[#ffffff]/80" style={italicSerif}>
          Send oss noen ord om prosjektet, så tar vi kontakt for en uforpliktende prat.
        </p>
        <a
          href="mailto:post@leafilms.no?subject=Film%20og%20foto%20for%20oss"
          className="mt-8 inline-block border-b-2 border-[#B8641F] pb-1 text-xl font-semibold"
        >
          post@leafilms.no
        </a>

        <div className="mt-24 flex flex-col gap-2 text-sm text-[#ffffff]/50 md:flex-row md:justify-between">
          <p>Leafilms</p>
          <p>Denne siden er laget for deg — ikke offentlig delt.</p>
        </div>
      </section>
    </main>
  )
}
