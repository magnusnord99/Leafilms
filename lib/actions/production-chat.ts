'use server'

import { createClient, createServiceClient } from '@/lib/supabase-server'
import { getPitchTeamAsProdCrew } from '@/lib/actions/preprod'
import type { ConversationParticipant } from '@/lib/actions/messages'
import { getAuthenticatedStaffUser, isStaffProfile } from '@/lib/auth/staff'

export type ProductionChatInfo = {
  conversationId: string
  members: ConversationParticipant[]
}

export type ProductionInfo = {
  id: string
  title: string
  shootStart: string | null
  shootEnd: string | null
  shootConfirmed: boolean
  customer: { name: string; email: string | null; phone: string | null; address: string | null } | null
  projectLead: { id: string; name: string | null; email: string } | null
}

// Nøkkelinfo for produksjonsdagen — prosjektleder, kundekontakt, opptaksdatoer/-status.
// Alt hentes fra eksisterende felter, ingen ny lagring for dette i v1.
export async function getProductionInfo(projectId: string): Promise<ProductionInfo | null> {
  try {
    const supabase = await createClient()
    const { data: project, error } = await supabase
      .from('projects')
      .select(`
        id, title, shoot_start, shoot_end, shoot_confirmed,
        customers (name, email, phone, address),
        project_lead:profiles!project_lead_id (id, name, email)
      `)
      .eq('id', projectId)
      .single()

    if (error || !project) return null

    const customer = Array.isArray(project.customers) ? project.customers[0] ?? null : project.customers
    const projectLead = Array.isArray(project.project_lead) ? project.project_lead[0] ?? null : project.project_lead

    return {
      id: project.id,
      title: project.title,
      shootStart: project.shoot_start,
      shootEnd: project.shoot_end,
      shootConfirmed: !!project.shoot_confirmed,
      customer,
      projectLead,
    }
  } catch (err) {
    console.error('getProductionInfo error:', err)
    return null
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Henter eller oppretter produksjonssamtalen for prosjektet. Ved førstegangs-opprettelse
 * sås medlemslisten fra pitch-teamet (getPitchTeamAsProdCrew, filtrert til ekte
 * profil-treff — frilansere uten innlogging matches ikke) + prosjektleder + brukeren
 * som åpner den. Etter det er det en vanlig medlemsliste: legg til/fjern manuelt via
 * addConversationMember/removeConversationMember, ingen automatisk re-synkronisering.
 *
 * Bruker service-klienten til selve oppslag/opprettelse-logikken (ikke bare til å skrive
 * andres deltaker-rader, som i startConversation) fordi en bruker som ennå ikke er medlem
 * av en allerede opprettet produksjonssamtale ikke kan se den via RLS — uten service-
 * klienten ville de trodd samtalen ikke fantes og opprettet en duplikat.
 */
export async function getOrCreateProjectConversation(projectId: string): Promise<ProductionChatInfo | null> {
  try {
    const supabase = await createClient()
    const user = await getAuthenticatedStaffUser(supabase)
    if (!user) return null

    const serviceClient = createServiceClient()

    const { data: existing } = await serviceClient
      .from('conversations')
      .select('id')
      .eq('project_id', projectId)
      .maybeSingle()

    let conversationId = existing?.id ?? null

    if (!conversationId) {
      const { data: project } = await serviceClient
        .from('projects')
        .select('project_lead_id')
        .eq('id', projectId)
        .single()
      const pitchTeam = await getPitchTeamAsProdCrew(projectId)

      const memberIds = new Set<string>([user.id])
      if (project?.project_lead_id) memberIds.add(project.project_lead_id)
      for (const m of pitchTeam) {
        if (UUID_RE.test(m.profile_id)) memberIds.add(m.profile_id)
      }

      const { data: conversation, error: convError } = await serviceClient
        .from('conversations')
        .insert({ project_id: projectId })
        .select('id')
        .single()

      if (convError || !conversation) {
        // Racet mot en samtidig førstegangs-åpning — noen andre rakk å opprette den først.
        const { data: raceWinner } = await serviceClient
          .from('conversations')
          .select('id')
          .eq('project_id', projectId)
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
      // Sikre at den som navigerer inn på en allerede opprettet produksjonsside er medlem.
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
    console.error('getOrCreateProjectConversation error:', err)
    return null
  }
}

export async function getConversationMembers(conversationId: string): Promise<ConversationParticipant[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('conversation_participants')
      .select('profiles(id, name, email, color)')
      .eq('conversation_id', conversationId)

    type Row = { profiles: ConversationParticipant | null }
    return ((data ?? []) as unknown as Row[])
      .map((r) => r.profiles)
      .filter((p): p is ConversationParticipant => p !== null)
  } catch (err) {
    console.error('getConversationMembers error:', err)
    return []
  }
}

async function callerIsMember(conversationId: string, userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('conversation_participants')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('profile_id', userId)
    .maybeSingle()
  return !!data
}

export async function addConversationMember(conversationId: string, profileId: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const user = await getAuthenticatedStaffUser(supabase)
    if (!user || !(await callerIsMember(conversationId, user.id))) return false

    const serviceClient = createServiceClient()
    if (!(await isStaffProfile(serviceClient, profileId))) return false

    const { error } = await serviceClient
      .from('conversation_participants')
      .insert({ conversation_id: conversationId, profile_id: profileId })
    return !error
  } catch (err) {
    console.error('addConversationMember error:', err)
    return false
  }
}

export async function removeConversationMember(conversationId: string, profileId: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const user = await getAuthenticatedStaffUser(supabase)
    if (!user || !(await callerIsMember(conversationId, user.id))) return false

    const serviceClient = createServiceClient()
    const { error } = await serviceClient
      .from('conversation_participants')
      .delete()
      .eq('conversation_id', conversationId)
      .eq('profile_id', profileId)
    return !error
  } catch (err) {
    console.error('removeConversationMember error:', err)
    return false
  }
}
