'use server'

import { createClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import type { ProjectWithPipeline, Task, PipelineData, TaskRow, ProjectRow, PreprodMessage } from '@/lib/types'
import { ROLE_TASK_MAP } from '@/lib/postprod-role-map'

export type PreprodCrewMember = {
  profile_id: string
  name: string
  role: string
}

export type PackingItem = {
  id: string
  name: string
  qty: number
  checked: boolean
  // Hvem i teamet som tar med utstyret. Navnet lagres denormalisert siden
  // crew-medlemmer fra pitch kan mangle profil (profile_id på formen "tm_<id>").
  assignee_id?: string | null
  assignee_name?: string | null
}

export type PreprodData = {
  millanote_url: string
  millanote_done: boolean
  prod_crew: PreprodCrewMember[]
  packing_list: PackingItem[]
  // Leveringsfrist per spor, brukt til å foreslå frister bakover på post_prod-oppgavene
  post_deadlines: { video: string | null; photo: string | null }
}

const DEFAULT_PREPROD: PreprodData = {
  millanote_url: '',
  millanote_done: false,
  prod_crew: [],
  packing_list: [],
  post_deadlines: { video: null, photo: null },
}

export type PostProdTaskLite = {
  id: string
  title: string
  sub_type: 'video' | 'photo' | null
  due_date: string | null
}

export type PreprodProject = ProjectWithPipeline & {
  task_count: number
  done_count: number
  postProdAssignedCount: number
  preprod: PreprodData
}

export async function getPreprodProjects(): Promise<PreprodProject[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('projects')
      .select('*, customers(id, name, company), project_lead:profiles!project_lead_id(id, name, email)')
      .eq('pipeline_stage', 'pre_prod')
      .order('updated_at', { ascending: false })

    if (error || !data || data.length === 0) return []

    const ids = data.map((p: { id: string }) => p.id)

    const { data: tasks } = await supabase
      .from('tasks')
      .select('project_id, status')
      .in('project_id', ids)
      .eq('pipeline_stage', 'pre_prod')

    const taskMap: Record<string, { total: number; done: number }> = {}
    for (const t of tasks ?? []) {
      if (!taskMap[t.project_id]) taskMap[t.project_id] = { total: 0, done: 0 }
      taskMap[t.project_id].total++
      if (t.status === 'done') taskMap[t.project_id].done++
    }

    const { data: postProdRows } = await supabase
      .from('tasks')
      .select('project_id, task_assignees(profile_id)')
      .in('project_id', ids)
      .eq('pipeline_stage', 'post_prod')
      .eq('is_custom', false)

    const assignedCountMap: Record<string, number> = {}
    for (const t of postProdRows ?? []) {
      if ((t.task_assignees ?? []).length > 0) {
        assignedCountMap[t.project_id] = (assignedCountMap[t.project_id] ?? 0) + 1
      }
    }

    return data.map((row: ProjectRow) => {
      const pd = (row.pipeline_data as PipelineData) ?? {}
      return {
        ...row,
        customer: row.customers ?? null,
        customers: undefined,
        task_count: taskMap[row.id]?.total ?? 0,
        done_count: taskMap[row.id]?.done ?? 0,
        postProdAssignedCount: assignedCountMap[row.id] ?? 0,
        preprod: { ...DEFAULT_PREPROD, ...(pd.preprod ?? {}) },
      }
    }) as PreprodProject[]
  } catch (err) {
    console.error('getPreprodProjects error:', err)
    return []
  }
}

export type PreprodDetail = {
  project: ProjectWithPipeline & { preprod: PreprodData; quote_equipment: { name: string }[] }
  tasks: Task[]
  postProdTasks: PostProdTaskLite[]
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
}

export async function getPreprodDetail(projectId: string): Promise<PreprodDetail | null> {
  try {
    const supabase = await createClient()

    const { data: project, error: pErr } = await supabase
      .from('projects')
      .select('*, customers(id, name, company), project_lead:profiles!project_lead_id(id, name, email)')
      .eq('id', projectId)
      .single()

    if (pErr || !project) return null

    const { data: tasks } = await supabase
      .from('tasks')
      .select('*, task_assignees(profile:profiles(id, name, email))')
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'pre_prod')
      .order('sort_order', { ascending: true })

    const { data: postProdTasks } = await supabase
      .from('tasks')
      .select('id, title, sub_type, due_date')
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'post_prod')

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email, color')
      .order('name', { ascending: true })

    // Hent utstyr fra gjeldende quote-versjon
    const { data: quotes } = await supabase
      .from('quotes')
      .select('quote_data')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .not('quote_data', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)

    const quoteEquipment: { name: string }[] = []
    const quoteData = quotes?.[0]?.quote_data as { equipment?: { description?: string }[] } | undefined
    if (quoteData?.equipment) {
      for (const item of quoteData.equipment) {
        if (item.description) quoteEquipment.push({ name: item.description })
      }
    }

    const pd = (project.pipeline_data as PipelineData) ?? {}
    const preprod: PreprodData = { ...DEFAULT_PREPROD, ...(pd.preprod ?? {}) }

    return {
      project: {
        ...project,
        customer: project.customers ?? null,
        project_lead: (project as { project_lead?: ProjectWithPipeline['project_lead'] }).project_lead ?? null,
        preprod,
        quote_equipment: quoteEquipment,
      },
      tasks: (tasks ?? []).map((t: TaskRow) => ({
        ...t,
        assignees: (t.task_assignees ?? [])
          .map((ta) => ta.profile)
          .filter((pr): pr is NonNullable<typeof pr> => pr !== null),
      })),
      postProdTasks: (postProdTasks ?? []) as PostProdTaskLite[],
      profiles: (profiles ?? []) as { id: string; name: string | null; email: string; color: string | null }[],
    }
  } catch (err) {
    console.error('getPreprodDetail error:', err)
    return null
  }
}

export async function updatePreprodData(projectId: string, preprod: Partial<PreprodData>): Promise<void> {
  try {
    const supabase = await createClient()

    const { data: project } = await supabase
      .from('projects')
      .select('pipeline_data')
      .eq('id', projectId)
      .single()

    const existing = (project?.pipeline_data as PipelineData) ?? {}
    const currentPreprod: PreprodData = { ...DEFAULT_PREPROD, ...(existing.preprod ?? {}) }

    await supabase
      .from('projects')
      .update({
        pipeline_data: { ...existing, preprod: { ...currentPreprod, ...preprod } },
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    revalidatePath(`/admin/preprod/${projectId}`)
    revalidatePath('/admin/preprod')
  } catch (err) {
    console.error('updatePreprodData error:', err)
  }
}

// Henter teamet fra pitch-seksjonen og matcher mot profiles via email.
// Returnerer PreprodCrewMember[] med profile_id der match finnes.
export async function getPitchTeamAsProdCrew(
  projectId: string
): Promise<PreprodCrewMember[]> {
  try {
    const supabase = await createClient()

    // Finn team-seksjonen for prosjektet
    const { data: section } = await supabase
      .from('sections')
      .select('id, content')
      .eq('project_id', projectId)
      .eq('type', 'team')
      .maybeSingle()

    if (!section) return []

    const content = section.content as {
      teamMemberRoles?: Record<string, string>
    } | null

    // Hent valgte teammedlemmer via junction-tabell
    const { data: links } = await supabase
      .from('section_team_members')
      .select('team_member_id, order_index')
      .eq('section_id', section.id)
      .order('order_index', { ascending: true })

    if (!links?.length) return []

    const memberIds = links.map((l: { team_member_id: string }) => l.team_member_id)

    const { data: members } = await supabase
      .from('team_members')
      .select('id, name, role, email')
      .in('id', memberIds)

    if (!members?.length) return []

    // Hent alle profiles for å matche på email
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email')

    const profileByEmail = new Map(
      (profiles ?? [])
        .filter((p: { email: string | null }) => p.email)
        .map((p: { id: string; name: string | null; email: string }) => [p.email.toLowerCase(), p])
    )

    return memberIds
      .map((id: string) => {
        const member = members.find((m: { id: string }) => m.id === id)
        if (!member) return null

        // Prosjektspesifikk rolle overstyrer standardrollen
        const role = content?.teamMemberRoles?.[id] ?? member.role

        // Match til profile via email
        const profile = member.email
          ? profileByEmail.get(member.email.toLowerCase())
          : null

        return {
          profile_id: profile?.id ?? `tm_${id}`,
          name: profile?.name ?? member.name,
          role,
        }
      })
      .filter((m): m is PreprodCrewMember => m !== null)
  } catch (err) {
    console.error('getPitchTeamAsProdCrew error:', err)
    return []
  }
}

// Setter status på "Tildel oppgaver til teamet" basert på crew-tilstand.
export async function setTildelTaskStatus(
  projectId: string,
  status: 'todo' | 'in_progress' | 'done'
): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('tasks')
      .update({ status })
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'pre_prod')
      .eq('title', 'Tildel oppgaver til teamet')
      .neq('status', status)
      .select('id')
      .maybeSingle()
    revalidatePath(`/admin/preprod/${projectId}`)
    return data?.id ?? null
  } catch (err) {
    console.error('setTildelTaskStatus error:', err)
    return null
  }
}

// Fjerner forrige person og legger til ny på alle matchende oppgavetitler.
export async function syncPostCrewToTask(
  projectId: string,
  roleKey: string,
  newProfileId: string | null,
  prevProfileId: string | null
): Promise<void> {
  const titles = ROLE_TASK_MAP[roleKey]
  if (!titles?.length || (!newProfileId && !prevProfileId)) return

  try {
    const supabase = await createClient()

    const { data: tasks } = await supabase
      .from('tasks')
      .select('id')
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'post_prod')
      .in('title', titles)

    if (!tasks?.length) return

    const taskIds = tasks.map(t => t.id)

    if (prevProfileId) {
      await supabase
        .from('task_assignees')
        .delete()
        .in('task_id', taskIds)
        .eq('profile_id', prevProfileId)
    }

    if (newProfileId) {
      await supabase
        .from('task_assignees')
        .upsert(
          taskIds.map(task_id => ({ task_id, profile_id: newProfileId })),
          { onConflict: 'task_id,profile_id' }
        )
    }

    revalidatePath(`/admin/postprod/${projectId}`)
  } catch (err) {
    console.error('syncPostCrewToTask error:', err)
  }
}

export async function updatePreprodTaskStatus(
  taskId: string,
  status: 'todo' | 'in_progress' | 'done'
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', taskId)
  } catch (err) {
    console.error('updatePreprodTaskStatus error:', err)
  }
}

// ─── Pre-prod-chat ────────────────────────────────────────────────────────
// Samme mønster som tilbudschatten (lib/actions/quotes.ts) — @mention- og
// reaksjonsvarsler håndteres av DB-triggerne i 127_preprod_messages.sql.

export async function getPreprodMessages(projectId: string): Promise<PreprodMessage[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('preprod_messages')
      .select('id, project_id, user_id, message, mentions, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('getPreprodMessages error:', error)
      return []
    }

    const rows = data ?? []
    if (rows.length === 0) return []

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
    })) as PreprodMessage[]
  } catch (err) {
    console.error('getPreprodMessages unexpected error:', err)
    return []
  }
}

export async function sendPreprodMessage(opts: {
  projectId: string
  message: string
  mentionedUserIds: string[]
}): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false }

    const { error } = await supabase.from('preprod_messages').insert({
      project_id: opts.projectId,
      user_id: user.id,
      message: opts.message.trim(),
      mentions: opts.mentionedUserIds,
    })

    if (error) {
      console.error('sendPreprodMessage insert error:', error)
      return { ok: false }
    }

    return { ok: true }
  } catch (err) {
    console.error('sendPreprodMessage unexpected error:', err)
    return { ok: false }
  }
}
