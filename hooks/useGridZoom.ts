'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'lf_grid_zoom'
const DEFAULT_ZOOM = 140

// Leser localStorage i useEffect (ikke i useState-initializer) for å unngå
// hydration-mismatch mellom server- og klient-render.
export function useGridZoom() {
  const [zoom, setZoomState] = useState(DEFAULT_ZOOM)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) setZoomState(Number(saved))
  }, [])

  function setZoom(value: number) {
    setZoomState(value)
    localStorage.setItem(STORAGE_KEY, String(value))
  }

  return [zoom, setZoom] as const
}
