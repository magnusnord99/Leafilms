'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { MarketAnalysis, MarketLead } from '@/lib/types'
import { C } from '@/lib/admin-theme'

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, margin: '0 0 8px' }}>
      {children}
    </p>
  )
}

export default function MarketAnalysisPage() {
  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function fetchLatest() {
    setLoading(true)
    const res = await fetch('/api/market-analysis')
    if (res.ok) {
      const { analysis: data } = await res.json()
      setAnalysis(data)
    }
    setLoading(false)
  }

  useEffect(() => { fetchLatest() }, [])

  async function triggerAnalysis() {
    setRunning(true)
    setError(null)
    const res = await fetch('/api/market-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggered_by: 'manual' }),
    })
    const json = await res.json()
    if (res.ok) {
      setAnalysis(json.analysis)
      setExpanded(null)
    } else {
      setError(json.error || 'Noe gikk galt')
    }
    setRunning(false)
  }

  const nextMonday = () => {
    const d = new Date()
    const day = d.getDay()
    const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7
    d.setDate(d.getDate() + daysUntilMonday)
    return d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })
  }

  const formatDate = (ts: string) =>
    new Date(ts).toLocaleString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 32 }}>
          <div>
            <Link href="/admin" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, textDecoration: 'none' }}>
              ← Dashboard
            </Link>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 700, color: C.text, marginTop: 8, marginBottom: 4, lineHeight: 1.2 }}>
              Markedsanalyse
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
              Neste automatiske kjøring: {nextMonday()} kl 08:00
            </p>
          </div>
          <button
            onClick={triggerAnalysis}
            disabled={running}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
              padding: '10px 20px', borderRadius: 8,
              background: running ? C.surface : C.accent,
              color: running ? C.text3 : '#fff',
              border: `1px solid ${running ? C.border : C.accent}`,
              cursor: running ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background 0.15s',
            }}
          >
            {running && (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ animation: 'spin 1s linear infinite' }}>
                <path strokeLinecap="round" d="M7 1v3M7 10v3M1 7h3M10 7h3" opacity="0.4" />
                <path strokeLinecap="round" d="M2.7 2.7l2 2M9.3 9.3l2 2M2.7 11.3l2-2M9.3 4.7l2-2" />
              </svg>
            )}
            {running ? 'Analyserer...' : 'Kjør analyse nå'}
          </button>
        </div>

        {/* Feil */}
        {error && (
          <div style={{ background: 'rgba(224,85,85,0.08)', border: `1px solid rgba(224,85,85,0.25)`, borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger }}>
            {error}
          </div>
        )}

        {/* Kjører */}
        {running && (
          <div style={{ background: C.accentBg, border: `1px solid rgba(124,92,252,0.2)`, borderRadius: 8, padding: '14px 18px', marginBottom: 20, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.accent }}>
            Claude-agenten søker nettet etter potensielle kunder. Dette tar 30–60 sekunder...
          </div>
        )}

        {loading && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textAlign: 'center', paddingTop: 48 }}>Laster...</p>
        )}

        {!loading && !analysis && !running && (
          <div style={{ textAlign: 'center', paddingTop: 64 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>
              Ingen analyser kjørt ennå. Klikk «Kjør analyse nå» for å starte.
            </p>
          </div>
        )}

        {/* Resultater */}
        {analysis?.results && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 3, height: 16, background: C.accent, borderRadius: 2, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2 }}>
                {analysis.results.customers.length} leads · generert {formatDate(analysis.created_at)}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {analysis.results.customers.map((lead: MarketLead, i: number) => {
                const key = `${i}-${lead.company}`
                const isOpen = expanded === key
                return (
                  <div key={key} style={{ background: C.surface, border: `1px solid ${isOpen ? C.accent : C.border}`, borderRadius: 8, overflow: 'hidden', transition: 'border-color 0.15s' }}>
                    {/* Accordion header */}
                    <button
                      onClick={() => setExpanded(isOpen ? null : key)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', gap: 12 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700, color: C.accent, minWidth: 20 }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text, margin: 0 }}>
                            {lead.company}
                          </p>
                          {lead.website && (
                            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, margin: '2px 0 0' }}>
                              {lead.website.replace(/^https?:\/\//, '')}
                            </p>
                          )}
                        </div>
                      </div>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={C.text3} strokeWidth="1.5" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
                        <path strokeLinecap="round" d="M2 4l4 4 4-4" />
                      </svg>
                    </button>

                    {/* Accordion body */}
                    {isOpen && (
                      <div style={{ padding: '0 18px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div style={{ paddingTop: 16 }}>
                          <Label>Hvorfor Leafilms?</Label>
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2, lineHeight: 1.6, margin: 0 }}>{lead.reason}</p>
                        </div>
                        <div>
                          <Label>Salgspunkter</Label>
                          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {lead.sales_points.map((sp, j) => (
                              <li key={j} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <span style={{ color: C.accent, fontSize: '0.7rem', marginTop: 2, flexShrink: 0 }}>—</span>
                                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2, lineHeight: 1.5 }}>{sp}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Label>Cold Email-utkast</Label>
                            <button
                              onClick={() => navigator.clipboard.writeText(lead.cold_email)}
                              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 500, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}
                            >
                              Kopier
                            </button>
                          </div>
                          <pre style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2, lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7, padding: '12px 14px' }}>
                            {lead.cold_email}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {analysis?.status === 'error' && (
          <div style={{ background: 'rgba(224,85,85,0.08)', border: `1px solid rgba(224,85,85,0.25)`, borderRadius: 8, padding: '12px 16px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger }}>
            Siste analyse feilet: {analysis.error_message}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
