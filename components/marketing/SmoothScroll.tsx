'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'

// Flyttet uendret fra app/energi/SmoothScroll.tsx — delt av alle
// bransje-landingssider nå.
export function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis()

    let frameId: number
    function raf(time: number) {
      lenis.raf(time)
      frameId = requestAnimationFrame(raf)
    }
    frameId = requestAnimationFrame(raf)

    return () => {
      cancelAnimationFrame(frameId)
      lenis.destroy()
    }
  }, [])

  return null
}
