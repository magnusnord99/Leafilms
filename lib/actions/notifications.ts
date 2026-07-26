'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { PipelineStage } from '@/lib/types'

export type Notification = {
  id: string
  type: 'project_message' | 'task_message' | 'selection_submitted' | 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned' | 'quote_mention' | 'project_message_mention' | 'task_message_mention' | 'quote_message' | 'feedback_reply' | 'contract_signed' | 'project_message_reaction' | 'task_message_reaction' | 'quote_message_reaction' | 'resale_assigned' | 'direct_message' | 'meeting_invite' | 'meeting_response' | 'board_comment_mention' | 'board_comment_reply' | 'pitch_review_requested' | 'pitch_review_responded' | 'quote_review_requested' | 'quote_review_responded' | 'preprod_mention' | 'preprod_message' | 'preprod_message_reaction'
  project_id: string | null
  task_id: string | null
  lead_id: string | null
  conversation_id: string | null
  message_id: string | null
  meeting_id: string | null
  board_id: string | null
  board_card_id: string | null
  message_preview: string
  sender_name: string
  read: boolean
  created_at: string
  projects: { title: string } | null
  tasks: { title: string; pipeline_stage: PipelineStage | null } | null
  leads: { name: string; company: string | null } | null
}

// Meldingskanalen et varsel hører til ('project' | 'task' | 'quote' | 'direct')
// avledes klient-side i VarslerClient (channelForNotification der) — kan ikke
// eksporteres herfra siden 'use server'-filer kun kan eksportere async actions.

export async function getNotifications(): Promise<Notification[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('notifications')
      .select('*, projects(title), tasks(title, pipeline_stage), leads(name, company)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) return []
    return (data ?? []) as Notification[]
  } catch {
    return []
  }
}

export async function getUnreadCount(): Promise<number> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0

    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false)

    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

export async function markAsRead(id: string): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    revalidatePath('/admin/varsler')
  } catch {}
}

export async function deleteNotification(id: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    // RLS ("Users can delete own notifications") scoper til egen bruker
    const { error } = await supabase.from('notifications').delete().eq('id', id)
    if (error) { console.error('deleteNotification:', error); return false }
    revalidatePath('/admin/varsler')
    return true
  } catch (err) {
    console.error('deleteNotification:', err)
    return false
  }
}

export async function deleteReadNotifications(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', user.id)
      .eq('read', true)
    if (error) { console.error('deleteReadNotifications:', error); return false }
    revalidatePath('/admin/varsler')
    return true
  } catch (err) {
    console.error('deleteReadNotifications:', err)
    return false
  }
}

/**
 * Svar på et varsel direkte fra varselsiden. Svaret postes i kanalen varselet
 * kom fra (prosjekt-chat, oppgave-chat, tilbudschat eller direktemelding), og
 * varsler mottakere via de eksisterende notify-triggerne. Varselet markeres
 * samtidig som lest.
 */
export async function replyToNotification(
  notificationId: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const message = text.trim()
    if (!message) return { ok: false, error: 'Tomt svar' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke autentisert' }

    const { data: n } = await supabase
      .from('notifications')
      .select('id, type, project_id, task_id, conversation_id, user_id')
      .eq('id', notificationId)
      .eq('user_id', user.id)
      .single()
    if (!n) return { ok: false, error: 'Fant ikke varselet' }

    if (n.type === 'project_message' || n.type === 'project_message_mention' || n.type === 'project_message_reaction') {
      if (!n.project_id) return { ok: false, error: 'Varselet mangler prosjekt' }
      const { data: profile } = await supabase.from('profiles').select('name, email').eq('id', user.id).single()
      const { error } = await supabase.from('project_messages').insert({
        project_id: n.project_id,
        user_id: user.id,
        user_name: profile?.name ?? profile?.email ?? 'Ukjent',
        content: message,
        mentions: [],
      })
      if (error) { console.error('replyToNotification project:', error); return { ok: false, error: 'Kunne ikke sende' } }
    } else if (n.type === 'task_message' || n.type === 'task_message_mention' || n.type === 'task_message_reaction') {
      if (!n.task_id) return { ok: false, error: 'Varselet mangler oppgave' }
      const { error } = await supabase.from('task_messages').insert({
        task_id: n.task_id,
        user_id: user.id,
        message,
        mentions: [],
      })
      if (error) { console.error('replyToNotification task:', error); return { ok: false, error: 'Kunne ikke sende' } }
    } else if (n.type === 'quote_message' || n.type === 'quote_mention' || n.type === 'quote_message_reaction') {
      if (!n.project_id) return { ok: false, error: 'Varselet mangler prosjekt' }
      const { data: quote } = await supabase
        .from('quotes')
        .select('id')
        .eq('project_id', n.project_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!quote) return { ok: false, error: 'Fant ikke tilbudet' }
      const { error } = await supabase.from('quote_messages').insert({
        quote_id: quote.id,
        project_id: n.project_id,
        user_id: user.id,
        message,
        mentions: [],
      })
      if (error) { console.error('replyToNotification quote:', error); return { ok: false, error: 'Kunne ikke sende' } }
    } else if (n.type === 'preprod_message' || n.type === 'preprod_mention' || n.type === 'preprod_message_reaction') {
      if (!n.project_id) return { ok: false, error: 'Varselet mangler prosjekt' }
      const { error } = await supabase.from('preprod_messages').insert({
        project_id: n.project_id,
        user_id: user.id,
        message,
        mentions: [],
      })
      if (error) { console.error('replyToNotification preprod:', error); return { ok: false, error: 'Kunne ikke sende' } }
    } else if (n.type === 'direct_message') {
      if (!n.conversation_id) return { ok: false, error: 'Varselet mangler samtale' }
      const { error } = await supabase.from('conversation_messages').insert({
        conversation_id: n.conversation_id,
        sender_id: user.id,
        content: message,
      })
      if (error) { console.error('replyToNotification direct:', error); return { ok: false, error: 'Kunne ikke sende' } }
    } else {
      return { ok: false, error: 'Denne varseltypen kan ikke besvares' }
    }

    await supabase.from('notifications').update({ read: true }).eq('id', notificationId)
    revalidatePath('/admin/varsler')
    return { ok: true }
  } catch (err) {
    console.error('replyToNotification:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function markAllAsRead(): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)
    revalidatePath('/admin/varsler')
  } catch {}
}
