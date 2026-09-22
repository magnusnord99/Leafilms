'use client'

import { useEffect } from 'react'

export function EnergiBodyClass() {
  useEffect(() => {
    document.body.classList.add('energi-page')
    return () => {
      document.body.classList.remove('energi-page')
    }
  }, [])

  return null
}
