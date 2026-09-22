'use client'

import { useEffect, useRef } from 'react'

export function HeroVideo({ src, poster }: { src: string; poster: string }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.pause()
      video.currentTime = 0
    }
  }, [])

  return (
    <video
      ref={ref}
      className="absolute inset-0 h-full w-full object-cover"
      src={src}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
    />
  )
}
