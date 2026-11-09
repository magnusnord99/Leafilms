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

function CarouselArrows({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  return (
    <div className="absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-3">
      <button type="button" onClick={onPrev} aria-label="Forrige" style={arrowButtonStyle}>‹</button>
      <button type="button" onClick={onNext} aria-label="Neste" style={arrowButtonStyle}>›</button>
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

  // "Tom side kollapser helt" (2026-11-09-flyer-package-showcase-design.md,
  // "Oppdaget i byggersjekken") — venstre kolonne (hovedvideo) kollapser når
  // den er tom, høyre (klipp+bilder) kollapser kun når BÅDE klipp og bilder
  // er tomme. Den andre kolonnen tar da hele bredden i stedet for å stå med
  // et tomt rom — grid-cols-1 uten md:grid-cols-2 gjør nettopp det.
  const hasLeft = mainVideos.length > 0
  const hasRight = socialClips.length > 0 || photos.length > 0
  const showTwoColumns = hasLeft && hasRight

  const activeVideo = hasLeft ? mainVideos[Math.min(mainVideoIndex, mainVideos.length - 1)] : null
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

        <div className={`grid gap-8 ${showTwoColumns ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
          {hasLeft && (
            <div className="relative">
              <div
                className="relative w-full overflow-hidden rounded-[2px]"
                style={{ aspectRatio: '16 / 9', background: '#000' }}
              >
                {activeVideo && (
                  <video
                    key={activeVideo.id}
                    controls
                    src={activeVideo.path}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                )}
              </div>
              {mainVideos.length > 1 && <CarouselArrows onPrev={showPrevVideo} onNext={showNextVideo} />}
            </div>
          )}

          {hasRight && (
            <div className="flex flex-col gap-8">
              {socialClips.length > 0 && (
                <div className="flex flex-col items-center">
                  <div className="relative" style={{ width: 200 }}>
                    <div
                      className="relative overflow-hidden"
                      style={{ aspectRatio: '9 / 16', background: '#000', borderRadius: 24, border: '6px solid #000' }}
                    >
                      {activeClip && activeClip.media_type === 'video' ? (
                        <video
                          key={activeClip.id}
                          controls
                          src={activeClip.path}
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ) : activeClip ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={activeClip.id}
                          src={activeClip.path}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                        />
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
                <div className="grid grid-cols-3 gap-2">
                  {photos.map(photo => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={photo.id}
                      src={photo.path}
                      alt=""
                      className="aspect-square w-full rounded-[2px] object-cover"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

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
