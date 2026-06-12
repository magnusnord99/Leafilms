'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { markAsRead, markAllAsRead, type Notification } from '@/lib/actions/notifications'
import { C } from '@/lib/admin-theme'

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

export default function VarslerClient({ notifications }: { notifications: Notification[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  async function handleClick(n: Notification) {
    if (!n.read) {
      startTransition(async () => { await markAsRead(n.id) })
    }
    if (n.type === 'lead_assigned') {
      router.push(n.project_id ? `/admin/projects/${n.project_id}/contact` : `/admin/leads/${n.lead_id}`)
    } else if (n.type === 'task_assigned' || n.type === 'project_message') {
      router.push(`/admin/projects/${n.project_id}`)
    } else {
      router.push(`/admin/postprod/${n.project_id}`)
    }
  }

  async function handleMarkAll() {
    startTransition(async () => {
      await markAllAsRead()
      router.refresh()
    })
  }

  const unreadCount = notifications.filter(n => !n.read).length

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
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '6px 12px', borderRadius: 6, cursor: 'pointer' }}
            >
              Merk alle som lest
            </button>
          )}
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
            {notifications.map((n, i) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '14px 18px',
                  borderBottom: i < notifications.length - 1 ? `1px solid ${C.border}` : 'none',
                  background: n.read ? 'transparent' : 'rgba(124,92,252,0.04)',
                  borderLeft: n.read ? `3px solid transparent` : `3px solid ${C.accent}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                {/* Ikon */}
                <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 6, background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  {n.type === 'task_assigned' || n.type === 'lead_assigned' ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                  ) : n.type === 'project_message' ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
                        : n.type === 'task_assigned' ? 'tildelte deg en oppgave'
                        : n.type === 'lead_assigned' ? 'satte deg som ansvarlig for en lead'
                        : n.type === 'selection_submitted' ? 'sendte inn bildevalg'
                        : 'i en oppgave'}
                    </span>
                  </div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2, fontStyle: 'italic', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    &ldquo;{n.message_preview}{n.message_preview.length >= 80 ? '…' : ''}&rdquo;
                  </p>
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

                {/* Tidspunkt */}
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, flexShrink: 0, marginTop: 2 }}>
                  {timeAgo(n.created_at)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
