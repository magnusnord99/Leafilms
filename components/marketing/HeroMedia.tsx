'use client'

import { useEffect, useRef } from 'react'

// Generalisert fra app/energi/HeroVideo.tsx — rendrer enten bakgrunnsvideo
// eller -bilde avhengig av siden sin hero_type, samme object-cover-oppførsel
// begge veier.
export function HeroMedia({
  type,
  src,
  poster,
}: {
  type: 'video' | 'image'
  src: string | null
  poster: string | null
}) {
  const ref = useRef<HTMLVideoElement>(null)

  // Avhenger av type/src — ikke kun mount — slik at en video som dukker opp
  // etter at komponenten allerede er montert (f.eks. redigering bytter
  // hero-type fra bilde til video, eller en side får sin første video etter
  // opprettelse) også får redusert-bevegelse-preferansen håndhevet, ikke bare
  // den som fantes ved første last (funnet under Codex-inspeksjon).
  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.pause()
      video.currentTime = 0
    }
  }, [type, src])

  if (type === 'image') {
    const imageSrc = poster ?? src
    if (!imageSrc) return null
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
  }

  if (!src) return null

  return (
    <video
      ref={ref}
      className="absolute inset-0 h-full w-full object-cover"
      src={src}
      poster={poster ?? undefined}
      autoPlay
      muted
      loop
      playsInline
    />
  )
}
