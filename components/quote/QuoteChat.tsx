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
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<QuoteMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
  }, [open])

  async function loadMessages() {
    const msgs = await getQuoteMessages(quoteId)
    setMessages(msgs)
  }

  // Hent meldinger når chatten åpnes (samme mønster som prosjektchatten)
  useEffect(() => {
    if (!open) return
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, quoteId])

  // Nullstill unread når chatten åpnes
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) setUnread(0)
  }

  // Scroll kun den interne meldingslisten til bunns — ikke hele siden
  // (scrollIntoView ville også scrollet ytre siden siden chatten tidligere lå inline i skjemaet)
  useEffect(() => {
    if (!open) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, open])

  // Realtime-subscription kjører alltid — uavhengig av om chatten er åpen
  useEffect(() => {
    const channel = supabase
      .channel(`quote-messages-${quoteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quote_messages', filter: `quote_id=eq.${quoteId}` },
        () => {
          if (openRef.current) {
            loadMessages()
          } else {
            setUnread(u => u + 1)
          }
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
    <>
      {/* Trigger-knapp — fast plassert øverst til høyre, samme sted som prosjektchatten */}
      <button
        onClick={() => setOpen(o => !o)}
        title="Tilbuds-chat"
        style={{
          position: 'fixed',
          top: 58,
          right: 16,
          zIndex: 96,
          width: 40,
          height: 40,
          borderRadius: 8,
          background: open ? C.accent : C.surface,
          border: `1px solid ${open ? C.accent : C.border}`,
          color: open ? '#fff' : C.text2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        }}
      >
        {unread > 0 && !open && (
          <span style={{
            position: 'absolute',
            top: -5,
            right: -5,
            background: C.accent,
            color: '#fff',
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
            {unread}
          </span>
        )}
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2 6a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H7l-4 3V6z" />
        </svg>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 94,
            background: 'rgba(0,0,0,0.4)',
          }}
        />
      )}

      {/* Chat panel — fullhøyde slide-in fra høyre kant */}
      <div
        style={{
          position: 'fixed',
          top: 48,
          right: 0,
          zIndex: 95,
          height: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          background: C.bg,
          borderLeft: `1px solid ${C.border}`,
          boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.22s ease',
          pointerEvents: open ? 'auto' : 'none',
        }}
        className="w-full sm:w-[360px]"
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px 12px',
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <p style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.72rem',
            fontWeight: 600,
            color: C.text2,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Tilbuds-chat
          </p>
        </div>

        {/* Meldinger */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && (
            <p style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.72rem',
              color: C.text3,
              textAlign: 'center',
              marginTop: 32,
              fontStyle: 'italic',
            }}>
              Ingen meldinger ennå. Bruk @navn for å tagge noen.
            </p>
          )}
          {messages.map(msg => (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, color: C.text3 }}>
                  {msg.user?.name ?? msg.user?.email ?? 'Ukjent'}
                </span>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3 }}>
                  {formatTime(msg.created_at)}
                </span>
              </div>
              <div style={{
                maxWidth: '90%',
                padding: '8px 12px',
                borderRadius: '12px 12px 12px 4px',
                background: C.surface,
                border: `1px solid ${C.border}`,
              }}>
                <p style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.78rem',
                  color: C.text,
                  lineHeight: 1.5,
                  margin: 0,
                  wordBreak: 'break-word',
                }}>
                  {splitMentionSegments(msg.message, msg.mentions, profiles).map((seg, i) =>
                    seg.isMention
                      ? <span key={i} style={{ color: C.accent, fontWeight: 600 }}>{seg.text}</span>
                      : <span key={i}>{seg.text}</span>
                  )}
                </p>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend() }}
          style={{
            flexShrink: 0,
            padding: '12px 16px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <MentionTextInput
            value={text}
            onChange={setText}
            onEnter={handleSend}
            profiles={profiles}
            as="input"
            placeholder="Skriv en melding... Bruk @navn for å tagge"
            disabled={sending}
            style={{
              flex: 1,
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.78rem',
              color: C.text,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: '9px 12px',
              outline: 'none',
              width: '100%',
            }}
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              flexShrink: 0,
              background: text.trim() ? C.accent : C.surface2,
              border: 'none',
              cursor: text.trim() && !sending ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !text.trim() || sending ? 0.5 : 1,
              transition: 'background 0.15s, opacity 0.15s',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M14 8L2 3L5.5 8L2 13L14 8Z" fill="white" />
            </svg>
          </button>
        </form>
      </div>
    </>
  )
}
