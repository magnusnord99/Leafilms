'use server'

import { createClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import type { ProjectWithPipeline, Task, PipelineData, TaskRow, ProjectRow } from '@/lib/types'

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
}

const DEFAULT_PREPROD: PreprodData = {
  millanote_url: '',
  millanote_done: false,
  prod_crew: [],
  packing_list: [],
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
