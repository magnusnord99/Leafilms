'use client'

import { useEffect, useState } from 'react'
import type { PitchFeedback } from '@/lib/types'

type Props = {
  projectId: string
}

export function AdminFeedbackPanel({ projectId }: Props) {
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState<PitchFeedback[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    fetchFeedback()
  }, [open, projectId])

  async function fetchFeedback() {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/feedback`)
      if (res.ok) {
        const { feedback: data } = await res.json()
        setFeedback(data || [])
      }
    } catch {
      // Stille feilhandtering
    }
    setLoading(false)
  }

  async function deleteFeedback(feedbackId: string) {
    if (!confirm('Slett dette innspillet?')) return
    try {
      const res = await fetch(`/api/projects/${projectId}/feedback?feedbackId=${feedbackId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setFeedback((prev) => prev.filter((f) => f.id !== feedbackId))
      }
    } catch {
      // Stille feilhandtering
    }
  }

  const formatTime = (ts: string) => {
    const d = new Date(ts)
    return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  }

  const formatDate = (ts: string) => {
    const d = new Date(ts)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return 'I dag'
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (d.toDateString() === yesterday.toDateString()) return 'I gar'
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <>
      {/* Floating toggle button - left side */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Kundeinnspill"
        style={{
          position: 'fixed',
          bottom: 24,
          left: 24,
          zIndex: 50,
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: open ? '#C49434' : '#1A1710',
          border: '1px solid #C49434',
          color: open ? '#0C0B09' : '#C49434',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        {feedback.length > 0 && !open && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            background: '#C49434',
            color: '#0C0B09',
            borderRadius: '50%',
            width: 18,
            height: 18,
            fontSize: '0.55rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-dm-sans)',
          }}>
            {feedback.length}
          </span>
        )}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h12M4 8h8M4 12h10M2 16l3-3h11a2 2 0 002-2V4a2 2 0 00-2-2H4a2 2 0 00-2 2v12z" />
        </svg>
      </button>

      {/* Feedback panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 84,
            left: 16,
            right: 16,
            zIndex: 50,
            maxHeight: 520,
            display: 'flex',
            flexDirection: 'column',
            background: '#0E0D0B',
            border: '1px solid #2A261F',
            borderRadius: 8,
            boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            overflow: 'hidden',
          }}
          className="sm:left-6 sm:right-auto sm:w-[360px]"
        >
          {/* Header */}
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid #2A261F',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.6rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#C49434',
                fontWeight: 500,
              }}>
                Kundeinnspill
              </span>
              <span style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.55rem',
                color: '#3D3829',
              }}>
                ({feedback.length})
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={fetchFeedback}
                title="Oppdater"
                style={{ color: '#62594E', lineHeight: 0, padding: 2, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" d="M1 6a5 5 0 019-3M11 6a5 5 0 01-9 3" />
                  <path strokeLinecap="round" d="M10 1v2h-2M2 11V9h2" />
                </svg>
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ color: '#62594E', lineHeight: 0, padding: 2, background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" d="M1 1l10 10M11 1L1 11" />
                </svg>
              </button>
            </div>
          </div>

          {/* Feedback list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {loading && feedback.length === 0 && (
              <p style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                color: '#3D3829',
                textAlign: 'center',
                marginTop: 24,
                letterSpacing: '0.04em',
              }}>
                Laster innspill...
              </p>
            )}
            {!loading && feedback.length === 0 && (
              <p style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                color: '#3D3829',
                textAlign: 'center',
                marginTop: 24,
                letterSpacing: '0.04em',
              }}>
                Ingen innspill fra kunder enna
              </p>
            )}
            {feedback.map((item) => (
              <div key={item.id} style={{
                padding: '10px 12px',
                background: '#161410',
                border: '1px solid #2A261F',
                borderRadius: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '0.6rem',
                      color: '#C49434',
                      fontWeight: 500,
                      letterSpacing: '0.06em',
                    }}>
                      {item.author_name}
                    </span>
                    <span style={{
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '0.55rem',
                      color: '#3D3829',
                      letterSpacing: '0.04em',
                    }}>
                      {formatDate(item.created_at)} {formatTime(item.created_at)}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteFeedback(item.id)}
                    title="Slett"
                    style={{
                      color: '#3D3829',
                      lineHeight: 0,
                      padding: 2,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#B84040' }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.color = '#3D3829' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" d="M1 1l8 8M9 1L1 9" />
                    </svg>
                  </button>
                </div>
                <p style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.7rem',
                  color: '#B5AFA5',
                  lineHeight: 1.5,
                  margin: 0,
                  wordBreak: 'break-word',
                }}>
                  {item.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
