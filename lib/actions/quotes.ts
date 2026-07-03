'use server'

import { createClient } from '@/lib/supabase-server'
import type { QuoteMessage } from '@/lib/types'

export async function getQuoteMessages(quoteId: string): Promise<QuoteMessage[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('quote_messages')
      .select('id, quote_id, project_id, user_id, message, mentions, created_at')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('getQuoteMessages error:', error)
      return []
    }

    const rows = data ?? []
    if (rows.length === 0) return []

    // Fetch profiles separately — never join through auth.users (RLS/FK issues)
    const userIds = [...new Set(rows.map(r => r.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', userIds)

    const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

    return rows.map(r => ({
      ...r,
      mentions: r.mentions as string[],
      user: profileMap[r.user_id] ?? null,
    })) as QuoteMessage[]
  } catch (err) {
    console.error('getQuoteMessages unexpected error:', err)
    return []
  }
}

export async function sendQuoteMessage(opts: {
  quoteId: string
  projectId: string
  message: string
  mentionedUserIds: string[]
}): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false }

    const { error } = await supabase.from('quote_messages').insert({
      quote_id: opts.quoteId,
      project_id: opts.projectId,
      user_id: user.id,
      message: opts.message.trim(),
      mentions: opts.mentionedUserIds,
    })

    if (error) {
      console.error('sendQuoteMessage insert error:', error)
      return { ok: false }
    }

    // Varsling håndteres nå av DB-triggeren notify_quote_message
    // (083_notify_quote_message.sql) — den leser mentions-kolonnen
    // direkte og varsler både @nevnte brukere og quote_assignee_id.

    return { ok: true }
  } catch (err) {
    console.error('sendQuoteMessage unexpected error:', err)
    return { ok: false }
  }
}
