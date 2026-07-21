'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { OptionalAddon } from '@/lib/types'

type UseQuoteContractStateArgs = {
  shareToken?: string
  projectId?: string
  initialIsSigned: boolean
}

/**
 * Delt state for tilbudstillegg + kontraktsignering mellom full pitch
 * (PublicProjectClient) og den slanke signeringslenken (SigningProjectClient).
 */
export function useQuoteContractState({ shareToken, projectId, initialIsSigned }: UseQuoteContractStateArgs) {
  const [optionalAddons, setOptionalAddons] = useState<OptionalAddon[]>([])
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(new Set())
  const [baseFinalPriceExclVat, setBaseFinalPriceExclVat] = useState(0)
  const [quoteDiscountFactor, setQuoteDiscountFactor] = useState(0)
  const [contractSigned, setContractSigned] = useState(initialIsSigned)
  const skipNextAddonSave = useRef(true)

  const handleToggleAddon = useCallback((id: string) => {
    // Tilleggene låses så snart avtalen er signert — ingen flere endringer skal kunne lagres
    if (contractSigned) return
    setSelectedAddonIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [contractSigned])

  const handleContractSigned = useCallback(() => {
    setContractSigned(true)
  }, [])

  const handleAddonsLoaded = useCallback((addons: OptionalAddon[], initialSelectedIds: string[] = []) => {
    setOptionalAddons(addons)
    // Hentet fra server — ikke lagre dette tilbake med det samme (unngår unødvendig round-trip)
    skipNextAddonSave.current = true
    setSelectedAddonIds(new Set(initialSelectedIds))
  }, [])

  const handleBaseTotalsLoaded = useCallback((finalPriceExclVat: number, discountFactor: number) => {
    setBaseFinalPriceExclVat(finalPriceExclVat)
    setQuoteDiscountFactor(discountFactor)
  }, [])

  // Lagre kundens avhukede tillegg fortløpende, slik at de overlever en sideoppdatering
  // — men ikke rett etter at valget nettopp ble lastet inn fra serveren.
  useEffect(() => {
    if (skipNextAddonSave.current) {
      skipNextAddonSave.current = false
      return
    }
    if (!shareToken || !projectId) return
    const ids = Array.from(selectedAddonIds)
    const timeout = setTimeout(() => {
      fetch('/api/quotes/select-addons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, shareToken, selectedAddonIds: ids }),
      }).catch(() => {})
    }, 400)
    return () => clearTimeout(timeout)
  }, [selectedAddonIds, shareToken, projectId])

  return {
    optionalAddons,
    selectedAddonIds,
    baseFinalPriceExclVat,
    quoteDiscountFactor,
    contractSigned,
    handleToggleAddon,
    handleContractSigned,
    handleAddonsLoaded,
    handleBaseTotalsLoaded,
  }
}
