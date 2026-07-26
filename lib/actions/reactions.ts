'use server'

import { createClient } from '@/lib/supabase-server'

export type MessageType = 'project' | 'task' | 'quote' | 'preprod'

export type MessageReaction = {
  emoji: string
  userId: string
  userName: string
}

// Delt mellom prosjekt-chat, oppgave-chat og tilbud-chat — én reaksjonstabell for alle tre
// meldingstypene (se supabase/migrations/091_message_reactions.sql).
export async function getReactions(
  messageType: MessageType,
  messageIds: string[]
): Promise<Record<string, MessageReaction[]>> {
  if (messageIds.length === 0) return {}
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id, emoji, user_id')
      .eq('message_type', messageType)
      .in('message_id', messageIds)

    if (error) {
      console.error('getReactions error:', error)
      return {}
    }

    const rows = data ?? []
    if (rows.length === 0) return {}

    const userIds = [...new Set(rows.map((r) => r.user_id))]
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', userIds)
    const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.name ?? p.email ?? 'Ukjent']))

    const byMessage: Record<string, MessageReaction[]> = {}
    for (const row of rows) {
      const list = byMessage[row.message_id] ?? (byMessage[row.message_id] = [])
      list.push({ emoji: row.emoji, userId: row.user_id, userName: profileMap[row.user_id] ?? 'Ukjent' })
    }
    return byMessage
  } catch (err) {
    console.error('getReactions unexpected error:', err)
    return {}
  }
}

// Toggle: legger til reaksjonen hvis brukeren ikke allerede har den, fjerner den hvis de har.
export async function toggleReaction(
  messageType: MessageType,
  messageId: string,
  emoji: string
): Promise<{ ok: boolean; action?: 'added' | 'removed' }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false }

    const { data: existing } = await supabase
      .from('message_reactions')
      .select('id')
      .eq('message_type', messageType)
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('emoji', emoji)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase.from('message_reactions').delete().eq('id', existing.id)
      if (error) {
        console.error('toggleReaction delete error:', error)
        return { ok: false }
      }
      return { ok: true, action: 'removed' }
    }

    const { error } = await supabase.from('message_reactions').insert({
      message_type: messageType,
      message_id: messageId,
      user_id: user.id,
      emoji,
    })
    if (error) {
      console.error('toggleReaction insert error:', error)
      return { ok: false }
    }
    return { ok: true, action: 'added' }
  } catch (err) {
    console.error('toggleReaction unexpected error:', err)
    return { ok: false }
  }
}
