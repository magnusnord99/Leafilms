'use server'

import { createClient } from '@/lib/supabase-server'
import { notifyAssignment } from '@/lib/notify-assignment'
import type { QuoteMessage } from '@/lib/types'

export async function getQuoteMessages(quoteId: string): Promise<QuoteMessage[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('quote_messages')
      .select('*, user:profiles(id, name, email)')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('getQuoteMessages error:', error)
      return []
    }
    return (data ?? []) as QuoteMessage[]
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

    // Send varsel til alle taggede brukere (feil svelges)
    const preview = opts.message.slice(0, 120)
    // fire-and-forget — errors must never affect the ok return
    Promise.all(
      opts.mentionedUserIds.map(id =>
        notifyAssignment({
          recipientId: id,
          type: 'quote_mention',
          projectId: opts.projectId,
          preview,
        })
          .catch(() => {})
      )
    )

    return { ok: true }
  } catch (err) {
    console.error('sendQuoteMessage unexpected error:', err)
    return { ok: false }
  }
}
