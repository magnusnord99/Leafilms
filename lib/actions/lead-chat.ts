'use server'

import { createClient, createServiceClient } from '@/lib/supabase-server'
import type { ConversationParticipant } from '@/lib/actions/messages'
import { getConversationMembers } from '@/lib/actions/production-chat'

export type LeadChatInfo = {
  conversationId: string
  members: ConversationParticipant[]
}

/**
 * Henter eller oppretter lead-samtalen for en lead — samme mønster som
 * getOrCreateProjectConversation (lib/actions/production-chat.ts), bare
 * uten et pitch-team å så medlemslisten fra. Ved førstegangs-opprettelse
 * sås medlemslisten med brukeren som åpner den + leadens ansvarlige
 * (assigned_to), om satt.
 *
 * Bruker service-klienten til selve oppslag/opprettelse-logikken av samme
 * grunn som produksjonschatten: en bruker som ennå ikke er medlem av en
 * allerede opprettet lead-samtale kan ikke se den via RLS — uten
 * service-klienten ville de trodd samtalen ikke fantes og opprettet en duplikat.
 */
export async function getOrCreateLeadConversation(leadId: string): Promise<LeadChatInfo | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const serviceClient = createServiceClient()

    const { data: existing } = await serviceClient
      .from('conversations')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle()

    let conversationId = existing?.id ?? null

    if (!conversationId) {
      const { data: lead } = await serviceClient
        .from('leads')
        .select('assigned_to')
        .eq('id', leadId)
        .single()

      const memberIds = new Set<string>([user.id])
      if (lead?.assigned_to) memberIds.add(lead.assigned_to)

      const { data: conversation, error: convError } = await serviceClient
        .from('conversations')
        .insert({ lead_id: leadId })
        .select('id')
        .single()

      if (convError || !conversation) {
        // Racet mot en samtidig førstegangs-åpning — noen andre rakk å opprette den først.
        const { data: raceWinner } = await serviceClient
          .from('conversations')
          .select('id')
          .eq('lead_id', leadId)
          .maybeSingle()
        if (!raceWinner) return null
        conversationId = raceWinner.id
      } else {
        conversationId = conversation.id
        await serviceClient
          .from('conversation_participants')
          .insert(Array.from(memberIds).map((profile_id) => ({ conversation_id: conversationId, profile_id })))
      }
    } else {
      // Sikre at den som navigerer inn på en allerede opprettet lead-side er medlem.
      await serviceClient
        .from('conversation_participants')
        .upsert(
          { conversation_id: conversationId, profile_id: user.id },
          { onConflict: 'conversation_id,profile_id', ignoreDuplicates: true }
        )
    }

    const members = await getConversationMembers(conversationId)
    return { conversationId, members }
  } catch (err) {
    console.error('getOrCreateLeadConversation error:', err)
    return null
  }
}
