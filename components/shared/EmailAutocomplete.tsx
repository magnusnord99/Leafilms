'use client'

import { useState } from 'react'
import type { EmailSuggestion } from '@/lib/actions/pipeline'

type Props = {
  value: string
  onChange: (value: string) => void
  suggestions: EmailSuggestion[]
  /** 'single' = Til-felt, hele verdien erstattes ved valg. 'multi' = Kopi-felt, kommaseparert liste. */
  mode?: 'single' | 'multi'
  type?: 'email' | 'text'
  placeholder?: string
  style?: React.CSSProperties
  borderColor?: string
  focusBorderColor?: string
}

/** Teksten fra siste komma (eller starten) til markøren — det brukeren faktisk skriver på nå. */
function currentFragment(value: string, mode: 'single' | 'multi'): string {
  if (mode === 'single') return value
  const lastComma = Math.max(value.lastIndexOf(','), value.lastIndexOf(';'))
  return value.slice(lastComma + 1).trim()
}

export function EmailAutocomplete({
  value, onChange, suggestions, mode = 'single', type = 'text', placeholder, style,
  borderColor = '#3C3C52', focusBorderColor = '#7C5CFC',
}: Props) {
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)

  const fragment = currentFragment(value, mode).toLowerCase()
  const matches = fragment.length < 2
    ? []
    : suggestions
        .filter(s => s.email.toLowerCase().includes(fragment) || s.label?.toLowerCase().includes(fragment))
        .slice(0, 6)

  function selectMatch(s: EmailSuggestion) {
    if (mode === 'single') {
      onChange(s.email)
    } else {
      const lastSep = Math.max(value.lastIndexOf(','), value.lastIndexOf(';'))
      const prefix = lastSep === -1 ? '' : value.slice(0, lastSep + 1) + ' '
      onChange(`${prefix}${s.email}, `)
    }
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => (i + 1) % matches.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => (i - 1 + matches.length) % matches.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMatch(matches[highlightIdx]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type={type}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlightIdx(0) }}
        onFocus={e => { setOpen(true); e.currentTarget.style.borderColor = focusBorderColor }}
        onBlur={e => { e.currentTarget.style.borderColor = borderColor; setTimeout(() => setOpen(false), 120) }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={style}
      />
      {open && matches.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            background: '#21212D',
            border: '1px solid #3C3C52',
            borderRadius: 8,
            overflow: 'hidden',
            zIndex: 200,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {matches.map((s, i) => (
            <button
              key={s.email}
              type="button"
              onMouseDown={e => { e.preventDefault(); selectMatch(s) }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '7px 12px',
                background: i === highlightIdx ? 'rgba(124,92,252,0.15)' : 'transparent',
                border: 'none',
                color: '#EEEEF2',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              {s.label && <span style={{ fontWeight: 600 }}>{s.label}</span>}
              <span style={{ color: '#8484A0', marginLeft: s.label ? 6 : 0 }}>{s.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
