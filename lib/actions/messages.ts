'use server'

import { createClient, createServiceClient } from '@/lib/supabase-server'

export type ConversationParticipant = {
  id: string
  name: string | null
  email: string
  color: string | null
}

export type ConversationListItem = {
  id: string
  isDirect: boolean
  otherParticipants: ConversationParticipant[]
  lastMessage: { content: string; created_at: string; sender_id: string } | null
  unreadCount: number
}

export async function getConversations(): Promise<ConversationListItem[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data: myRows } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('profile_id', user.id)

    const allConversationIds = (myRows ?? []).map((r) => r.conversation_id)
    if (allConversationIds.length === 0) return []

    // Behold også prosjektknyttede samtaler i historikken. Varsler alene er
    // ikke en komplett historikk: avsenderen får ikke varsel om egne meldinger.
    const { data: classifiedRows, error: classificationError } = await supabase
      .from('conversations')
      .select('id, project_id, lead_id, email_discussion_project_id, sales_flyer_id')
      .in('id', allConversationIds)
    if (classificationError) throw classificationError
    const classifiedIds = new Set(
      (classifiedRows ?? [])
        .filter((c) => c.project_id || c.lead_id || c.email_discussion_project_id || c.sales_flyer_id)
        .map((c) => c.id)
    )
    const conversationIds = allConversationIds

    const [{ data: otherRows }, { data: messages }, { data: unread }] = await Promise.all([
      supabase
        .from('conversation_participants')
        .select('conversation_id, profiles(id, name, email, color)')
        .in('conversation_id', conversationIds)
        .neq('profile_id', user.id),
      supabase
        .from('conversation_messages')
        .select('conversation_id, content, created_at, sender_id')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('notifications')
        .select('conversation_id')
        .eq('user_id', user.id)
        .eq('type', 'direct_message')
        .eq('read', false)
        .in('conversation_id', conversationIds),
    ])

    const lastMessageByConversation = new Map<string, { content: string; created_at: string; sender_id: string }>()
    for (const m of messages ?? []) {
      if (!lastMessageByConversation.has(m.conversation_id)) {
        lastMessageByConversation.set(m.conversation_id, m)
      }
    }

    const unreadCountByConversation = new Map<string, number>()
    for (const n of unread ?? []) {
      if (!n.conversation_id) continue
      unreadCountByConversation.set(n.conversation_id, (unreadCountByConversation.get(n.conversation_id) ?? 0) + 1)
    }

    // En samtale med 3+ deltakere gir én rad PER motpart i otherRows (én rad per
    // conversation_participants-rad som ikke er meg selv) — grupperes her per
    // conversation_id slik at en gruppesamtale vises som ÉN rad i sidebaren med
    // alle motpartene listet, i stedet for at den samme siste meldingen dukker
    // opp flere ganger under forskjellige navn (det Magnus opplevde som at
    // brukere virket "linket sammen").
    type OtherRow = { conversation_id: string; profiles: ConversationParticipant | null }
    const participantsByConversation = new Map<string, ConversationParticipant[]>()
    for (const r of (otherRows ?? []) as unknown as OtherRow[]) {
      if (!r.profiles) continue
      const list = participantsByConversation.get(r.conversation_id) ?? []
      list.push(r.profiles)
      participantsByConversation.set(r.conversation_id, list)
    }
    const items: ConversationListItem[] = Array.from(participantsByConversation.entries())
      .map(([conversationId, otherParticipants]) => ({
        id: conversationId,
        isDirect: !classifiedIds.has(conversationId),
        otherParticipants,
        lastMessage: lastMessageByConversation.get(conversationId) ?? null,
        unreadCount: unreadCountByConversation.get(conversationId) ?? 0,
      }))

    items.sort((a, b) => {
      const at = a.lastMessage?.created_at ?? ''
      const bt = b.lastMessage?.created_at ?? ''
      return bt.localeCompare(at)
    })

    return items
  } catch (err) {
    console.error('getConversations error:', err)
    return []
  }
}

/**
 * Finner eksisterende 1:1-samtale mellom meg og otherProfileId, eller oppretter en ny.
 * Deltaker-rader skrives via service-klienten fordi RLS på conversation_participants
 * kun tillater at man setter inn sin egen profile_id, mens en ny samtale krever at
 * begge deltakerne legges inn (autorisasjon er allerede sjekket over via auth.getUser()).
 */
export async function startConversation(otherProfileId: string): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id === otherProfileId) return null

    const { data: myRows } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('profile_id', user.id)
    const myConversationIds = (myRows ?? []).map((r) => r.conversation_id)

    if (myConversationIds.length > 0) {
      // En prosjektchat med to medlemmer er fortsatt ikke en direkte samtale.
      const { data: directRows, error: directError } = await supabase
        .from('conversations')
        .select('id')
        .in('id', myConversationIds)
        .is('project_id', null)
        .is('lead_id', null)
        .is('email_discussion_project_id', null)
        .is('sales_flyer_id', null)
      if (directError) throw directError
      const directIds = (directRows ?? []).map((row) => row.id)

      const { data: sharedRows, error: sharedError } = directIds.length === 0
        ? { data: [], error: null }
        : await supabase
        .from('conversation_participants')
        .select('conversation_id')
        .eq('profile_id', otherProfileId)
        .in('conversation_id', directIds)
      if (sharedError) throw sharedError

      const sharedConversationIds = (sharedRows ?? []).map((r) => r.conversation_id)
      if (sharedConversationIds.length > 0) {
        const { data: participantRows } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .in('conversation_id', sharedConversationIds)

        const participantCounts: Record<string, number> = {}
        for (const row of participantRows ?? []) {
          participantCounts[row.conversation_id] = (participantCounts[row.conversation_id] ?? 0) + 1
        }
        const existing = sharedConversationIds.find((id) => participantCounts[id] === 2)
        if (existing) return existing
      }
    }

    const serviceClient = createServiceClient()
    const { data: conversation, error: convError } = await serviceClient
      .from('conversations')
      .insert({})
      .select('id')
      .single()
    if (convError || !conversation) return null

    const { error: participantsError } = await serviceClient
      .from('conversation_participants')
      .insert([
        { conversation_id: conversation.id, profile_id: user.id },
        { conversation_id: conversation.id, profile_id: otherProfileId },
      ])
    if (participantsError) return null

    return conversation.id
  } catch (err) {
    console.error('startConversation error:', err)
    return null
  }
}

export async function markConversationRead(conversationId: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .eq('read', false)
  } catch {}
}
