'use client'

import { useState, useRef, useEffect } from 'react'
import { C } from '@/lib/admin-theme'
import { AIChatMessage } from './AIChatMessage'
import type { ChatMessage } from '@/lib/ai/chat'

interface Props {
  onClose: () => void
}

export function AIChatPanel({ onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hei! Jeg kan hjelpe deg med informasjon om prosjekter, leads, kunder og oppgaver. Hva lurer du på?' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const content = input.trim()
    if (!content || loading) return

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Legg til tom assistent-melding som fylles under streaming
    setMessages((m) => [...m, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })

      if (!res.ok || !res.body) {
        setMessages((m) => {
          const updated = [...m]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: 'Beklager, noe gikk galt. Prøv igjen.',
          }
          return updated
        })
        return
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let text = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += dec.decode(value, { stream: true })
        setMessages((m) => {
          const updated = [...m]
          updated[updated.length - 1] = { role: 'assistant', content: text }
          return updated
        })
      }
    } catch {
      setMessages((m) => {
        const updated = [...m]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Nettverksfeil. Sjekk tilkoblingen og prøv igjen.',
        }
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 68,
        right: 20,
        width: 'min(360px, calc(100vw - 40px))',
        maxHeight: 520,
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        zIndex: 95,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: C.accentBg,
              border: `1px solid ${C.accent}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
            }}
          >
            ✦
          </div>
          <span
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: C.text,
            }}
          >
            Leafilms AI
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: C.text3,
            cursor: 'pointer',
            fontSize: '1.1rem',
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      </div>

      {/* Meldingsliste */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
        }}
      >
        {messages.map((msg, i) => (
          <AIChatMessage key={i} message={msg} />
        ))}
        {loading && messages[messages.length - 1]?.content === '' && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '8px 12px',
              alignItems: 'center',
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: C.text3,
                  animation: `ai-dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '10px 12px',
          borderTop: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Spør om et prosjekt, lead, pris..."
          disabled={loading}
          style={{
            flex: 1,
            background: C.surface2,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '8px 10px',
            color: C.text,
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.8rem',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            background: C.accent,
            border: 'none',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#fff',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.5 : 1,
            transition: 'opacity 0.12s',
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
