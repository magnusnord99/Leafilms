'use client'

import { useEffect, useRef, useState } from 'react'
import { getQuoteMessages, sendQuoteMessage } from '@/lib/actions/quotes'
import type { QuoteMessage } from '@/lib/types'
import { C } from '@/lib/admin-theme'

type Profile = { id: string; name: string | null }

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('nb-NO', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function parseMessage(msg: string): React.ReactNode[] {
  const parts = msg.split(/(@\S+)/g)
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: C.accent, fontWeight: 600 }}>{part}</span>
      : <span key={i}>{part}</span>
  )
}

export default function QuoteChat({
  quoteId,
  projectId,
  profiles,
}: {
  quoteId: string
  projectId: string
  profiles: Profile[]
}) {
  const [messages, setMessages] = useState<QuoteMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [mentionedIds, setMentionedIds] = useState<string[]>([])
  const [mentionSearch, setMentionSearch] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getQuoteMessages(quoteId).then(setMessages)
  }, [quoteId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setText(val)

    // Detect @mention trigger
    const cursor = e.target.selectionStart
    const before = val.slice(0, cursor)
    const match = before.match(/@(\w*)$/)
    setMentionSearch(match ? match[1] : null)
  }

  function insertMention(profile: Profile) {
    const name = profile.name ?? profile.id
    const cursor = textareaRef.current?.selectionStart ?? text.length
    const before = text.slice(0, cursor)
    const after = text.slice(cursor)
    const replaced = before.replace(/@(\w*)$/, `@${name} `)
    setText(replaced + after)
    setMentionedIds(prev => prev.includes(profile.id) ? prev : [...prev, profile.id])
    setMentionSearch(null)
    textareaRef.current?.focus()
  }

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    const result = await sendQuoteMessage({
      quoteId,
      projectId,
      message: text.trim(),
      mentionedUserIds: mentionedIds,
    })
    if (result.ok) {
      setText('')
      setMentionedIds([])
      const fresh = await getQuoteMessages(quoteId)
      setMessages(fresh)
    }
    setSending(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const mentionSuggestions = mentionSearch !== null
    ? profiles.filter(p =>
        (p.name ?? '').toLowerCase().includes(mentionSearch.toLowerCase())
      ).slice(0, 5)
    : []

  return (
    <div style={{ marginTop: 24 }}>
      <p style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600,
        color: C.text2, textTransform: 'uppercase' as const, letterSpacing: '0.08em',
        marginBottom: 12,
      }}>
        Tilbuds-chat
      </p>

      {/* Meldingsliste */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
        maxHeight: 320, overflowY: 'auto', padding: '12px 16px',
        display: 'flex', flexDirection: 'column', gap: 12,
        minHeight: 80,
      }}>
        {messages.length === 0 && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, fontStyle: 'italic' }}>
            Ingen meldinger ennå. Bruk @navn for å tagge noen.
          </p>
        )}
        {messages.map(msg => (
          <div key={msg.id}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, color: C.text }}>
                {msg.user?.name ?? msg.user?.email ?? 'Ukjent'}
              </span>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                {formatTime(msg.created_at)}
              </span>
            </div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text2, margin: 0, lineHeight: 1.5 }}>
              {parseMessage(msg.message)}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ position: 'relative', marginTop: 8 }}>
        {mentionSuggestions.length > 0 && (
          <div style={{
            position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
            zIndex: 20, minWidth: 180, overflow: 'hidden',
          }}>
            {mentionSuggestions.map(p => (
              <button
                key={p.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); insertMention(p) }}
                style={{
                  width: '100%', display: 'block', textAlign: 'left',
                  padding: '8px 12px', background: 'transparent', border: 'none',
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text,
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.surface2}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
              >
                {p.name ?? p.id}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="Skriv en melding... Bruk @navn for å tagge"
            style={{
              flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
              padding: '8px 12px', borderRadius: 6, resize: 'vertical',
              background: C.surface, border: `1px solid ${C.border}`,
              color: C.text, outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            style={{
              padding: '0 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.78rem', fontWeight: 600,
              opacity: !text.trim() || sending ? 0.5 : 1,
              alignSelf: 'flex-end', height: 36, flexShrink: 0,
            }}
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, marginTop: 4 }}>
          Enter for å sende · Shift+Enter for linjeskift
        </p>
      </div>
    </div>
  )
}
