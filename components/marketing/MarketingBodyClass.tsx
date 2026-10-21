'use client'

import { useEffect } from 'react'

// Generalisert fra app/energi/EnergiBodyClass.tsx — klassenavnet endret fra
// .energi-page til .marketing-page (se app/globals.css), siden samme oppsett
// nå deles av alle bransje-landingssider, ikke bare /energi.
export function MarketingBodyClass() {
  useEffect(() => {
    document.body.classList.add('marketing-page')
    return () => {
      document.body.classList.remove('marketing-page')
    }
  }, [])

  return null
}
