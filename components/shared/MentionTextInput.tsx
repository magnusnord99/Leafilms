'use client'

import { useRef, useState } from 'react'
import { mentionToken, type MentionableProfile } from '@/lib/mentions'

type Props = {
  value: string
  onChange: (value: string) => void
  onEnter: () => void
  profiles: MentionableProfile[]
  as?: 'input' | 'textarea'
  rows?: number
  placeholder?: string
  disabled?: boolean
  style?: React.CSSProperties
  className?: string
}

function detectMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const uptoCaret = text.slice(0, caret)
  const at = uptoCaret.lastIndexOf('@')
  if (at === -1) return null
  const before = uptoCaret[at - 1]
  if (before !== undefined && !/\s/.test(before)) return null
  const fragment = uptoCaret.slice(at + 1)
  if (/\s/.test(fragment)) return null
  return { start: at, query: fragment }
}

export function MentionTextInput({
  value, onChange, onEnter, profiles, as = 'input', rows, placeholder, disabled, style, className,
}: Props) {
  const [query, setQuery] = useState<string | null>(null)
  const [queryStart, setQueryStart] = useState(0)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  const matches = query === null
    ? []
    : profiles.filter(p => mentionToken(p).toLowerCase().startsWith(query.toLowerCase())).slice(0, 6)

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const next = e.target.value
    onChange(next)
    const caret = e.target.selectionStart ?? next.length
    const detected = detectMentionQuery(next, caret)
    if (detected) {
      setQuery(detected.query)
      setQueryStart(detected.start)
      setHighlightIdx(0)
    } else {
      setQuery(null)
    }
  }

  // Keeps the mention-query state in sync with caret movement that isn't a
  // text change (click-to-reposition, arrow-key navigation, etc). Without
  // this, `queryStart` can go stale relative to the caret: the dropdown stays
  // open (it's anchored to the box, not the caret, so it doesn't visually
  // reveal a stale state) while `selectMatch` reads a fresh caret position at
  // click time, splicing text at two unrelated cursor positions.
  function handleSelect(e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement
    const caret = target.selectionStart ?? target.value.length
    const detected = detectMentionQuery(target.value, caret)
    if (detected) {
      setQuery(detected.query)
      setQueryStart(detected.start)
      setHighlightIdx(0)
    } else {
      setQuery(null)
    }
  }

  function selectMatch(profile: MentionableProfile) {
    if (query === null || !ref.current) return
    const caret = ref.current.selectionStart ?? value.length
    const token = mentionToken(profile)
    const next = value.slice(0, queryStart) + `@${token} ` + value.slice(caret)
    onChange(next)
    setQuery(null)
    requestAnimationFrame(() => {
      const pos = queryStart + token.length + 2
      ref.current?.setSelectionRange(pos, pos)
      ref.current?.focus()
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (query !== null && matches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => (i + 1) % matches.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => (i - 1 + matches.length) % matches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMatch(matches[highlightIdx]); return }
      if (e.key === 'Escape') { e.preventDefault(); setQuery(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onEnter()
    }
  }

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
      {as === 'textarea' ? (
        <textarea
          ref={ref}
          rows={rows}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          placeholder={placeholder}
          disabled={disabled}
          style={style}
          className={className}
        />
      ) : (
        <input
          ref={ref}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          placeholder={placeholder}
          disabled={disabled}
          style={style}
          className={className}
        />
      )}
      {query !== null && matches.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            background: '#21212D',
            border: '1px solid #3C3C52',
            borderRadius: 8,
            overflow: 'hidden',
            zIndex: 200,
            minWidth: 160,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectMatch(p) }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                background: i === highlightIdx ? 'rgba(124,92,252,0.15)' : 'transparent',
                border: 'none',
                color: '#EEEEF2',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              @{mentionToken(p)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
