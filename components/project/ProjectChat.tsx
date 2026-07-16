'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { getAllProfiles } from '@/lib/actions/pipeline'
import { extractMentionIds, splitMentionSegments, type MentionableProfile } from '@/lib/mentions'
import { MentionTextInput } from '@/components/shared/MentionTextInput'
import { MessageReactions } from '@/components/shared/MessageReactions'
import { getReactions, toggleReaction, type MessageReaction } from '@/lib/actions/reactions'
import type { ProjectMessage } from '@/lib/types'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
}

type Props = {
  projectId: string
  forceOpen?: boolean
}

export function ProjectChat({ projectId, forceOpen }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ProjectMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  const [profiles, setProfiles] = useState<MentionableProfile[]>([])
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({})
  const bottomRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)

  useEffect(() => {
    getAllProfiles().then(setProfiles)
  }, [])

  // Deep-link fra varsel — åpne chatten automatisk (samme mønster som TaskChatToggle)
  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

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

  // Realtime for reaksjoner — bredt filtrert på message_type (postgres_changes støtter ikke
  // "IN"-filter), sjekker selv om meldingen tilhører denne samtalen før state oppdateres.
  useEffect(() => {
    const channel = supabase
      .channel(`project-message-reactions-${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: 'message_type=eq.project' },
        (payload) => {
          const row = payload.new as { message_id: string; user_id: string; emoji: string; user_name?: string }
          setReactions((prev) => {
            const list = prev[row.message_id]
            if (list === undefined) return prev
            if (list.some((r) => r.userId === row.user_id && r.emoji === row.emoji)) return prev
            const profile = profiles.find((p) => p.id === row.user_id)
            return {
              ...prev,
              [row.message_id]: [...list, { emoji: row.emoji, userId: row.user_id, userName: profile?.name || 'Ukjent' }],
            }
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions', filter: 'message_type=eq.project' },
        (payload) => {
          const row = payload.old as { message_id: string; user_id: string; emoji: string }
          setReactions((prev) => {
            const list = prev[row.message_id]
            if (list === undefined) return prev
            return { ...prev, [row.message_id]: list.filter((r) => !(r.userId === row.user_id && r.emoji === row.emoji)) }
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [projectId, profiles])

  // Nullstill unread når chatten åpnes (state-justering under render, jf. react.dev)
  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) setUnread(0)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchMessages() {
    const res = await fetch(`/api/projects/${projectId}/messages`)
    if (res.ok) {
      const { messages: data } = await res.json()
      const list: ProjectMessage[] = data || []
      setMessages(list)
      if (list.length > 0) {
        getReactions('project', list.map((m) => m.id)).then(setReactions)
      }
    }
  }

  // Ingen optimistisk oppdatering nødvendig — realtime-subscriptionen over leverer
  // INSERT/DELETE-eventet tilbake til samme klient i løpet av noen hundre ms.
  async function handleToggleReaction(messageId: string, emoji: string) {
    await toggleReaction('project', messageId, emoji)
  }

  // Hent meldinger når chatten åpnes
  useEffect(() => {
    if (!open) return
    fetchMessages()
  }, [open, projectId])

  async function sendMessage() {
    if (!input.trim() || sending) return
    setSending(true)
    const content = input.trim()
    const mentions = extractMentionIds(content, profiles)
    try {
      const res = await fetch(`/api/projects/${projectId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, mentions }),
      })
      if (res.ok) {
        const { message } = await res.json()
        setInput('')
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === message.id)
          if (exists) return prev
          return [...prev, message]
        })
      }
    } finally {
      setSending(false)
    }
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
      {/* Trigger button — fast plassert øverst til høyre, rett under global toppbar */}
      <button
        onClick={() => {
          setOpen((o) => !o)
          setUnread(0)
        }}
        title="Prosjektchat"
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
            Prosjektchat
          </p>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && (
            <p style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.72rem',
              color: C.text3,
              textAlign: 'center',
              marginTop: 32,
            }}>
              Ingen meldinger ennå
            </p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className="group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.65rem',
                  fontWeight: 500,
                  color: C.text3,
                }}>
                  {msg.user_name || 'Ukjent'}
                </span>
                <span style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.6rem',
                  color: C.text3,
                }}>
                  {formatDate(msg.created_at)} {formatTime(msg.created_at)}
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
                  {splitMentionSegments(msg.content, msg.mentions, profiles).map((seg, i) =>
                    seg.isMention
                      ? <span key={i} style={{ color: C.accent, fontWeight: 600 }}>{seg.text}</span>
                      : <span key={i}>{seg.text}</span>
                  )}
                </p>
              </div>
              <MessageReactions
                reactions={reactions[msg.id] ?? []}
                onToggle={(emoji) => handleToggleReaction(msg.id, emoji)}
              />
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage() }}
          style={{
            flexShrink: 0,
            padding: '12px 16px',
            borderTop: `1px solid ${C.border}`,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-end',
          }}
        >
          <MentionTextInput
            value={input}
            onChange={setInput}
            onEnter={sendMessage}
            profiles={profiles}
            as="textarea"
            rows={1}
            placeholder="Skriv en melding..."
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
              resize: 'none',
              lineHeight: 1.5,
              width: '100%',
            }}
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              flexShrink: 0,
              background: input.trim() ? C.accent : C.surface2,
              border: 'none',
              cursor: input.trim() && !sending ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !input.trim() || sending ? 0.5 : 1,
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
