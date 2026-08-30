'use client'

import { useEffect, useRef, useState } from 'react'
import { getTaskMessages, sendTaskMessage } from '@/lib/actions/pipeline'
import { extractMentionIds, splitMentionSegments, type MentionableProfile } from '@/lib/mentions'
import { MentionTextInput } from '@/components/shared/MentionTextInput'
import { MessageReactions } from '@/components/shared/MessageReactions'
import { getReactions, toggleReaction, type MessageReaction } from '@/lib/actions/reactions'
import { supabase } from '@/lib/supabase-client'
import type { TaskMessage } from '@/lib/types'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  }
  return (
    d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  )
}

type Props = {
  taskId: string
  taskTitle: string
  currentUserId: string | null
  profiles: MentionableProfile[]
}

export function TaskChat({ taskId, taskTitle, currentUserId, profiles }: Props) {
  const [messages, setMessages] = useState<TaskMessage[]>([])
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({})
  const [newMessage, setNewMessage] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<TaskMessage[]>([])

  async function loadMessages() {
    setLoadingMsgs(true)
    const msgs = await getTaskMessages(taskId)
    setMessages(msgs)
    messagesRef.current = msgs
    setLoadingMsgs(false)
    if (msgs.length > 0) {
      getReactions('task', msgs.map((m) => m.id)).then(setReactions)
    }
  }

  useEffect(() => {
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const channel = supabase
      .channel(`task-messages-${taskId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_messages', filter: `task_id=eq.${taskId}` },
        () => {
          loadMessages()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  // Realtime for reaksjoner — bredt filtrert på message_type (postgres_changes støtter ikke
  // "IN"-filter), henter reaksjonene på nytt for meldingene som faktisk er lastet inn.
  useEffect(() => {
    const channel = supabase
      .channel(`task-message-reactions-${taskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions', filter: 'message_type=eq.task' },
        (payload) => {
          const row = (payload.new ?? payload.old) as { message_id: string } | null
          if (!row || !messagesRef.current.some((m) => m.id === row.message_id)) return
          getReactions('task', messagesRef.current.map((m) => m.id)).then(setReactions)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [taskId])

  async function handleToggleReaction(messageId: string, emoji: string) {
    await toggleReaction('task', messageId, emoji)
  }

  async function handleSendMessage() {
    if (!newMessage.trim() || sendingMsg) return
    setSendingMsg(true)
    try {
      const mentions = extractMentionIds(newMessage.trim(), profiles)
      const result = await sendTaskMessage(taskId, newMessage.trim(), mentions)
      if (result.ok) {
        setNewMessage('')
        await loadMessages()
      }
    } finally {
      setSendingMsg(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: C.bg }}>
      {/* Chat header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Chat
        </p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 2 }}>
          {taskTitle}
        </p>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loadingMsgs ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textAlign: 'center', marginTop: 32 }}>Laster meldinger...</p>
        ) : messages.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textAlign: 'center', marginTop: 32 }}>
            Ingen meldinger ennå. Start diskusjonen!
          </p>
        ) : (
          messages.map(msg => {
            const isMe = currentUserId === msg.user_id
            const senderName = msg.user?.name ?? msg.user?.email?.split('@')[0] ?? 'Ukjent'
            return (
              <div key={msg.id} className="group" style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!isMe && (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.surface2, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.55rem', fontWeight: 700, color: C.text2 }}>
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
                  maxWidth: '85%', padding: '8px 12px', borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: isMe ? C.accentBg : C.surface,
                  border: `1px solid ${isMe ? 'rgba(124,92,252,0.2)' : C.border}`,
                }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Message input */}
      <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <MentionTextInput
          value={newMessage}
          onChange={setNewMessage}
          onEnter={handleSendMessage}
          profiles={profiles}
          as="textarea"
          rows={2}
          placeholder="Skriv en melding... (Enter for å sende)"
          style={{
            flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem',
            color: C.text, background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 8,
            padding: '9px 12px', resize: 'none', outline: 'none', lineHeight: 1.5,
            width: '100%',
          }}
        />
        <button
          onClick={handleSendMessage}
          disabled={!newMessage.trim() || sendingMsg}
          style={{
            width: 38, height: 38, borderRadius: 8, flexShrink: 0,
            background: newMessage.trim() ? C.accent : C.surface2,
            border: 'none', cursor: newMessage.trim() && !sendingMsg ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: !newMessage.trim() || sendingMsg ? 0.5 : 1,
            transition: 'background 0.15s, opacity 0.15s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 8L2 3L5.5 8L2 13L14 8Z" fill="white" />
          </svg>
        </button>
      </div>
    </div>
  )
}
