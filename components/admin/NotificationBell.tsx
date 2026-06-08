'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'

export function NotificationBell() {
  const [unread, setUnread] = useState(0)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false)
      setUnread(count ?? 0)

      supabase
        .channel('notifications-bell')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          () => setUnread(n => n + 1)
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          async () => {
            const { count } = await supabase
              .from('notifications')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .eq('read', false)
            setUnread(count ?? 0)
          }
        )
        .subscribe()
    }

    init()

    return () => { supabase.channel('notifications-bell').unsubscribe() }
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
