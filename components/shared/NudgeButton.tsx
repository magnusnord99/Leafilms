'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-client'
import { sendNudge } from '@/lib/actions/notifications'
import { C } from '@/lib/admin-theme'

type Profile = { id: string; name: string | null; email: string }

// "Send til kollega"-knapp for ting man deler på et prosjekt (lenker, filer) —
// feedback 4381ba9c: i stedet for å måtte sende en melding hver gang man deler
// noe, pusher denne et eget varsel ("X sendte deg dette") rett til kollegaen,
// som ved klikk tar dem til prosjektets steg der tingen ligger. v1 dekker
// ProjectLinks og ProjectDocuments — de to konkrete tilfellene som ble nevnt.
export function NudgeButton({ projectId, label }: { projectId: string; label: string }) {
  const [open, setOpen] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || profiles.length > 0) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null))
    supabase.from('profiles').select('id, name, email').order('name').then(({ data }) => {
      setProfiles((data ?? []) as Profile[])
    })
  }, [open, profiles.length])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  async function handlePick(profile: Profile) {
    setOpen(false)
    const res = await sendNudge({ recipientId: profile.id, projectId, label })
    if (res.ok) {
      setSentTo(profile.name ?? profile.email)
      setTimeout(() => setSentTo(null), 2500)
    }
  }

  const visible = profiles.filter(p => p.id !== currentUserId && (p.name ?? p.email).toLowerCase().includes(query.toLowerCase()))

  if (sentTo) {
    return (
      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.success, flexShrink: 0 }}>
        ✓ Sendt til {sentTo}
      </span>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        title="Send til kollega"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, padding: 0, borderRadius: 4, cursor: 'pointer',
          background: open ? C.accentBg : 'transparent', border: `1px solid ${open ? 'rgba(124,92,252,0.3)' : 'transparent'}`,
          color: open ? C.accent : C.text3,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" />
        </svg>
      </button>

      {open && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 30,
            width: 220, maxHeight: 260, overflowY: 'auto',
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Søk kollega..."
            style={{
              width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem',
              color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5,
              padding: '5px 8px', outline: 'none', marginBottom: 6,
            }}
          />
          {visible.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, padding: '4px 6px' }}>Ingen treff.</p>
          ) : (
            visible.map(p => (
              <div
                key={p.id}
                onClick={() => handlePick(p)}
                style={{ padding: '6px 7px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, cursor: 'pointer', borderRadius: 5 }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
              >
                {p.name ?? p.email}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
