'use server'

import { createClient, createServiceClient } from '@/lib/supabase-server'
import type { ConversationParticipant } from '@/lib/actions/messages'
import { getConversationMembers } from '@/lib/actions/production-chat'

export type EmailDiscussionChatInfo = {
  conversationId: string
  members: ConversationParticipant[]
}

/**
 * Henter eller oppretter e-postdiskusjonen for et prosjekt — samme mønster
 * som getOrCreateProjectConversation/getOrCreateLeadConversation
 * (lib/actions/production-chat.ts / lib/actions/lead-chat.ts), bare på
 * email_discussion_project_id i stedet for project_id/lead_id. Bevisst en
 * egen samtale, ikke samme tråd som produksjonschatten (feedback e9431fb7).
 *
 * Bruker service-klienten til selve oppslag/opprettelse-logikken av samme
 * grunn som de to andre: en bruker som ennå ikke er medlem kan ikke se
 * samtalen via RLS uten den, og ville trodd den ikke fantes.
 */
export async function getOrCreateEmailDiscussionConversation(projectId: string): Promise<EmailDiscussionChatInfo | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const serviceClient = createServiceClient()

    const { data: existing } = await serviceClient
      .from('conversations')
      .select('id')
      .eq('email_discussion_project_id', projectId)
      .maybeSingle()

    let conversationId = existing?.id ?? null

    if (!conversationId) {
      const { data: project } = await serviceClient
        .from('projects')
        .select('project_lead_id')
        .eq('id', projectId)
        .single()

      const memberIds = new Set<string>([user.id])
      if (project?.project_lead_id) memberIds.add(project.project_lead_id)

      const { data: conversation, error: convError } = await serviceClient
        .from('conversations')
        .insert({ email_discussion_project_id: projectId })
        .select('id')
        .single()

      if (convError || !conversation) {
        // Racet mot en samtidig førstegangs-åpning — noen andre rakk å opprette den først.
        const { data: raceWinner } = await serviceClient
          .from('conversations')
          .select('id')
          .eq('email_discussion_project_id', projectId)
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
      // Sikre at den som navigerer inn på en allerede opprettet e-postdiskusjon er medlem.
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
    console.error('getOrCreateEmailDiscussionConversation error:', err)
    return null
  }
}
