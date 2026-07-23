'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { C } from '@/lib/admin-theme'

// Prosjektlisten flyttet inn i /admin/customers/[id] (kundeoversikten). Denne siden
// beholdes som redirect siden ruten kan ligge i bokmerker/eldre lenker.
export default function CustomerProjectsRedirect() {
  const params = useParams()
  const router = useRouter()
  const customerId = params.id as string

  useEffect(() => {
    router.replace(`/admin/customers/${customerId}`)
  }, [customerId, router])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
        Laster...
      </p>
    </div>
  )
}
