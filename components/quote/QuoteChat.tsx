'use client'

import { useEffect, useRef, useState } from 'react'
import { getQuoteMessages, sendQuoteMessage } from '@/lib/actions/quotes'
import type { QuoteMessage } from '@/lib/types'
import { C } from '@/lib/admin-theme'
import { extractMentionIds, splitMentionSegments, type MentionableProfile } from '@/lib/mentions'
import { MentionTextInput } from '@/components/shared/MentionTextInput'
import { supabase } from '@/lib/supabase-client'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('nb-NO', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function QuoteChat({
  quoteId,
  projectId,
  profiles,
}: {
  quoteId: string
  projectId: string
  profiles: MentionableProfile[]
}) {
  const [messages, setMessages] = useState<QuoteMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function loadMessages() {
    const msgs = await getQuoteMessages(quoteId)
    setMessages(msgs)
  }

  useEffect(() => {
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const channel = supabase
      .channel(`quote-messages-${quoteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quote_messages', filter: `quote_id=eq.${quoteId}` },
        () => {
          loadMessages()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId])

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const result = await sendQuoteMessage({
        quoteId,
        projectId,
        message: text.trim(),
        mentionedUserIds: extractMentionIds(text.trim(), profiles),
      })
      if (result.ok) {
        setText('')
        await loadMessages()
      }
    } finally {
      setSending(false)
    }
  }

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
              {splitMentionSegments(msg.message, msg.mentions, profiles).map((seg, i) =>
                seg.isMention
                  ? <span key={i} style={{ color: C.accent, fontWeight: 600 }}>{seg.text}</span>
                  : <span key={i}>{seg.text}</span>
              )}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <MentionTextInput
            value={text}
            onChange={setText}
            onEnter={handleSend}
            profiles={profiles}
            as="textarea"
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
