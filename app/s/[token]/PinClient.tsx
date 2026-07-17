'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { SELECTION_STRINGS, type SelectionLanguage } from './strings'

const S = {
  bg:      '#0C0B09',
  surface: '#131210',
  border:  '#2A2820',
  gold:    '#C49434',
  text:    '#E8E0D0',
  text2:   '#8A8070',
  danger:  '#C0503A',
}

type VerifyResult = { ok: boolean; error?: string; locked?: boolean }

export default function PinClient({
  token,
  verifyAction,
  language = 'no',
}: {
  token: string
  verifyAction: (token: string, pin: string) => Promise<VerifyResult>
  language?: SelectionLanguage
}) {
  const t = SELECTION_STRINGS[language]
  const [pin, setPin] = useState(['', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const refs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]
  const router = useRouter()

  function handleDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...pin]
    next[index] = digit
    setPin(next)
    setError(null)
    if (digit && index < 3) refs[index + 1].current?.focus()
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      refs[index - 1].current?.focus()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = pin.join('')
    if (code.length < 4) return
    setLoading(true)
    setError(null)
    try {
      const res = await verifyAction(token, code)
      if (res.ok) {
        router.refresh()
      } else {
        // Server-feilmeldingene er norske — vis lokalisert variant på engelsk
        setError(language === 'en' ? (res.locked ? t.tooManyAttempts(15) : t.wrongPin) : res.error ?? t.wrongPin)
        if (res.locked) setLocked(true)
        setPin(['', '', '', ''])
        refs[0].current?.focus()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: S.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 360, textAlign: 'center' }}>
        <div style={{
          fontFamily: 'Georgia, serif', fontSize: '1.6rem', letterSpacing: '0.12em',
          color: S.gold, marginBottom: 8, textTransform: 'uppercase',
        }}>
          Leafilms
        </div>
        <p style={{
          fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.82rem',
          color: S.text2, marginBottom: 40,
        }}>
          {t.photoSelection}
        </p>
        <div style={{
          background: S.surface, border: `1px solid ${S.border}`,
          borderRadius: 12, padding: '32px 28px',
        }}>
          <p style={{
            fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.95rem',
            color: S.text, marginBottom: 24, fontWeight: 500,
          }}>
            {t.enterPin}
          </p>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
              {pin.map((digit, i) => (
                <input
                  key={i}
                  ref={refs[i]}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  disabled={loading || locked}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  style={{
                    width: 52, height: 60, textAlign: 'center', fontSize: '1.4rem',
                    fontWeight: 700, fontFamily: 'var(--font-dm-sans, sans-serif)',
                    background: digit ? 'rgba(196,148,52,0.08)' : S.bg,
                    border: `2px solid ${digit ? S.gold : error ? S.danger : S.border}`,
                    borderRadius: 8, color: S.text,
                    outline: 'none', caretColor: S.gold,
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                />
              ))}
            </div>
            {error && (
              <p style={{
                fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.78rem',
                color: S.danger, marginBottom: 16, minHeight: 20,
              }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={pin.join('').length < 4 || loading || locked}
              style={{
                width: '100%', padding: '13px', borderRadius: 8, border: 'none',
                fontFamily: 'var(--font-dm-sans, sans-serif)', fontSize: '0.88rem',
                fontWeight: 600, cursor: 'pointer',
                background: pin.join('').length === 4 && !locked ? S.gold : '#2A2820',
                color: pin.join('').length === 4 && !locked ? '#0C0B09' : S.text2,
                transition: 'background 0.15s',
              }}
            >
              {loading ? t.verifying : locked ? t.locked : t.openGallery}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
