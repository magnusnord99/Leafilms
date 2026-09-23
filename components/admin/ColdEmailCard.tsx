'use client'

import { useEffect, useState } from 'react'
import { updateLeadEmail } from '@/lib/actions/leads'
import { C } from '@/lib/admin-theme'

// E-posten er generert som fritekst ("Emne: ..." / "Subject: ..." på første linje,
// resten er brødtekst) — del den opp så emnefelt og melding kan sendes hver for seg.
function parseColdEmail(raw: string): { subject: string; body: string } {
  const lines = raw.split('\n')
  const match = lines[0]?.match(/^\s*(?:Emne|Subject)\s*:\s*(.+)$/i)
  if (match) {
    let rest = lines.slice(1)
    if (rest[0]?.trim() === '') rest = rest.slice(1)
    return { subject: match[1].trim(), body: rest.join('\n').trim() }
  }
  return { subject: '', body: raw.trim() }
}

const fieldStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem',
  color: C.text, background: C.surface2,
  border: `1px solid ${C.border}`, borderRadius: 7,
  padding: '9px 12px', outline: 'none',
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.text3, marginBottom: 5 }}>
      {children}
    </label>
  )
}

export function ColdEmailCard({
  leadId,
  coldEmail,
  initialTo,
}: {
  leadId: string
  coldEmail: string
  initialTo: string | null
}) {
  const parsed = parseColdEmail(coldEmail)
  const [copied, setCopied] = useState(false)
  const [composing, setComposing] = useState(false)
  const [to, setTo] = useState(initialTo ?? '')
  const [subject, setSubject] = useState(parsed.subject)
  const [body, setBody] = useState(parsed.body)
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!composing) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setComposing(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [composing])

  async function handleCopy() {
    await navigator.clipboard.writeText(coldEmail)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSend() {
    if (!to.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          emailType: 'lead_cold_outreach',
          to: to.trim(),
          subject: subject.trim() || 'Henvendelse fra Leafilms',
          body,
          useLeafilmsAddress: true,
        }),
      })
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({}))
        setError(msg || 'Sending feilet. Prøv igjen.')
        setSending(false)
        return
      }
      if (to.trim() !== (initialTo ?? '')) {
        updateLeadEmail(leadId, to.trim())
      }
      setSentTo(to.trim())
      setComposing(false)
      setTimeout(() => setSentTo(null), 4000)
    } catch {
      setError('Sending feilet. Prøv igjen.')
    }
    setSending(false)
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
          Kald e-post
        </p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleCopy}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
              padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
              background: copied ? 'rgba(76,175,125,0.12)' : C.surface2,
              color: copied ? C.success : C.text2,
              border: `1px solid ${copied ? 'rgba(76,175,125,0.3)' : C.border}`,
              transition: 'all 0.15s',
            }}
          >
            {copied ? '✓ Kopiert' : 'Kopier'}
          </button>
          <button
            onClick={() => setComposing(true)}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
              padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
              background: C.accentBg, color: C.accent,
              border: '1px solid rgba(124,92,252,0.25)',
            }}
          >
            Send →
          </button>
        </div>
      </div>

      <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
          {coldEmail}
        </p>
      </div>

      {sentTo && (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.success, marginTop: 10 }}>
          ✓ Sendt til {sentTo}
        </p>
      )}

      {composing && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setComposing(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(10,8,16,0.72)', backdropFilter: 'blur(3px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28,
          }}
        >
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14,
            width: '100%', maxWidth: 760, maxHeight: '88vh',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.95rem', fontWeight: 600, color: C.text }}>
                Send kald e-post
              </p>
              <button
                onClick={() => setComposing(false)}
                aria-label="Lukk"
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', lineHeight: 1,
                  color: C.text3, background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <FieldLabel>Til</FieldLabel>
                  <input
                    type="email"
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    placeholder="kontakt@bedrift.no"
                    style={fieldStyle}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <FieldLabel>Emne</FieldLabel>
                  <input
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    style={fieldStyle}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                <FieldLabel>Melding</FieldLabel>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  style={{ ...fieldStyle, resize: 'none', lineHeight: 1.7, fontSize: '0.85rem', flex: 1, minHeight: 320 }}
                />
              </div>
              {error && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger }}>{error}</p>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 14, padding: '16px 24px', borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
              <a
                href={`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, textDecoration: 'none' }}
              >
                Åpne i e-postklient i stedet
              </a>
              <button
                onClick={() => setComposing(false)}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500,
                  padding: '9px 18px', borderRadius: 8, cursor: 'pointer',
                  background: 'transparent', color: C.text2, border: `1px solid ${C.border}`,
                }}
              >
                Avbryt
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !to.trim()}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
                  padding: '9px 20px', borderRadius: 8, cursor: sending || !to.trim() ? 'default' : 'pointer',
                  background: C.accent, color: '#fff', border: 'none',
                  opacity: sending || !to.trim() ? 0.6 : 1,
                }}
              >
                {sending ? 'Sender...' : 'Send e-post'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
