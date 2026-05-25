'use client'

import { useEffect, useRef, useState } from 'react'
import type { PitchFeedback } from '@/lib/types'

type Props = {
  projectId: string
  shareToken: string
}

export function PitchFeedbackPanel({ projectId, shareToken }: Props) {
  const [open, setOpen] = useState(false)
  const [feedback, setFeedback] = useState<PitchFeedback[]>([])
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Hent lagret navn fra localStorage
  useEffect(() => {
    const savedName = localStorage.getItem('leafilms_feedback_name')
    if (savedName) setName(savedName)
  }, [])

  // Hent feedback når panelet åpnes
  useEffect(() => {
    if (!open) return
    fetchFeedback()
  }, [open, projectId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [feedback])

  async function fetchFeedback() {
    try {
      const res = await fetch(`/api/projects/${projectId}/feedback`)
      if (res.ok) {
        const { feedback: data } = await res.json()
        setFeedback(data || [])
      }
    } catch {
      // Stille feilhåndtering - feedback er ikke kritisk
    }
  }

  async function sendFeedback(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim() || !name.trim() || sending) return
    setSending(true)

    // Lagre navn for neste gang
    localStorage.setItem('leafilms_feedback_name', name.trim())

    try {
      const res = await fetch(`/api/projects/${projectId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim(),
          author_name: name.trim(),
          share_token: shareToken,
        }),
      })
      if (res.ok) {
        const { feedback: newFeedback } = await res.json()
        setFeedback((prev) => [...prev, newFeedback])
        setContent('')
        setSent(true)
        setTimeout(() => setSent(false), 3000)
      }
    } catch {
      // Stille feilhåndtering
    }
    setSending(false)
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
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Gi innspill"
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
            <span style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#C49434',
              fontWeight: 500,
            }}>
              Gi innspill
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ color: '#62594E', lineHeight: 0, padding: 2, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M1 1l10 10M11 1L1 11" />
              </svg>
            </button>
          </div>

          {/* Existing feedback */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {feedback.length === 0 && (
              <p style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.7rem',
                color: '#3D3829',
                textAlign: 'center',
                marginTop: 16,
                lineHeight: 1.6,
                letterSpacing: '0.04em',
              }}>
                Vi setter pris pa dine tanker og innspill til denne prosjektbeskrivelsen.
              </p>
            )}
            {feedback.map((item) => (
              <div key={item.id} style={{
                padding: '10px 12px',
                background: '#161410',
                border: '1px solid #2A261F',
                borderRadius: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
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
            <div ref={bottomRef} />
          </div>

          {/* Success message */}
          {sent && (
            <div style={{
              padding: '8px 14px',
              background: '#1A2418',
              borderTop: '1px solid #2A3D25',
            }}>
              <p style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                color: '#7CAA6E',
                textAlign: 'center',
                letterSpacing: '0.04em',
              }}>
                Takk for innspillet!
              </p>
            </div>
          )}

          {/* Input form */}
          <form
            onSubmit={sendFeedback}
            style={{
              borderTop: '1px solid #2A261F',
              padding: '10px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ditt navn"
              style={{
                width: '100%',
                background: '#161410',
                border: '1px solid #2A261F',
                borderRadius: 4,
                outline: 'none',
                padding: '8px 10px',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.7rem',
                color: '#E8E1D5',
                letterSpacing: '0.03em',
              }}
            />
            <div style={{ display: 'flex', gap: 0, border: '1px solid #2A261F', borderRadius: 4, overflow: 'hidden' }}>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Skriv din kommentar..."
                rows={2}
                disabled={sending}
                style={{
                  flex: 1,
                  background: '#161410',
                  border: 'none',
                  outline: 'none',
                  padding: '8px 10px',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.7rem',
                  color: '#E8E1D5',
                  letterSpacing: '0.03em',
                  resize: 'none',
                }}
              />
              <button
                type="submit"
                disabled={sending || !content.trim() || !name.trim()}
                style={{
                  padding: '8px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderLeft: '1px solid #2A261F',
                  color: content.trim() && name.trim() ? '#C49434' : '#2A261F',
                  cursor: content.trim() && name.trim() ? 'pointer' : 'default',
                  lineHeight: 0,
                  transition: 'color 0.15s',
                  alignSelf: 'flex-end',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 8L2 2l3 6-3 6 12-6z" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
