'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { markConversationRead, type ConversationParticipant } from '@/lib/actions/messages'
import { addConversationMember, removeConversationMember } from '@/lib/actions/production-chat'
import { getReactions, toggleReaction, type MessageReaction } from '@/lib/actions/reactions'
import { MessageReactions } from '@/components/shared/MessageReactions'
import { getAvatarColor } from '@/lib/avatar-colors'
import { C } from '@/lib/admin-theme'

type ConversationMessage = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
}

type Props = {
  conversationId: string
  currentUser: { id: string; name: string | null; email: string; color: string | null }
  initialMembers: ConversationParticipant[]
  allProfiles: ConversationParticipant[]
}

function displayName(p: { name: string | null; email: string }) {
  return p.name || p.email
}

function Avatar({ p, size = 26 }: { p: ConversationParticipant; size?: number }) {
  const initials = displayName(p)[0]?.toUpperCase() ?? '?'
  const color = getAvatarColor(p)
  return (
    <div title={displayName(p)} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `${color}22`, border: `1.5px solid ${color}55`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-dm-sans)', fontSize: size * 0.4, fontWeight: 700, color,
    }}>
      {initials}
    </div>
  )
}

export function ProductionChat({ conversationId, currentUser, initialMembers, allProfiles }: Props) {
  const [members, setMembers] = useState<ConversationParticipant[]>(initialMembers)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({})
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showAddPicker, setShowAddPicker] = useState(false)
  const [pickerFilter, setPickerFilter] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/messages/${conversationId}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const list: ConversationMessage[] = data.messages ?? []
        setMessages(list)
        if (list.length > 0) {
          getReactions('conversation', list.map((m) => m.id)).then((r) => { if (!cancelled) setReactions(r) })
        }
      })
    markConversationRead(conversationId)
    return () => { cancelled = true }
  }, [conversationId])

  useEffect(() => {
    const channel = supabase
      .channel(`production-chat-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const msg = payload.new as ConversationMessage
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
          if (msg.sender_id !== currentUser.id) markConversationRead(conversationId)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, currentUser.id])

  // Sanntidsoppdatering av reaksjoner i denne produksjonschatten
  useEffect(() => {
    const channel = supabase
      .channel(`production-chat-reactions-${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions', filter: 'message_type=eq.conversation' },
        (payload) => {
          const r = payload.new as { message_id: string; emoji: string; user_id: string }
          const profile = allProfiles.find((p) => p.id === r.user_id)
          setReactions((prev) => {
            const list = prev[r.message_id] ?? []
            if (list.some((x) => x.userId === r.user_id && x.emoji === r.emoji)) return prev
            return { ...prev, [r.message_id]: [...list, { emoji: r.emoji, userId: r.user_id, userName: displayName(profile ?? { name: null, email: 'Ukjent' }) }] }
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions', filter: 'message_type=eq.conversation' },
        (payload) => {
          const r = payload.old as { message_id: string; emoji: string; user_id: string }
          setReactions((prev) => {
            const list = prev[r.message_id]
            if (!list) return prev
            return { ...prev, [r.message_id]: list.filter((x) => !(x.userId === r.user_id && x.emoji === r.emoji)) }
          })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [conversationId, allProfiles])

  async function handleToggleReaction(messageId: string, emoji: string) {
    await toggleReaction('conversation', messageId, emoji)
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || sending) return
    setSending(true)
    const content = input.trim()
    try {
      const res = await fetch(`/api/messages/${conversationId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const { message } = await res.json()
        setInput('')
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
      }
    } finally {
      setSending(false)
    }
  }

  async function handleAddMember(profile: ConversationParticipant) {
    setShowAddPicker(false)
    setPickerFilter('')
    const ok = await addConversationMember(conversationId, profile.id)
    if (ok) setMembers((prev) => (prev.some((m) => m.id === profile.id) ? prev : [...prev, profile]))
  }

  async function handleRemoveMember(profileId: string) {
    const prev = members
    setMembers((cur) => cur.filter((m) => m.id !== profileId))
    const ok = await removeConversationMember(conversationId, profileId)
    if (!ok) setMembers(prev)
  }

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  const formatDate = (ts: string) => {
    const d = new Date(ts)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return 'I dag'
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
  }

  const addablePeople = allProfiles.filter((p) =>
    !members.some((m) => m.id === p.id) && displayName(p).toLowerCase().includes(pickerFilter.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
      {/* Medlemmer */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'relative' }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>
          Produksjonschat
        </p>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {members.map((m) => (
            <div key={m.id} className="group" style={{ position: 'relative', marginLeft: -6 }}>
              <Avatar p={m} />
              {m.id !== currentUser.id && (
                <button
                  onClick={() => handleRemoveMember(m.id)}
                  title={`Fjern ${displayName(m)}`}
                  className="opacity-0 group-hover:opacity-100"
                  style={{
                    position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%',
                    background: C.danger, border: `1px solid ${C.surface}`, color: '#fff', fontSize: '0.5rem',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, lineHeight: 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowAddPicker((s) => !s)}
          title="Legg til person"
          style={{
            width: 26, height: 26, borderRadius: '50%', background: showAddPicker ? C.accent : C.surface2,
            border: `1px solid ${showAddPicker ? C.accent : C.border}`, color: showAddPicker ? '#fff' : C.text2,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', marginLeft: 2,
          }}
        >
          +
        </button>

        {showAddPicker && (
          <div style={{
            position: 'absolute', top: '100%', left: 18, marginTop: 6, zIndex: 20,
            width: 240, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: 10,
          }}>
            <input
              autoFocus
              value={pickerFilter}
              onChange={(e) => setPickerFilter(e.target.value)}
              placeholder="Søk etter kollega..."
              style={{
                width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.text,
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', outline: 'none', marginBottom: 6,
              }}
            />
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {addablePeople.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleAddMember(p)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', borderRadius: 6, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.surface }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <Avatar p={p} size={20} />
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text }}>{displayName(p)}</span>
                </button>
              ))}
              {addablePeople.length === 0 && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, padding: '4px 6px' }}>Ingen treff</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Meldinger */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, minHeight: 200 }}>
        {messages.length === 0 && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textAlign: 'center', marginTop: 32 }}>
            Ingen meldinger ennå
          </p>
        )}
        {messages.map((msg) => {
          const sender = members.find((m) => m.id === msg.sender_id)
          const own = msg.sender_id === currentUser.id
          return (
            <div key={msg.id} className="group" style={{ display: 'flex', flexDirection: 'column', alignItems: own ? 'flex-end' : 'flex-start', gap: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, color: C.text3 }}>
                  {own ? 'Deg' : sender ? displayName(sender) : 'Ukjent'}
                </span>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3 }}>
                  {formatDate(msg.created_at)} {formatTime(msg.created_at)}
                </span>
              </div>
              <div style={{
                maxWidth: '80%', padding: '8px 12px',
                borderRadius: own ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                background: own ? C.accent : C.surface2,
                border: own ? 'none' : `1px solid ${C.border}`,
              }}>
                <p style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: own ? '#fff' : C.text,
                  lineHeight: 1.5, margin: 0, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                }}>
                  {msg.content}
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

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); sendMessage() }}
        style={{ flexShrink: 0, padding: '12px 18px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              sendMessage()
            }
          }}
          rows={1}
          placeholder="Skriv en melding til produksjonsteamet..."
          disabled={sending}
          style={{
            flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, background: C.surface2,
            border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', outline: 'none', resize: 'none', lineHeight: 1.5,
          }}
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          style={{
            width: 38, height: 38, borderRadius: 8, flexShrink: 0, background: input.trim() ? C.accent : C.surface2,
            border: 'none', cursor: input.trim() && !sending ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: !input.trim() || sending ? 0.5 : 1,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 8L2 3L5.5 8L2 13L14 8Z" fill="white" />
          </svg>
        </button>
      </form>
    </div>
  )
}
