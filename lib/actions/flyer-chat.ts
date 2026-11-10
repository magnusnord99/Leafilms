'use server'

import { getAuthenticatedStaffUser } from '@/lib/auth/staff'
import { createServiceClient } from '@/lib/supabase-server'
import { STAFF_ROLES } from '@/lib/permissions'

export async function getFlyerChat(flyerId: string) {
  const staff = await getAuthenticatedStaffUser()
  if (!staff.ok) return null
  const db = createServiceClient()
  const { data: flyer, error: flyerError } = await db.from('sales_flyers').select('id, slug').eq('id', flyerId).single()
  if (flyerError || !flyer) throw new Error('Fant ikke flyeren')

  const { data: existing, error: lookupError } = await db.from('conversations').select('id').eq('sales_flyer_id', flyerId).maybeSingle()
  if (lookupError) throw lookupError
  let conversationId = existing?.id
  if (!conversationId) {
    const { data, error } = await db.from('conversations').insert({ sales_flyer_id: flyerId }).select('id').single()
    if (error && error.code !== '23505') throw error
    if (data) conversationId = data.id
    else {
      const winner = await db.from('conversations').select('id').eq('sales_flyer_id', flyerId).single()
      if (winner.error) throw winner.error
      conversationId = winner.data.id
    }
  }
  const { data: profiles, error: profilesError } = await db.from('profiles').select('id, name, email').in('role', STAFF_ROLES)
  if (profilesError) throw profilesError
  const { error: memberError } = await db.from('conversation_participants').upsert(
    (profiles ?? []).map(profile => ({ conversation_id: conversationId, profile_id: profile.id })),
    { onConflict: 'conversation_id,profile_id', ignoreDuplicates: true },
  )
  if (memberError) throw memberError
  const { count, error: unreadError } = await db.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', staff.user.id).eq('conversation_id', conversationId).eq('read', false)
  if (unreadError) throw unreadError
  return { conversationId: conversationId as string, currentUserId: staff.user.id, profiles: profiles ?? [], unread: count ?? 0 }
}
