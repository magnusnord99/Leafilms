'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

function playChime() {
  try {
    const ctx = new AudioContext()
    const notes = [880, 1100]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15)
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + i * 0.15 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.4)
      osc.start(ctx.currentTime + i * 0.15)
      osc.stop(ctx.currentTime + i * 0.15 + 0.4)
    })
  } catch {}
}

export function NotificationBell() {
  const [unread, setUnread] = useState(0)
  const router = useRouter()
  const pathname = usePathname()
  const supabaseRef = useRef(createClient())

  async function fetchCount() {
    const supabase = supabaseRef.current
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false)
    setUnread(count ?? 0)
  }

  // Re-fetch when user navigates (defensive sync mot stale state)
  useEffect(() => {
    fetchCount()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    const supabase = supabaseRef.current

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      supabase
        .channel('notifications-bell')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          () => {
            setUnread(n => n + 1)
            playChime()
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          () => fetchCount()
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          () => fetchCount()
        )
        .subscribe()
    }

    init()

    return () => { supabase.channel('notifications-bell').unsubscribe() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <button
      onClick={() => router.push('/admin/varsler')}
      aria-label={`Varsler${unread > 0 ? ` (${unread} uleste)` : ''}`}
      style={{
        position: 'relative',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 4,
        lineHeight: 0,
        color: unread > 0 ? '#E8E1D5' : '#5C5C70',
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {unread > 0 && (
        <span style={{
          position: 'absolute',
          top: 0,
          right: 0,
          minWidth: 14,
          height: 14,
          background: '#E05555',
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '0.55rem',
          fontWeight: 700,
          color: '#fff',
          padding: '0 3px',
        }}>
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}
