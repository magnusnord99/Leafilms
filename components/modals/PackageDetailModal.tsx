'use client'

import { useState } from 'react'
import { QuotePackageShowcaseItem } from '@/lib/types'

// Samme cinematiske fargesett som components/sales-flyer/SalesFlyerView.tsx
// (denne modalen er kun montert fra den filen, og vises for anonyme flyer-
// besøkende — ikke admin-lilla, se feedback_palette.md).
const GOLD = '#C49434'
const CREAM = '#E8E1D5'
const MUTED = '#9E9287'
const SUBTLE = '#62594E'
const SURFACE = '#161410'
const BORDER = '#2A261F'
const BLACK = '#0C0B09'

interface PackageDetailModalProps {
  isOpen: boolean
  onClose: () => void
  packageLabel: string
  items: QuotePackageShowcaseItem[]
}

const arrowButtonStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 16,
  background: 'rgba(0,0,0,0.6)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.3)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '1rem',
  lineHeight: 1,
}

// pointer-events-none på strippen + pointer-events-auto kun på knappene —
// videoene her er autoplay/loop uten native kontroller (se under), så dette
// er ikke lenger strengt nødvendig for å unngå å dekke en kontroll-bar, men
// holder likevel resten av mediet klikkbart (f.eks. lenker) utenom knappene.
function CarouselArrows({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-2">
      <button type="button" onClick={onPrev} aria-label="Forrige" className="pointer-events-auto" style={arrowButtonStyle}>
        ‹
      </button>
      <button type="button" onClick={onNext} aria-label="Neste" className="pointer-events-auto" style={arrowButtonStyle}>
        ›
      </button>
    </div>
  )
}

// Rekkefølgen her er bevisst "bakerst til fremst" sett fra array-indeks 0 —
// pos[0] gjelder det FØRSTE bildet som ble valgt, som havner øverst i bunken
// (z-index satt eksplisitt lenger ned, ikke via DOM-rekkefølge).
const STACK_TRANSFORMS = [
  'rotate(0deg) translate(0px, 0px)',
  'rotate(5deg) translate(10px, -6px)',
  'rotate(-6deg) translate(-10px, 8px)',
]

// Bunke med bilder + et synlig antall — kommuniserer volum uten å vise hvert
// bilde enkeltvis. Pakker har sjelden mer enn noen få bilder (se feedback
// 2026-11-10: "jeg kommer aldri til å legge 40 bilder inn her"), så en enkel,
// statisk bunke er nok — ingen egen bla-i-bunken-interaksjon.
function PhotoStack({ photos, size = 150 }: { photos: QuotePackageShowcaseItem[]; size?: number }) {
  if (photos.length === 0) return null
  const visible = photos.slice(0, 3)
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {visible.map((photo, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={photo.id}
          src={photo.path}
          alt=""
          className="absolute inset-0 h-full w-full rounded-[3px] object-cover"
          style={{
            transform: STACK_TRANSFORMS[i] ?? 'none',
            zIndex: visible.length - i,
            boxShadow: '0 8px 20px rgba(0,0,0,0.55)',
            border: `2px solid ${SURFACE}`,
          }}
        />
      ))}
      <div
        className="absolute flex items-center justify-center rounded-full"
        style={{
          bottom: -12,
          right: -12,
          width: 34,
          height: 34,
          background: GOLD,
          color: '#1A1812',
          fontSize: '0.78rem',
          fontWeight: 700,
          fontFamily: 'var(--font-dm-sans)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
          zIndex: visible.length + 1,
        }}
      >
        {photos.length}
      </div>
    </div>
  )
}

// Desktop: hovedvideoen vist som om den var hero-seksjonen på en ekte
// nettside, med egne "nettside-bilder" (website_photo) som innholdsrader
// under — adresserer "lite forklarende" (feedback 2026-11-10): man ser
// umiddelbart hva videoen faktisk brukes til, i stedet for en bar
// 16:9-ramme uten kontekst.
function WebsiteMock({
  video,
  websitePhotos,
  onPrevVideo,
  onNextVideo,
  hasMultipleVideos,
}: {
  video: QuotePackageShowcaseItem | null
  websitePhotos: QuotePackageShowcaseItem[]
  onPrevVideo: () => void
  onNextVideo: () => void
  hasMultipleVideos: boolean
}) {
  return (
    <div className="overflow-hidden rounded-[6px]" style={{ border: `1px solid ${BORDER}`, background: BLACK }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: '#211D16', borderBottom: `1px solid ${BORDER}` }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E05A4A', display: 'inline-block' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E0B23D', display: 'inline-block' }} />
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#4CAF7D', display: 'inline-block' }} />
        <div className="ml-2 flex-1 truncate rounded-full px-3 py-1" style={{ background: SURFACE, color: SUBTLE, fontSize: '0.65rem' }}>
          leafilms.no
        </div>
      </div>
      <div className="relative w-full" style={{ aspectRatio: '16 / 9', background: '#000' }}>
        {video && (
          <video key={video.id} autoPlay muted loop playsInline src={video.path} className="hero-bg-video absolute inset-0 h-full w-full object-cover" />
        )}
        {hasMultipleVideos && <CarouselArrows onPrev={onPrevVideo} onNext={onNextVideo} />}
      </div>
      {websitePhotos.length > 0 && (
        <div
          className="grid gap-px p-px"
          style={{ gridTemplateColumns: `repeat(${Math.min(websitePhotos.length, 4)}, 1fr)`, background: BORDER }}
        >
          {websitePhotos.map(photo => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo.id} src={photo.path} alt="" className="aspect-square w-full object-cover" style={{ background: SURFACE }} />
          ))}
        </div>
      )}
    </div>
  )
}

// Mobil: hvert innholdselement som sitt eget "sosiale medier-post"-kort i en
// bla-karusell (scroll-snap) — adresserer "vil kunne bla mellom innholdet"
// og "se mer ut som en sosiale medier post" (feedback 2026-11-10).
function SocialPostCard({ children, caption, cardWidth }: { children: React.ReactNode; caption?: string | null; cardWidth: number }) {
  return (
    <div className="shrink-0" style={{ width: cardWidth, scrollSnapAlign: 'center' }}>
      <div className="overflow-hidden rounded-[14px]" style={{ border: `1px solid ${BORDER}`, background: SURFACE }}>
        <div className="flex items-center gap-2 px-3 py-2">
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: GOLD, display: 'inline-block', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, color: CREAM }}>leafilms</span>
        </div>
        <div className="relative w-full" style={{ aspectRatio: '4 / 5', background: '#000' }}>
          {children}
        </div>
      </div>
      {caption && (
        <p className="mt-2 px-1" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: MUTED }}>
          {caption}
        </p>
      )}
    </div>
  )
}

export function PackageDetailModal({ isOpen, onClose, packageLabel, items }: PackageDetailModalProps) {
  const [mainVideoIndex, setMainVideoIndex] = useState(0)
  const [socialClipIndex, setSocialClipIndex] = useState(0)

  if (!isOpen) return null

  const mainVideos = items.filter(i => i.kind === 'main_video')
  const socialClips = items.filter(i => i.kind === 'social_clip')
  const photos = items.filter(i => i.kind === 'photo')
  const websitePhotos = items.filter(i => i.kind === 'website_photo')

  const activeVideo = mainVideos.length > 0 ? mainVideos[Math.min(mainVideoIndex, mainVideos.length - 1)] : null
  const activeClip = socialClips.length > 0 ? socialClips[Math.min(socialClipIndex, socialClips.length - 1)] : null

  function showPrevVideo() {
    setMainVideoIndex(i => (i - 1 + mainVideos.length) % mainVideos.length)
  }
  function showNextVideo() {
    setMainVideoIndex(i => (i + 1) % mainVideos.length)
  }
  function showPrevClip() {
    setSocialClipIndex(i => (i - 1 + socialClips.length) % socialClips.length)
  }
  function showNextClip() {
    setSocialClipIndex(i => (i + 1) % socialClips.length)
  }

  const isEmpty = mainVideos.length === 0 && socialClips.length === 0 && photos.length === 0

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-2 sm:p-6 md:p-8 z-50">
      <div
        className="max-w-5xl w-full max-h-[95vh] sm:max-h-[85vh] overflow-y-auto rounded-[2px] p-6 md:p-8"
        style={{ background: SURFACE, border: `1px solid ${BORDER}` }}
        data-lenis-prevent
      >
        <div className="flex items-start justify-between mb-6 md:mb-8">
          <h2 className="font-display text-2xl md:text-3xl" style={{ color: CREAM, fontWeight: 400 }}>
            {packageLabel}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            style={{ color: SUBTLE, lineHeight: 0, flexShrink: 0, marginLeft: 16 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        </div>

        {isEmpty && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: MUTED }}>
            Ingen eksempelmedia lagt til ennå.
          </p>
        )}

        {/* ── Mobil: svip-karusell av "sosiale medier"-kort ── */}
        {!isEmpty && (
          <div
            className="md:hidden -mx-6 flex gap-4 overflow-x-auto px-6 pb-2"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {mainVideos.map(video => (
              <SocialPostCard key={video.id} cardWidth={240}>
                <video autoPlay muted loop playsInline src={video.path} className="hero-bg-video absolute inset-0 h-full w-full object-cover" />
              </SocialPostCard>
            ))}
            {socialClips.map(clip => (
              <SocialPostCard key={clip.id} cardWidth={240} caption={clip.caption}>
                {clip.media_type === 'video' ? (
                  <video autoPlay muted loop playsInline src={clip.path} className="hero-bg-video absolute inset-0 h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={clip.path} alt="" className="absolute inset-0 h-full w-full object-cover" />
                )}
              </SocialPostCard>
            ))}
            {photos.length > 0 && (
              <div className="flex shrink-0 flex-col items-center justify-center" style={{ width: 240, scrollSnapAlign: 'center' }}>
                <PhotoStack photos={photos} size={170} />
                <p className="mt-5" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: MUTED }}>
                  {photos.length} bilder inkludert
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Desktop: nettside-mock (video + nettside-bilder) + klipp/bunke ── */}
        {!isEmpty && (
          <div className="hidden md:block">
            {activeVideo && (
              <WebsiteMock
                video={activeVideo}
                websitePhotos={websitePhotos}
                onPrevVideo={showPrevVideo}
                onNextVideo={showNextVideo}
                hasMultipleVideos={mainVideos.length > 1}
              />
            )}

            {(socialClips.length > 0 || photos.length > 0) && (
              <div className="mt-10 flex flex-wrap items-start gap-12">
                {socialClips.length > 0 && (
                  <div className="flex flex-col items-center">
                    <div className="relative" style={{ width: 200 }}>
                      <div
                        className="relative overflow-hidden"
                        style={{ aspectRatio: '9 / 16', background: '#000', borderRadius: 24, border: '6px solid #000' }}
                      >
                        {activeClip && activeClip.media_type === 'video' ? (
                          <video key={activeClip.id} autoPlay muted loop playsInline src={activeClip.path} className="hero-bg-video absolute inset-0 h-full w-full object-cover" />
                        ) : activeClip ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={activeClip.id} src={activeClip.path} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        ) : null}
                      </div>
                      {socialClips.length > 1 && <CarouselArrows onPrev={showPrevClip} onNext={showNextClip} />}
                    </div>
                    {activeClip?.caption && (
                      <p className="mt-3 max-w-[220px] text-center text-sm" style={{ color: MUTED }}>
                        {activeClip.caption}
                      </p>
                    )}
                  </div>
                )}

                {photos.length > 0 && (
                  <div className="flex flex-col items-center">
                    <PhotoStack photos={photos} />
                    <p className="mt-5" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: MUTED }}>
                      {photos.length} bilder inkludert
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium uppercase tracking-[0.12em]"
            style={{ color: GOLD }}
          >
            Lukk
          </button>
        </div>
      </div>
    </div>
  )
}
