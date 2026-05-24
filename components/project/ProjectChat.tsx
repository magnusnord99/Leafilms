'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import type { ProjectMessage } from '@/lib/types'

type Props = {
  projectId: string
}

export function ProjectChat({ projectId }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ProjectMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)

  useEffect(() => {
    openRef.current = open
  }, [open])

  // Realtime-subscription kjører alltid — uavhengig av om chatten er åpen
  useEffect(() => {
    const channel = supabase
      .channel(`project-messages-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_messages',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const newMessage = payload.new as ProjectMessage
          if (openRef.current) {
            setMessages((prev) => {
              const exists = prev.some((m) => m.id === newMessage.id)
              if (exists) return prev
              return [...prev, newMessage]
            })
          } else {
            setUnread((u) => u + 1)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId])

  // Fetch meldinger og nullstill unread når chatten åpnes
  useEffect(() => {
    if (!open) return
    setUnread(0)
    fetchMessages()
  }, [open, projectId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchMessages() {
    const res = await fetch(`/api/projects/${projectId}/messages`)
    if (res.ok) {
      const { messages: data } = await res.json()
      setMessages(data || [])
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    const content = input.trim()
    setInput('')
    const res = await fetch(`/api/projects/${projectId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    })
    if (res.ok) {
      const { message } = await res.json()
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === message.id)
        if (exists) return prev
        return [...prev, message]
      })
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
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => {
          setOpen((o) => !o)
          setUnread(0)
        }}
        title="Prosjektchat"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
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
        {unread > 0 && !open && (
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
            {unread}
          </span>
        )}
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2 6a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H7l-4 3V6z" />
        </svg>
      </button>

      {/* Chat panel */}
      {open && (
        <div
          style={{
            position: 'fixed',
            bottom: 84,
            right: 24,
            zIndex: 50,
            width: 320,
            maxHeight: 480,
            display: 'flex',
            flexDirection: 'column',
            background: '#0E0D0B',
            border: '1px solid #2A261F',
            borderRadius: 8,
            boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
            overflow: 'hidden',
          }}
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
              Prosjektchat
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ color: '#62594E', lineHeight: 0, padding: 2 }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M1 1l10 10M11 1L1 11" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <p style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                color: '#3D3829',
                textAlign: 'center',
                marginTop: 24,
                letterSpacing: '0.04em',
              }}>
                Ingen meldinger ennå
              </p>
            )}
            {messages.map((msg) => (
              <div key={msg.id}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                  <span style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.6rem',
                    color: '#C49434',
                    fontWeight: 500,
                    letterSpacing: '0.06em',
                  }}>
                    {msg.user_name || 'Ukjent'}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.55rem',
                    color: '#3D3829',
                    letterSpacing: '0.04em',
                  }}>
                    {formatDate(msg.created_at)} {formatTime(msg.created_at)}
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
                  {msg.content}
                </p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={sendMessage}
            style={{
              borderTop: '1px solid #2A261F',
              display: 'flex',
              gap: 0,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Skriv en melding..."
              disabled={sending}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                padding: '10px 12px',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.7rem',
                color: '#E8E1D5',
                letterSpacing: '0.03em',
              }}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              style={{
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderLeft: '1px solid #2A261F',
                color: input.trim() ? '#C49434' : '#2A261F',
                cursor: input.trim() ? 'pointer' : 'default',
                lineHeight: 0,
                transition: 'color 0.15s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 8L2 2l3 6-3 6 12-6z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </>
  )
}
