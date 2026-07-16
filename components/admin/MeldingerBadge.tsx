'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-client'

export function MeldingerBadge() {
  const [unread, setUnread] = useState(0)
  const supabaseRef = useRef(createClient())

  async function fetchCount() {
    const supabase = supabaseRef.current
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { count } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('type', 'direct_message')
      .eq('read', false)
    setUnread(count ?? 0)
  }

  useEffect(() => {
    fetchCount()
    const supabase = supabaseRef.current

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      supabase
        .channel('meldinger-badge')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => { if ((payload.new as { type: string }).type === 'direct_message') setUnread((n) => n + 1) }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          () => fetchCount()
        )
        .subscribe()
    }

    init()

    return () => { supabase.channel('meldinger-badge').unsubscribe() }
  }, [])

  if (unread === 0) return null

  return (
    <span style={{
      marginLeft: 6,
      minWidth: 14,
      height: 14,
      background: '#E05555',
      borderRadius: 7,
      display: 'inline-flex',
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
  )
}
