'use client'

import { useEffect, useRef, useState } from 'react'
import { getTaskMessages, markTaskMessagesRead, sendTaskMessage } from '@/lib/actions/pipeline'
import { extractMentionIds, splitMentionSegments, type MentionableProfile } from '@/lib/mentions'
import { MentionTextInput } from '@/components/shared/MentionTextInput'
import { MessageReactions } from '@/components/shared/MessageReactions'
import { getReactions, toggleReaction, type MessageReaction } from '@/lib/actions/reactions'
import { supabase } from '@/lib/supabase-client'
import { C } from '@/lib/admin-theme'
import type { TaskMessage } from '@/lib/types'
import { markConversationRead } from '@/lib/actions/messages'

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' }) + ' · ' + d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
}

// Flytende chat-panel som slår seg av/på — samme skall (knapp, backdrop, sleng-inn
// fra høyre, uleste-badge, ?chat=1-dyplenke) som QuoteChat på tilbudssiden, men for
// en enkelt oppgaves task_messages i stedet for et tilbuds quote_messages. Erstatter
// den tidligere alltid-synlige TaskChat-splitten i postprod (se app/admin/postprod/[id]/page.tsx).
export default function TaskChatPanel({
  taskId,
  taskTitle,
  currentUserId,
  profiles,
  forceOpen,
  conversationId,
  triggerTop = 58,
  initialUnread = 0,
}: {
  taskId: string
  taskTitle: string
  currentUserId: string | null
  profiles: MentionableProfile[]
  forceOpen?: boolean
  conversationId?: string
  triggerTop?: number
  initialUnread?: number
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<TaskMessage[]>([])
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({})
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(initialUnread)
  const [error, setError] = useState<string | null>(null)
  const reactionType = conversationId ? 'conversation' : 'task'
  const bottomRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)
  const messagesRef = useRef<TaskMessage[]>([])

  // Deep-link fra varsel — åpne chatten automatisk (samme mønster som QuoteChat)
  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  useEffect(() => {
    openRef.current = open
  }, [open])

  async function loadMessages() {
    try {
      let msgs: TaskMessage[]
      if (conversationId) {
        const response = await fetch(`/api/messages/${conversationId}`)
        if (!response.ok) { setError('Kunne ikke hente meldinger. Prøv igjen.'); return }
        const data = await response.json() as { messages: { id: string; sender_id: string; content: string; mentions: string[]; urgent: boolean; created_at: string }[] }
        msgs = data.messages.map(message => ({
          id: message.id, task_id: taskId, user_id: message.sender_id,
          message: message.content, mentions: message.mentions ?? [],
          urgent: message.urgent ?? false, created_at: message.created_at,
          user: profiles.find(profile => profile.id === message.sender_id),
        }))
      } else {
        msgs = await getTaskMessages(taskId)
      }
      setError(null)
      setMessages(msgs)
      messagesRef.current = msgs
      if (msgs.length > 0) {
        getReactions(reactionType, msgs.map(m => m.id)).then(setReactions)
      }
    } catch {
      setError('Kunne ikke hente meldinger. Sjekk forbindelsen og prøv igjen.')
    }
  }

  // Bytter man valgt oppgave mens panelet er åpent, må meldingslisten friskes opp —
  // ellers henger forrige oppgaves meldinger igjen inntil neste åpning.
  useEffect(() => {
    setMessages([])
    setReactions({})
    if (open) loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, conversationId, reactionType])

  useEffect(() => {
    if (!open) return
    loadMessages()
    if (conversationId) void markConversationRead(conversationId)
    else void markTaskMessagesRead(taskId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId, conversationId])

  const [prevOpen, setPrevOpen] = useState(open)
  if (prevOpen !== open) {
    setPrevOpen(open)
    if (open) setUnread(0)
  }

  useEffect(() => {
    if (!open) return
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, open])

  useEffect(() => {
    const channel = supabase
      .channel(`task-messages-${taskId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: conversationId ? 'conversation_messages' : 'task_messages', filter: conversationId ? `conversation_id=eq.${conversationId}` : `task_id=eq.${taskId}` },
        () => {
          if (openRef.current) {
            void loadMessages()
            if (conversationId) void markConversationRead(conversationId)
          }
          else setUnread(u => u + 1)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, conversationId, reactionType])

  useEffect(() => {
    const channel = supabase
      .channel(`task-message-reactions-${taskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions', filter: `message_type=eq.${reactionType}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { message_id: string } | null
          if (!row || !messagesRef.current.some(m => m.id === row.message_id)) return
          getReactions(reactionType, messagesRef.current.map(m => m.id)).then(setReactions)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [taskId, conversationId, reactionType])

  // Hent reaksjonene for akkurat denne meldingen på nytt etter toggle — realtime alene
  // holder ikke: Supabase leverer ikke DELETE-events på filtrerte kanaler, så fjernede
  // reaksjoner ble stående til siden ble lastet på nytt (feedback c45ecd6d).
  async function handleToggleReaction(messageId: string, emoji: string) {
    const result = await toggleReaction(reactionType, messageId, emoji)
    if (!result.ok) return
    const fresh = await getReactions(reactionType, [messageId])
    setReactions((prev) => ({ ...prev, [messageId]: fresh[messageId] ?? [] }))
  }

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const mentions = extractMentionIds(text.trim(), profiles)
      const result = conversationId
        ? await fetch(`/api/messages/${conversationId}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: text.trim(), mentions }),
          })
        : await sendTaskMessage(taskId, text.trim(), mentions)
      if (result.ok) {
        setText('')
        await loadMessages()
      } else { setError('Kunne ikke sende meldingen. Prøv igjen.') }
    } catch {
      setError('Kunne ikke sende meldingen. Sjekk forbindelsen og prøv igjen.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Trigger-knapp — fast plassert øverst til høyre, samme sted/stil som tilbuds-chatten */}
      <button
        onClick={() => setOpen(o => !o)}
        title={conversationId ? 'Intern flyer-chat' : 'Oppgave-chat'}
        aria-label={conversationId ? 'Åpne intern flyer-chat' : 'Åpne oppgave-chat'}
        aria-expanded={open}
        style={{
          position: 'fixed', top: triggerTop, right: 16, zIndex: 96,
          width: 40, height: 40, borderRadius: 8,
          background: open ? C.accent : C.surface,
          border: `1px solid ${open ? C.accent : C.border}`,
          color: open ? '#fff' : C.text2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          transition: 'background 0.15s, color 0.15s, border-color 0.15s',
        }}
      >
        {unread > 0 && !open && (
          <span style={{
            position: 'absolute', top: -5, right: -5, background: C.accent, color: '#fff',
            borderRadius: '50%', width: 18, height: 18, fontSize: '0.55rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-dm-sans)',
          }}>
            {unread}
          </span>
        )}
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2 6a2 2 0 012-2h12a2 2 0 012 2v7a2 2 0 01-2 2H7l-4 3V6z" />
        </svg>
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 94, background: 'rgba(0,0,0,0.4)' }} />
      )}

      <div
        style={{
          position: 'fixed', top: 48, right: 0, zIndex: 95,
          height: 'calc(100dvh - 48px)', display: 'flex', flexDirection: 'column',
          background: C.bg, borderLeft: `1px solid ${C.border}`,
          boxShadow: '-8px 0 40px rgba(0,0,0,0.5)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.22s ease', pointerEvents: open ? 'auto' : 'none',
        }}
        className="w-full sm:w-[360px]"
      >
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Chat
          </p>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {taskTitle}
          </p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.length === 0 && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textAlign: 'center', marginTop: 32, fontStyle: 'italic' }}>
              Ingen meldinger ennå. Bruk @navn for å tagge noen.
            </p>
          )}
          {messages.map(msg => {
            const isMe = currentUserId === msg.user_id
            const senderName = msg.user?.name ?? msg.user?.email?.split('@')[0] ?? 'Ukjent'
            return (
              <div key={msg.id} className="group" style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!isMe && (
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: C.surface2, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.52rem', fontWeight: 700, color: C.text2 }}>
                        {senderName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, color: isMe ? C.accent : C.text3 }}>
                    {isMe ? 'Du' : senderName}
                  </span>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3 }}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
                <div style={{
                  maxWidth: '90%', padding: '8px 12px',
                  borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: isMe ? C.accentBg : C.surface,
                  border: `1px solid ${isMe ? 'rgba(124,92,252,0.2)' : C.border}`,
                }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {splitMentionSegments(msg.message, msg.mentions, profiles).map((seg, i) =>
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
            )
          })}
          <div ref={bottomRef} />
        </div>

        {error && <p role="alert" style={{ padding: '8px 16px', color: '#E05A4A', fontSize: '0.75rem' }}>{error}</p>}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend() }}
          style={{ flexShrink: 0, padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}
        >
          <MentionTextInput
            value={text}
            onChange={setText}
            onEnter={handleSend}
            profiles={profiles}
            as="textarea"
            rows={1}
            placeholder="Skriv en melding... Bruk @navn for å tagge"
            disabled={sending}
            style={{
              flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', color: C.text,
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
              padding: '9px 12px', outline: 'none', resize: 'none', lineHeight: 1.5, width: '100%',
            }}
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            style={{
              width: 38, height: 38, borderRadius: 8, flexShrink: 0,
              background: text.trim() ? C.accent : C.surface2, border: 'none',
              cursor: text.trim() && !sending ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: !text.trim() || sending ? 0.5 : 1, transition: 'background 0.15s, opacity 0.15s',
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
