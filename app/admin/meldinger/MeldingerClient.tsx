'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { getConversations, startConversation, markConversationRead, type ConversationListItem, type ConversationParticipant } from '@/lib/actions/messages'
import { getAvatarColor } from '@/lib/avatar-colors'
import { C } from '@/lib/admin-theme'

type DirectMessage = {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  created_at: string
}

type CurrentUser = { id: string; name: string | null; email: string; color: string | null }

type Props = {
  currentUser: CurrentUser
  initialConversations: ConversationListItem[]
  allProfiles: ConversationParticipant[]
}

function displayName(p: { name: string | null; email: string }) {
  return p.name || p.email
}

export function MeldingerClient({ currentUser, initialConversations, allProfiles }: Props) {
  const [conversations, setConversations] = useState<ConversationListItem[]>(initialConversations)
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id ?? null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerFilter, setPickerFilter] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const selected = conversations.find((c) => c.id === selectedId) ?? null

  async function refreshConversations() {
    const fresh = await getConversations()
    setConversations(fresh)
  }

  // Refetch listen sidebaren når det kommer et nytt DM-varsel — dekker både nye meldinger
  // i eksisterende samtaler (fra andre faner) og helt nye samtaler startet av motparten.
  useEffect(() => {
    const channel = supabase
      .channel(`dm-notifications-${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${currentUser.id}` },
        (payload) => {
          const row = payload.new as { type: string }
          if (row.type === 'direct_message') refreshConversations()
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUser.id])

  // Last meldinger og marker samtalen som lest når man velger den
  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    let cancelled = false
    fetch(`/api/messages/${selectedId}`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setMessages(data.messages ?? []) })
    markConversationRead(selectedId).then(() => {
      if (cancelled) return
      setConversations((prev) => prev.map((c) => (c.id === selectedId ? { ...c, unreadCount: 0 } : c)))
    })
    return () => { cancelled = true }
  }, [selectedId])

  // Sanntidsoppdatering av den åpne tråden
  useEffect(() => {
    if (!selectedId) return
    const channel = supabase
      .channel(`dm-thread-${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_messages', filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          const msg = payload.new as DirectMessage
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]))
          setConversations((prev) => prev.map((c) => (
            c.id === selectedId
              ? { ...c, lastMessage: { content: msg.content, created_at: msg.created_at, sender_id: msg.sender_id } }
              : c
          )))
          if (msg.sender_id !== currentUser.id) markConversationRead(selectedId)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [selectedId, currentUser.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || sending || !selectedId) return
    setSending(true)
    const content = input.trim()
    try {
      const res = await fetch(`/api/messages/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (res.ok) {
        const { message } = await res.json()
        setInput('')
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
        setConversations((prev) => prev.map((c) => (
          c.id === selectedId
            ? { ...c, lastMessage: { content: message.content, created_at: message.created_at, sender_id: message.sender_id } }
            : c
        )))
      }
    } finally {
      setSending(false)
    }
  }

  async function handleStartConversation(profile: ConversationParticipant) {
    const existing = conversations.find((c) => c.otherParticipant.id === profile.id)
    if (existing) {
      setSelectedId(existing.id)
      setShowPicker(false)
      setPickerFilter('')
      return
    }
    const conversationId = await startConversation(profile.id)
    if (!conversationId) return
    setConversations((prev) => [
      { id: conversationId, otherParticipant: profile, lastMessage: null, unreadCount: 0 },
      ...prev,
    ])
    setSelectedId(conversationId)
    setShowPicker(false)
    setPickerFilter('')
  }

  const formatTime = (ts: string) => new Date(ts).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  const formatDate = (ts: string) => {
    const d = new Date(ts)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return 'I dag'
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
  }

  const filteredProfiles = allProfiles.filter((p) =>
    displayName(p).toLowerCase().includes(pickerFilter.toLowerCase())
  )

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', background: C.bg }}>
      {/* Samtaleliste */}
      <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${C.border}` }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Meldinger
          </p>
          <button
            onClick={() => setShowPicker((s) => !s)}
            style={{
              width: 26, height: 26, borderRadius: 6, background: showPicker ? C.accent : C.surface,
              border: `1px solid ${showPicker ? C.accent : C.border}`, color: showPicker ? '#fff' : C.text2,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', lineHeight: 1,
            }}
            title="Ny melding"
          >
            +
          </button>
        </div>

        {showPicker && (
          <div style={{ padding: 12, borderBottom: `1px solid ${C.border}`, background: C.surface }}>
            <input
              autoFocus
              value={pickerFilter}
              onChange={(e) => setPickerFilter(e.target.value)}
              placeholder="Søk etter kollega..."
              style={{
                width: '100%', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text,
                background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', outline: 'none', marginBottom: 8,
              }}
            />
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredProfiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleStartConversation(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
                    background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = C.surface2 }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: getAvatarColor(p), color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700,
                  }}>
                    {displayName(p)[0].toUpperCase()}
                  </span>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text }}>{displayName(p)}</span>
                </button>
              ))}
              {filteredProfiles.length === 0 && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, padding: '6px 8px' }}>Ingen treff</p>
              )}
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversations.length === 0 && !showPicker && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textAlign: 'center', marginTop: 32, padding: '0 16px' }}>
              Ingen samtaler ennå. Trykk + for å starte en.
            </p>
          )}
          {conversations.map((c) => {
            const active = c.id === selectedId
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                  background: active ? C.accentBg : 'transparent', border: 'none', borderLeft: `2px solid ${active ? C.accent : 'transparent'}`,
                  cursor: 'pointer', textAlign: 'left',
                }}
              >
                <span style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: getAvatarColor(c.otherParticipant), color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 700,
                }}>
                  {displayName(c.otherParticipant)[0].toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: c.unreadCount > 0 ? 600 : 500, color: C.text }}>
                      {displayName(c.otherParticipant)}
                    </span>
                    {c.unreadCount > 0 && (
                      <span style={{
                        minWidth: 16, height: 16, borderRadius: 8, background: C.accent, color: '#fff', fontSize: '0.6rem', fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', fontFamily: 'var(--font-dm-sans)',
                      }}>
                        {c.unreadCount > 9 ? '9+' : c.unreadCount}
                      </span>
                    )}
                  </div>
                  <p style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: c.unreadCount > 0 ? C.text2 : C.text3, margin: 0,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {c.lastMessage
                      ? `${c.lastMessage.sender_id === currentUser.id ? 'Du: ' : ''}${c.lastMessage.content}`
                      : 'Ingen meldinger ennå'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tråd */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {!selected ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>
              Velg en samtale, eller start en ny
            </p>
          </div>
        ) : (
          <>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: getAvatarColor(selected.otherParticipant), color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700,
              }}>
                {displayName(selected.otherParticipant)[0].toUpperCase()}
              </span>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text }}>
                {displayName(selected.otherParticipant)}
              </p>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.length === 0 && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textAlign: 'center', marginTop: 32 }}>
                  Ingen meldinger ennå
                </p>
              )}
              {messages.map((msg) => {
                const own = msg.sender_id === currentUser.id
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: own ? 'flex-end' : 'flex-start', gap: 3 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3 }}>
                      {formatDate(msg.created_at)} {formatTime(msg.created_at)}
                    </span>
                    <div style={{
                      maxWidth: '70%', padding: '8px 12px',
                      borderRadius: own ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                      background: own ? C.accent : C.surface,
                      border: own ? 'none' : `1px solid ${C.border}`,
                    }}>
                      <p style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: own ? '#fff' : C.text,
                        lineHeight: 1.5, margin: 0, wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                      }}>
                        {msg.content}
                      </p>
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); sendMessage() }}
              style={{ flexShrink: 0, padding: '12px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}
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
                placeholder="Skriv en melding..."
                disabled={sending}
                style={{
                  flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, background: C.surface,
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
          </>
        )}
      </div>
    </div>
  )
}
