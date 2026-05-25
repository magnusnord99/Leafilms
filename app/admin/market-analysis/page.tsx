'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { MarketAnalysis, MarketLead } from '@/lib/types'

export default function MarketAnalysisPage() {
  const [analysis, setAnalysis] = useState<MarketAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLatest()
  }, [])

  async function fetchLatest() {
    setLoading(true)
    const res = await fetch('/api/market-analysis')
    if (res.ok) {
      const { analysis: data } = await res.json()
      setAnalysis(data)
    }
    setLoading(false)
  }

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
    new Date(ts).toLocaleString('nb-NO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="min-h-screen p-4 sm:p-8 md:p-12" style={{ background: '#0C0B09', color: '#E8E1D5' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <Link href="/admin" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#62594E', letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' }}>
              ← Dashboard
            </Link>
            <h1 style={{ fontFamily: 'var(--font-cormorant)', fontSize: '2rem', fontWeight: 400, color: '#E8E1D5', marginTop: 8, marginBottom: 4 }}>
              Markedsanalyse
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#62594E', letterSpacing: '0.06em' }}>
              Neste automatiske kjøring: {nextMonday()} kl 08:00
            </p>
          </div>

          <button
            onClick={triggerAnalysis}
            disabled={running}
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              padding: '10px 20px',
              background: running ? 'transparent' : '#C49434',
              color: running ? '#C49434' : '#0C0B09',
              border: '1px solid #C49434',
              borderRadius: 2,
              cursor: running ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'background 0.15s, color 0.15s',
              fontWeight: 500,
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

        {error && (
          <div style={{
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            borderRadius: 4,
            padding: '12px 16px',
            marginBottom: 24,
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.7rem',
            color: '#F87171',
          }}>
            {error}
          </div>
        )}

        {running && (
          <div style={{
            background: 'rgba(196,148,52,0.06)',
            border: '1px solid rgba(196,148,52,0.2)',
            borderRadius: 4,
            padding: '16px 20px',
            marginBottom: 24,
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.7rem',
            color: '#C49434',
            letterSpacing: '0.04em',
          }}>
            Claude-agenten søker nettet etter potensielle kunder. Dette tar 30–60 sekunder...
          </div>
        )}

        {loading && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#3D3829', textAlign: 'center', paddingTop: 48 }}>
            Laster...
          </p>
        )}

        {!loading && !analysis && !running && (
          <div style={{ textAlign: 'center', paddingTop: 64 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#3D3829', marginBottom: 24 }}>
              Ingen analyser kjørt ennå. Klikk «Kjør analyse nå» for å starte.
            </p>
          </div>
        )}

        {analysis?.results && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <span style={{ width: 1, height: 16, background: '#C49434', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#62594E', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {analysis.results.customers.length} leads · generert {formatDate(analysis.created_at)}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {analysis.results.customers.map((lead: MarketLead, i: number) => {
                const key = `${i}-${lead.company}`
                const isOpen = expanded === key
                return (
                  <div
                    key={key}
                    style={{
                      background: '#0E0D0B',
                      border: `1px solid ${isOpen ? '#C49434' : '#2A261F'}`,
                      borderRadius: 4,
                      overflow: 'hidden',
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {/* Accordion header */}
                    <button
                      onClick={() => setExpanded(isOpen ? null : key)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 18px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: '0.55rem',
                          color: '#C49434',
                          letterSpacing: '0.12em',
                          textTransform: 'uppercase',
                          fontWeight: 500,
                          minWidth: 16,
                        }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div>
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: '#E8E1D5', fontWeight: 500, margin: 0 }}>
                            {lead.company}
                          </p>
                          {lead.website && (
                            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#3D3829', margin: '2px 0 0', letterSpacing: '0.04em' }}>
                              {lead.website.replace(/^https?:\/\//, '')}
                            </p>
                          )}
                        </div>
                      </div>
                      <svg
                        width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#62594E" strokeWidth="1.5"
                        style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
                      >
                        <path strokeLinecap="round" d="M2 4l4 4 4-4" />
                      </svg>
                    </button>

                    {/* Accordion body */}
                    {isOpen && (
                      <div style={{ padding: '0 18px 20px', borderTop: '1px solid #2A261F', display: 'flex', flexDirection: 'column', gap: 20 }}>

                        {/* Reason */}
                        <div style={{ paddingTop: 16 }}>
                          <Label>Hvorfor Leafilms?</Label>
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: '#B5AFA5', lineHeight: 1.6, margin: 0 }}>
                            {lead.reason}
                          </p>
                        </div>

                        {/* Sales points */}
                        <div>
                          <Label>Salgspunkter</Label>
                          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {lead.sales_points.map((sp, j) => (
                              <li key={j} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <span style={{ color: '#C49434', fontSize: '0.6rem', marginTop: 3, flexShrink: 0 }}>—</span>
                                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#B5AFA5', lineHeight: 1.5 }}>{sp}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Cold email */}
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Label>Cold Email-utkast</Label>
                            <button
                              onClick={() => navigator.clipboard.writeText(lead.cold_email)}
                              style={{
                                fontFamily: 'var(--font-dm-sans)',
                                fontSize: '0.55rem',
                                letterSpacing: '0.1em',
                                textTransform: 'uppercase',
                                color: '#62594E',
                                background: 'transparent',
                                border: '1px solid #2A261F',
                                borderRadius: 2,
                                padding: '4px 8px',
                                cursor: 'pointer',
                              }}
                            >
                              Kopier
                            </button>
                          </div>
                          <pre style={{
                            fontFamily: 'var(--font-dm-sans)',
                            fontSize: '0.7rem',
                            color: '#B5AFA5',
                            lineHeight: 1.6,
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            background: '#13120F',
                            border: '1px solid #2A261F',
                            borderRadius: 4,
                            padding: '12px 14px',
                          }}>
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
          <div style={{
            background: 'rgba(220, 38, 38, 0.08)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            borderRadius: 4,
            padding: '12px 16px',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.7rem',
            color: '#F87171',
          }}>
            Siste analyse feilet: {analysis.error_message}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontFamily: 'var(--font-dm-sans)',
      fontSize: '0.55rem',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: '#62594E',
      margin: '0 0 6px',
      fontWeight: 500,
    }}>
      {children}
    </p>
  )
}
