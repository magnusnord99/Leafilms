'use server'

import { createClient } from '@/lib/supabase-server'
import { getThreadHref, type ThreadDescriptor } from '@/lib/notification-routing'
import type { PipelineStage } from '@/lib/types'

export type ProjectThreadKind = 'project' | 'task' | 'preprod' | 'quote' | 'production' | 'lead' | 'email'

export type ProjectThreadListItem = {
  key: string // f.eks. "task:<uuid>" — unik radnøkkel
  kind: ProjectThreadKind
  descriptor: ThreadDescriptor
  conversationId: string | null // satt kun for kind 'production' | 'lead' | 'email'
  label: string
  href: string
  lastMessage: { preview: string; senderName: string; createdAt: string } | null
  unreadCount: number
}

// De 10 ikke-reaksjon-typene som representerer trådaktivitet. *_reaction og alle
// andre varseltyper (task_assigned, lead_assigned, osv.) er ikke trådaktivitet
// og skal ikke telle som lastMessage/unreadCount for en tråd.
const THREAD_NOTIFICATION_TYPES = [
  'project_message',
  'project_message_mention',
  'task_message',
  'task_message_mention',
  'preprod_message',
  'preprod_mention',
  'quote_message',
  'quote_mention',
  'direct_message',
  'conversation_message_mention',
] as const

type ThreadNotificationType = (typeof THREAD_NOTIFICATION_TYPES)[number]

type ThreadNotificationRow = {
  id: string
  type: ThreadNotificationType
  project_id: string | null
  task_id: string | null
  conversation_id: string | null
  message_preview: string
  sender_name: string
  read: boolean
  created_at: string
  projects: { title: string } | null
  tasks: { title: string; pipeline_stage: PipelineStage | null } | null
}

type ConversationClassification =
  | { kind: 'production'; id: string }
  | { kind: 'lead'; id: string }
  | { kind: 'email'; id: string }
  | null

type ThreadGroup = {
  kind: ProjectThreadKind
  descriptor: ThreadDescriptor
  conversationId: string | null
  label: string
  lastMessage: { preview: string; senderName: string; createdAt: string } | null
  unreadCount: number
}

export async function getProjectThreads(): Promise<ProjectThreadListItem[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // Step 1: hent relevante varsler
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, project_id, task_id, conversation_id, message_preview, sender_name, read, created_at, projects(title), tasks(title, pipeline_stage)')
      .eq('user_id', user.id)
      .in('type', THREAD_NOTIFICATION_TYPES)
      .order('created_at', { ascending: false })
      .limit(300)

    if (error) return []
    const notifications = (data ?? []) as unknown as ThreadNotificationRow[]
    if (notifications.length === 0) return []

    // Step 2: klassifiser samtale-baserte varsler
    const conversationIds = [...new Set(
      notifications
        .filter((n) => (n.type === 'direct_message' || n.type === 'conversation_message_mention') && n.conversation_id)
        .map((n) => n.conversation_id as string)
    )]

    const conversationClassificationById = new Map<string, ConversationClassification>()
    if (conversationIds.length > 0) {
      const { data: conversations } = await supabase
        .from('conversations')
        .select('id, project_id, lead_id, email_discussion_project_id')
        .in('id', conversationIds)

      for (const c of conversations ?? []) {
        if (c.project_id) conversationClassificationById.set(c.id, { kind: 'production', id: c.project_id })
        else if (c.lead_id) conversationClassificationById.set(c.id, { kind: 'lead', id: c.lead_id })
        else if (c.email_discussion_project_id) conversationClassificationById.set(c.id, { kind: 'email', id: c.email_discussion_project_id })
        else conversationClassificationById.set(c.id, null) // ren DM — ikke en prosjekttråd
      }
    }

    // Labels for samtale-baserte tråder: 'production'/'email' peker på et
    // prosjekt, men notifications.project_id er ikke satt på disse radene
    // (kun conversation_id), så notifications-joinet over gir ingen tittel —
    // hent prosjekttitler og lead-navn separat for de distincte id-ene.
    const productionEmailProjectIds = [...new Set(
      Array.from(conversationClassificationById.values())
        .filter((c): c is { kind: 'production' | 'email'; id: string } => c?.kind === 'production' || c?.kind === 'email')
        .map((c) => c.id)
    )]
    const projectTitleById = new Map<string, string>()
    if (productionEmailProjectIds.length > 0) {
      const { data: projects } = await supabase.from('projects').select('id, title').in('id', productionEmailProjectIds)
      for (const p of projects ?? []) projectTitleById.set(p.id, p.title)
    }

    const leadIds = [...new Set(
      Array.from(conversationClassificationById.values())
        .filter((c): c is { kind: 'lead'; id: string } => c?.kind === 'lead')
        .map((c) => c.id)
    )]
    const leadNameById = new Map<string, string>()
    if (leadIds.length > 0) {
      const { data: leads } = await supabase.from('leads').select('id, name').in('id', leadIds)
      for (const l of leads ?? []) leadNameById.set(l.id, l.name)
    }

    // Step 3: grupper per tråd-nøkkel. Radene er sortert nyeste-først (Step 1), så
    // første rad per nøkkel er lastMessage; unreadCount telles over hele gruppen.
    const groups = new Map<string, ThreadGroup>()

    for (const n of notifications) {
      let key: string
      let kind: ProjectThreadKind
      let descriptor: ThreadDescriptor
      let conversationId: string | null = null
      let label: string

      if (n.type === 'project_message' || n.type === 'project_message_mention') {
        if (!n.project_id) continue
        kind = 'project'
        key = `project:${n.project_id}`
        descriptor = { kind: 'project', projectId: n.project_id }
        label = n.projects?.title ?? 'Prosjekt'
      } else if (n.type === 'task_message' || n.type === 'task_message_mention') {
        if (!n.task_id || !n.project_id) continue
        kind = 'task'
        key = `task:${n.task_id}`
        descriptor = { kind: 'task', projectId: n.project_id, taskId: n.task_id, pipelineStage: n.tasks?.pipeline_stage ?? null }
        label = n.tasks?.title ? `${n.tasks.title} – ${n.projects?.title ?? 'Prosjekt'}` : (n.projects?.title ?? 'Oppgave')
      } else if (n.type === 'preprod_message' || n.type === 'preprod_mention') {
        if (!n.project_id) continue
        kind = 'preprod'
        key = `preprod:${n.project_id}`
        descriptor = { kind: 'preprod', projectId: n.project_id }
        label = n.projects?.title ?? 'Pre-prod'
      } else if (n.type === 'quote_message' || n.type === 'quote_mention') {
        if (!n.project_id) continue
        kind = 'quote'
        key = `quote:${n.project_id}`
        descriptor = { kind: 'quote', projectId: n.project_id }
        label = n.projects?.title ?? 'Tilbud'
      } else {
        // direct_message / conversation_message_mention
        if (!n.conversation_id) continue
        const classification = conversationClassificationById.get(n.conversation_id)
        if (!classification) continue // ren DM — skal ikke bli en prosjekttråd
        conversationId = n.conversation_id

        if (classification.kind === 'production') {
          kind = 'production'
          key = `production:${classification.id}`
          descriptor = { kind: 'production', projectId: classification.id }
          label = projectTitleById.get(classification.id) ?? n.projects?.title ?? 'Produksjon'
        } else if (classification.kind === 'lead') {
          kind = 'lead'
          key = `lead:${classification.id}`
          descriptor = { kind: 'lead', leadId: classification.id }
          label = leadNameById.get(classification.id) ?? 'Lead'
        } else {
          kind = 'email'
          key = `email:${classification.id}`
          descriptor = { kind: 'email', projectId: classification.id }
          label = projectTitleById.get(classification.id) ?? n.projects?.title ?? 'E-post'
        }
      }

      let group = groups.get(key)
      if (!group) {
        group = { kind, descriptor, conversationId, label, lastMessage: null, unreadCount: 0 }
        groups.set(key, group)
      }
      if (!group.lastMessage) {
        group.lastMessage = { preview: n.message_preview, senderName: n.sender_name, createdAt: n.created_at }
      }
      if (!n.read) group.unreadCount += 1
    }

    return Array.from(groups.entries()).map(([key, g]) => ({
      key,
      kind: g.kind,
      descriptor: g.descriptor,
      conversationId: g.conversationId,
      label: g.label,
      href: getThreadHref(g.descriptor),
      lastMessage: g.lastMessage,
      unreadCount: g.unreadCount,
    }))
  } catch (err) {
    console.error('getProjectThreads error:', err)
    return []
  }
}

/**
 * Markerer en prosjekttråds varsler som lest. Håndterer kun 'project'/'task'/
 * 'preprod'/'quote' — for 'production'/'lead'/'email' bruker UI-laget i stedet
 * eksisterende markConversationRead(conversationId) fra lib/actions/messages.ts
 * (samme mekanisme som Direkte-lista bruker i dag).
 */
export async function markProjectThreadRead(descriptor: ThreadDescriptor): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const base = supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false)

    if (descriptor.kind === 'project') {
      await base.in('type', ['project_message', 'project_message_mention']).eq('project_id', descriptor.projectId)
    } else if (descriptor.kind === 'task') {
      await base.in('type', ['task_message', 'task_message_mention']).eq('task_id', descriptor.taskId)
    } else if (descriptor.kind === 'preprod') {
      await base.in('type', ['preprod_message', 'preprod_mention']).eq('project_id', descriptor.projectId)
    } else if (descriptor.kind === 'quote') {
      await base.in('type', ['quote_message', 'quote_mention']).eq('project_id', descriptor.projectId)
    }
    // production/lead/email: no-op (se jsdoc over)
  } catch {}
}
