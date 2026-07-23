'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import {
  markAsRead, markAllAsRead, deleteNotification, deleteReadNotifications,
  replyToNotification, type Notification,
} from '@/lib/actions/notifications'
import { toggleReaction, type MessageType } from '@/lib/actions/reactions'
import { respondToMeetingInvite } from '@/lib/actions/meetings'
import { C } from '@/lib/admin-theme'

const QUICK_EMOJIS = ['❗', '❤️', '👍'] // samme sett som chattene (components/shared/MessageReactions)

type Channel = 'project' | 'task' | 'quote' | 'direct'

// Hvilken meldingskanal varselet hører til — styrer om Svar/reaksjoner vises
function channelFor(n: Notification): Channel | null {
  switch (n.type) {
    case 'project_message':
    case 'project_message_mention':
    case 'project_message_reaction':
      return 'project'
    case 'task_message':
    case 'task_message_mention':
    case 'task_message_reaction':
      return 'task'
    case 'quote_message':
    case 'quote_mention':
    case 'quote_message_reaction':
      return 'quote'
    case 'direct_message':
      return 'direct'
    default:
      return null
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'akkurat nå'
  if (mins < 60) return `${mins} min siden`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} t siden`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'i går'
  return `${days} dager siden`
}

export default function VarslerClient({ notifications: initialNotifications }: { notifications: Notification[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [notifications, setNotifications] = useState(initialNotifications)
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sentId, setSentId] = useState<string | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)
  // Reaksjoner sendt fra denne siden i denne økten (varsel-id → emoji), for umiddelbar feedback
  const [reacted, setReacted] = useState<Record<string, string>>({})
  // Møteinvitasjoner besvart i denne økten (varsel-id → status), for umiddelbar feedback
  const [meetingResponses, setMeetingResponses] = useState<Record<string, 'accepted' | 'declined'>>({})
  const [respondingId, setRespondingId] = useState<string | null>(null)
  const replyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setNotifications(initialNotifications)
  }, [initialNotifications])

  useEffect(() => {
    if (replyingId) replyRef.current?.focus()
  }, [replyingId])

  useEffect(() => {
    const supabase = createClient()
    let channelName = ''

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      channelName = `varsler-page-${user.id}`

      supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          async (payload) => {
            const { data } = await supabase
              .from('notifications')
              .select('*, projects(title), tasks(title, pipeline_stage), leads(name, company)')
              .eq('id', (payload.new as { id: string }).id)
              .single()
            if (data) {
              setNotifications((prev) => {
                if (prev.some((n) => n.id === data.id)) return prev
                return [data as Notification, ...prev]
              })
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const updated = payload.new as Notification
            setNotifications((prev) => prev.map((n) => (n.id === updated.id ? { ...n, read: updated.read } : n)))
          }
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const deleted = payload.old as { id?: string }
            if (deleted?.id) setNotifications((prev) => prev.filter((n) => n.id !== deleted.id))
          }
        )
        .subscribe()
    }

    init()

    return () => {
      if (channelName) supabase.removeChannel(supabase.channel(channelName))
    }
  }, [])

  function navigateTo(n: Notification) {
    if (!n.read) {
      startTransition(async () => { await markAsRead(n.id) })
    }
    if (n.type === 'lead_assigned') {
      router.push(n.project_id ? `/admin/projects/${n.project_id}/contact` : `/admin/leads/${n.lead_id}`)
    } else if (n.type === 'task_assigned') {
      router.push(`/admin/projects/${n.project_id}`)
    } else if (n.type === 'direct_message') {
      router.push('/admin/meldinger')
    } else if (n.type === 'meeting_invite' || n.type === 'meeting_response') {
      router.push('/admin/calendar')
    } else if (n.type === 'project_message' || n.type === 'project_message_mention' || n.type === 'project_message_reaction') {
      router.push(`/admin/projects/${n.project_id}?chat=1`)
    } else if (n.type === 'quote_mention' || n.type === 'quote_assigned' || n.type === 'quote_message' || n.type === 'quote_message_reaction') {
      router.push(`/admin/projects/${n.project_id}/quote${n.type === 'quote_assigned' ? '' : '?chat=1'}`)
    } else if (n.type === 'invoice_assigned') {
      router.push(`/admin/faktura/${n.project_id}`)
    } else if (n.type === 'resale_assigned') {
      router.push(`/admin/projects/${n.project_id}`)
    } else if (n.type === 'contract_signed') {
      router.push(`/admin/projects/${n.project_id}?tab=kontrakt`)
    } else if (n.type === 'feedback_reply') {
      // Ingen egen visningsside — svaret vises allerede i varselteksten under
    } else if (n.type === 'task_message' || n.type === 'task_message_mention' || n.type === 'task_message_reaction') {
      const stage = n.tasks?.pipeline_stage
      if (!n.task_id) {
        router.push(`/admin/postprod/${n.project_id}`)
      } else if (stage === 'post_prod') {
        router.push(`/admin/postprod/${n.project_id}?task=${n.task_id}`)
      } else if (stage === 'pre_prod') {
        router.push(`/admin/preprod/${n.project_id}?task=${n.task_id}`)
      } else {
        router.push(`/admin/projects/${n.project_id}?task=${n.task_id}`)
      }
    } else if (n.type === 'board_comment_mention' || n.type === 'board_comment_reply') {
      router.push(`/admin/boards/${n.board_id}?comment=${n.board_card_id}`)
    } else {
      router.push(`/admin/postprod/${n.project_id}`)
    }
  }

  async function handleMarkAll() {
    startTransition(async () => {
      await markAllAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    })
  }

  async function handleDelete(n: Notification) {
    setNotifications((prev) => prev.filter((x) => x.id !== n.id))
    if (replyingId === n.id) setReplyingId(null)
    const ok = await deleteNotification(n.id)
    if (!ok) setNotifications((prev) => [n, ...prev].sort((a, b) => b.created_at.localeCompare(a.created_at)))
  }

  async function handleDeleteRead() {
    const kept = notifications.filter((n) => !n.read)
    const removed = notifications.filter((n) => n.read)
    setNotifications(kept)
    const ok = await deleteReadNotifications()
    if (!ok) setNotifications((prev) => [...prev, ...removed].sort((a, b) => b.created_at.localeCompare(a.created_at)))
  }

  function toggleReply(n: Notification) {
    setReplyError(null)
    if (replyingId === n.id) {
      setReplyingId(null)
    } else {
      setReplyingId(n.id)
      setReplyText('')
    }
  }

  async function handleSendReply(n: Notification) {
    if (!replyText.trim() || sending) return
    setSending(true)
    setReplyError(null)
    const res = await replyToNotification(n.id, replyText)
    setSending(false)
    if (res.ok) {
      setReplyingId(null)
      setReplyText('')
      setSentId(n.id)
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      setTimeout(() => setSentId((cur) => (cur === n.id ? null : cur)), 2500)
    } else {
      setReplyError(res.error ?? 'Kunne ikke sende')
    }
  }

  async function handleMeetingRespond(n: Notification, status: 'accepted' | 'declined') {
    if (!n.meeting_id || respondingId) return
    setRespondingId(n.id)
    const res = await respondToMeetingInvite(n.meeting_id, status)
    setRespondingId(null)
    if (res.ok) {
      setMeetingResponses((prev) => ({ ...prev, [n.id]: status }))
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
    }
  }

  async function handleReact(n: Notification, emoji: string) {
    const channel = channelFor(n)
    if (!n.message_id || !channel || channel === 'direct') return
    const prev = reacted[n.id]
    setReacted((r) => ({ ...r, [n.id]: prev === emoji ? '' : emoji }))
    if (!n.read) {
      setNotifications((p) => p.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      startTransition(async () => { await markAsRead(n.id) })
    }
    const res = await toggleReaction(channel as MessageType, n.message_id, emoji)
    if (!res.ok) setReacted((r) => ({ ...r, [n.id]: prev ?? '' }))
  }

  const unreadCount = notifications.filter(n => !n.read).length
  const readCount = notifications.length - unreadCount

  const iconBtnStyle: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3,
    background: 'none', border: `1px solid transparent`, borderRadius: 5,
    padding: '3px 7px', cursor: 'pointer', lineHeight: 1.4,
  }

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '32px 32px 48px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>
              Administrasjon
            </p>
            <h1 style={{ fontFamily: 'var(--font-cormorant)', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontStyle: 'italic', fontWeight: 400, color: C.text, margin: 0 }}>
              Varsler
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {readCount > 0 && (
              <button
                onClick={handleDeleteRead}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}
              >
                Fjern alle leste
              </button>
            )}
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}
              >
                Merk alle som lest
              </button>
            )}
          </div>
        </div>

        {/* Liste */}
        {notifications.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3 }}>
              Ingen varsler ennå.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {notifications.map((n, i) => {
              const channel = channelFor(n)
              const canReply = channel !== null
              const canReact = channel !== null && channel !== 'direct' && !!n.message_id
              const isReplying = replyingId === n.id
              return (
                <div
                  key={n.id}
                  style={{
                    borderBottom: i < notifications.length - 1 ? `1px solid ${C.border}` : 'none',
                    background: n.read ? 'transparent' : 'rgba(124,92,252,0.04)',
                    borderLeft: n.read ? `3px solid transparent` : `3px solid ${C.accent}`,
                  }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => navigateTo(n)}
                    onKeyDown={(e) => { if (e.key === 'Enter') navigateTo(n) }}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 18px 10px', cursor: 'pointer', textAlign: 'left', width: '100%' }}
                  >
                    {/* Ikon */}
                    <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 6, background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                      {n.type === 'project_message_reaction' || n.type === 'task_message_reaction' || n.type === 'quote_message_reaction' ? (
                        <span style={{ fontSize: '0.85rem', lineHeight: 1 }}>{n.message_preview}</span>
                      ) : n.type === 'task_assigned' || n.type === 'lead_assigned' ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                        </svg>
                      ) : n.type === 'contract_signed' ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4CAF7D" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      ) : n.type === 'project_message_mention' || n.type === 'task_message_mention' || n.type === 'quote_mention' || n.type === 'board_comment_mention' ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="4" />
                          <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5" />
                        </svg>
                      ) : n.type === 'project_message' || n.type === 'quote_message' || n.type === 'direct_message' || n.type === 'board_comment_reply' ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                      ) : n.type === 'meeting_invite' || n.type === 'meeting_response' ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D4508C" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18M8 2v4M16 2v4" />
                        </svg>
                      ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.text3} strokeWidth="1.8">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <path d="M8 12h8M8 8h8M8 16h5" />
                        </svg>
                      )}
                    </div>

                    {/* Tekst */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.text }}>
                          {n.sender_name}
                        </span>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                          {n.type === 'project_message' ? 'i prosjekt-chatten'
                            : n.type === 'project_message_mention' ? 'nevnte deg i prosjekt-chatten'
                            : n.type === 'task_message_mention' ? 'nevnte deg i en oppgave'
                            : n.type === 'task_assigned' ? 'tildelte deg en oppgave'
                            : n.type === 'lead_assigned' ? 'satte deg som ansvarlig for en lead'
                            : n.type === 'resale_assigned' ? 'satte deg som ansvarlig for videresalg'
                            : n.type === 'selection_submitted' ? 'sendte inn bildevalg'
                            : n.type === 'quote_mention' ? 'tagget deg i tilbud'
                            : n.type === 'quote_message' ? 'i tilbudschatten'
                            : n.type === 'feedback_reply' ? 'svarte på tilbakemeldingen din'
                            : n.type === 'contract_signed' ? 'signerte kontrakten'
                            : n.type === 'direct_message' ? 'sendte deg en direktemelding'
                            : n.type === 'meeting_invite' ? 'inviterte deg til et møte'
                            : n.type === 'meeting_response' ? 'svarte på møteinvitasjonen din'
                            : n.type === 'project_message_reaction' ? 'reagerte på meldingen din i prosjekt-chatten'
                            : n.type === 'task_message_reaction' ? 'reagerte på meldingen din i en oppgave'
                            : n.type === 'quote_message_reaction' ? 'reagerte på meldingen din i tilbudschatten'
                            : n.type === 'board_comment_mention' ? 'nevnte deg i en boardkommentar'
                            : n.type === 'board_comment_reply' ? 'svarte på kommentaren din på boardet'
                            : 'i en oppgave'}
                        </span>
                      </div>
                      {n.type !== 'project_message_reaction' && n.type !== 'task_message_reaction' && n.type !== 'quote_message_reaction' && (
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2, fontStyle: 'italic', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          &ldquo;{n.message_preview}{n.message_preview.length >= 80 ? '…' : ''}&rdquo;
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        {n.projects?.title && (
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                            {n.projects.title}
                          </span>
                        )}
                        {n.tasks?.title && (
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                            · {n.tasks.title}
                          </span>
                        )}
                        {n.leads?.name && (
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                            {n.leads.company || n.leads.name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Tidspunkt + slett */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 2 }}>
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                        {timeAgo(n.created_at)}
                      </span>
                      <button
                        title="Fjern varsel"
                        onClick={(e) => { e.stopPropagation(); handleDelete(n) }}
                        style={{ ...iconBtnStyle, padding: '2px 6px', fontSize: '0.75rem' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Handlingsrad: godta/avslå møteinvitasjon */}
                  {n.type === 'meeting_invite' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px 12px 58px' }}>
                      {meetingResponses[n.id] ? (
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: meetingResponses[n.id] === 'accepted' ? '#4CAF7D' : C.danger }}>
                          {meetingResponses[n.id] === 'accepted' ? 'Godtatt ✓' : 'Avslått'}
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMeetingRespond(n, 'accepted') }}
                            disabled={respondingId === n.id}
                            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: '#fff', background: '#4CAF7D', border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer', opacity: respondingId === n.id ? 0.6 : 1 }}
                          >
                            Godta
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMeetingRespond(n, 'declined') }}
                            disabled={respondingId === n.id}
                            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, color: C.danger, background: 'none', border: `1px solid ${C.danger}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', opacity: respondingId === n.id ? 0.6 : 1 }}
                          >
                            Avslå
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Handlingsrad: svar + reaksjoner */}
                  {(canReply || canReact) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 18px 10px 58px' }}>
                      {canReply && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleReply(n) }}
                          style={{ ...iconBtnStyle, border: `1px solid ${isReplying ? C.accent : C.border}`, color: isReplying ? C.accent : C.text3 }}
                        >
                          ↩ Svar
                        </button>
                      )}
                      {canReact && QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          title="Reager på meldingen"
                          onClick={(e) => { e.stopPropagation(); handleReact(n, emoji) }}
                          style={{
                            ...iconBtnStyle,
                            fontSize: '0.78rem',
                            padding: '2px 6px',
                            border: `1px solid ${reacted[n.id] === emoji ? C.accent : 'transparent'}`,
                            background: reacted[n.id] === emoji ? C.accentBg : 'none',
                          }}
                        >
                          {emoji}
                        </button>
                      ))}
                      {sentId === n.id && (
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: '#4CAF7D' }}>
                          Svar sendt ✓
                        </span>
                      )}
                    </div>
                  )}

                  {/* Inline svarfelt */}
                  {isReplying && (
                    <div style={{ padding: '0 18px 14px 58px' }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                        <textarea
                          ref={replyRef}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(n) }
                            if (e.key === 'Escape') setReplyingId(null)
                          }}
                          placeholder={`Svar ${n.sender_name} …`}
                          rows={2}
                          style={{ flex: 1, background: C.surface2, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 10px', fontSize: '0.78rem', fontFamily: 'var(--font-dm-sans)', resize: 'vertical', outline: 'none' }}
                        />
                        <button
                          onClick={() => handleSendReply(n)}
                          disabled={sending || !replyText.trim()}
                          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, color: '#fff', background: C.accent, border: 'none', borderRadius: 7, padding: '8px 14px', cursor: 'pointer', opacity: sending || !replyText.trim() ? 0.5 : 1 }}
                        >
                          {sending ? 'Sender …' : 'Send'}
                        </button>
                      </div>
                      {replyError && (
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.danger, margin: '6px 0 0' }}>
                          {replyError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
