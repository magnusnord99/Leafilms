'use client'

import { useEffect, useState } from 'react'
import { MarketAnalysis } from '@/lib/types'
import { C } from '@/lib/admin-theme'
import { WidgetHeader, Btn } from '../shared'

export default function MarketAnalysisWidget() {
  const [loading, setLoading] = useState(true)
  const [latestAnalysis, setLatestAnalysis] = useState<MarketAnalysis | null>(null)

  useEffect(() => {
    fetch('/api/market-analysis')
      .then((r) => r.json())
      .then(({ analysis }) => { if (analysis) setLatestAnalysis(analysis) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null

  return (
    <div>
      <WidgetHeader title="Markedsanalyse" action={<Btn href="/admin/market-analysis" variant="ghost">Se analyse →</Btn>} />
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        {latestAnalysis?.results ? (
          <>
            <div>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, marginBottom: 3 }}>
                <span style={{ color: C.accent, fontWeight: 600 }}>{latestAnalysis.results.customers.length} leads</span> funnet sist uke
              </p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
                {new Date(latestAnalysis.created_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <Btn href="/admin/market-analysis" variant="secondary">Se detaljer</Btn>
          </>
        ) : (
          <>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
              Ingen analyser kjørt ennå. Kjøres automatisk hver mandag kl 08:00.
            </p>
            <Btn href="/admin/market-analysis">Kjør nå</Btn>
          </>
        )}
      </div>
    </div>
  )
}
