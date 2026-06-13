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
}

export type PreprodData = {
  millanote_url: string
  millanote_done: boolean
  prod_crew: PreprodCrewMember[]
  post_crew: PreprodCrewMember[]
  packing_list: PackingItem[]
}

const DEFAULT_PREPROD: PreprodData = {
  millanote_url: '',
  millanote_done: false,
  prod_crew: [],
  post_crew: [],
  packing_list: [],
}

export type PreprodProject = ProjectWithPipeline & {
  task_count: number
  done_count: number
  preprod: PreprodData
}

export async function getPreprodProjects(): Promise<PreprodProject[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('projects')
      .select('*, customers(id, name, company)')
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

    return data.map((row: ProjectRow) => {
      const pd = (row.pipeline_data as PipelineData) ?? {}
      return {
        ...row,
        customer: row.customers ?? null,
        customers: undefined,
        task_count: taskMap[row.id]?.total ?? 0,
        done_count: taskMap[row.id]?.done ?? 0,
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
  profiles: { id: string; name: string | null; email: string }[]
}

export async function getPreprodDetail(projectId: string): Promise<PreprodDetail | null> {
  try {
    const supabase = await createClient()

    const { data: project, error: pErr } = await supabase
      .from('projects')
      .select('*, customers(id, name, company)')
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
      .select('id, name, email')
      .order('name', { ascending: true })

    // Hent utstyr fra siste quote
    const { data: quotes } = await supabase
      .from('quotes')
      .select('quote_data')
      .eq('project_id', projectId)
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
        preprod,
        quote_equipment: quoteEquipment,
      },
      tasks: (tasks ?? []).map((t: TaskRow) => ({
        ...t,
        assignees: (t.task_assignees ?? [])
          .map((ta) => ta.profile)
          .filter((pr): pr is NonNullable<typeof pr> => pr !== null),
      })),
      profiles: (profiles ?? []) as { id: string; name: string | null; email: string }[],
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
