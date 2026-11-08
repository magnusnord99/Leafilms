'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'lf_grid_zoom'
const DEFAULT_ZOOM = 140

// Leser localStorage i useEffect (ikke i useState-initializer) for å unngå
// hydration-mismatch mellom server- og klient-render.
export function useGridZoom(storageKey: string = STORAGE_KEY, defaultZoom: number = DEFAULT_ZOOM) {
  const [zoom, setZoomState] = useState(defaultZoom)

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved) setZoomState(Number(saved))
  }, [storageKey])

  function setZoom(value: number) {
    setZoomState(value)
    localStorage.setItem(storageKey, String(value))
  }

  return [zoom, setZoom] as const
}
