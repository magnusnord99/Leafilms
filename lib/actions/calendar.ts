'use server'

import { createClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

const CONFIRMED_STAGES = new Set([
  'kontrakt', 'pre_prod', 'produksjon', 'post_prod',
  'levering', 'fakturert', 'videresalg',
])

export type ShootingEvent = {
  projectId: string
  projectTitle: string
  customerName: string | null
  shootStart: string        // 'YYYY-MM-DD'
  shootEnd: string | null   // 'YYYY-MM-DD'
  confirmed: boolean
  pipelineStage: string
}

export type TaskEvent = {
  taskId: string
  taskTitle: string
  pipelineStage: string
  projectId: string
  projectTitle: string
  customerName: string | null
  dueDate: string          // 'YYYY-MM-DD'
  status: 'todo' | 'in_progress' | 'done'
}

export async function getCalendarEvents(): Promise<{
  shootings: ShootingEvent[]
  tasks: TaskEvent[]
}> {
  try {
    const supabase = await createClient()

    const [{ data: projects }, { data: tasks }] = await Promise.all([
      supabase
        .from('projects')
        .select('id, title, pipeline_stage, shoot_start, shoot_end, customers(name)')
        .not('shoot_start', 'is', null),
      supabase
        .from('tasks')
        .select(`
          id, title, pipeline_stage, status, due_date, project_id,
          project:projects ( id, title, pipeline_stage, customers(name) )
        `)
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true }),
    ])

    type ProjectCalRow = { id: string; title: string; pipeline_stage: string; shoot_start: string; shoot_end: string | null; customers?: { name: string | null } | null }
    type TaskCalRow = { id: string; title: string; pipeline_stage: string; status: 'todo' | 'in_progress' | 'done'; due_date: string; project: { id: string; title: string; pipeline_stage: string; customers?: { name: string | null } | null } | null }

    const shootings: ShootingEvent[] = ((projects ?? []) as unknown as ProjectCalRow[]).map((p) => ({
      projectId: p.id,
      projectTitle: p.title,
      customerName: p.customers?.name ?? null,
      shootStart: p.shoot_start,
      shootEnd: p.shoot_end ?? null,
      confirmed: CONFIRMED_STAGES.has(p.pipeline_stage),
      pipelineStage: p.pipeline_stage,
    }))

    const taskEvents: TaskEvent[] = ((tasks ?? []) as unknown as TaskCalRow[])
      .filter((t) => t.project)
      .map((t) => ({
        taskId: t.id,
        taskTitle: t.title,
        pipelineStage: t.pipeline_stage,
        projectId: t.project!.id,
        projectTitle: t.project!.title,
        customerName: t.project!.customers?.name ?? null,
        dueDate: t.due_date,
        status: t.status,
      }))

    return { shootings, tasks: taskEvents }
  } catch (err) {
    console.error('getCalendarEvents error:', err)
    return { shootings: [], tasks: [] }
  }
}

export async function updateProjectShootDates(
  projectId: string,
  shootStart: string | null,
  shootEnd: string | null
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('projects')
      .update({
        shoot_start: shootStart || null,
        shoot_end: shootEnd || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
    revalidatePath('/admin/calendar')
    revalidatePath('/admin/projects')
  } catch (err) {
    console.error('updateProjectShootDates error:', err)
  }
}

export async function updateTaskDueDate(
  taskId: string,
  dueDate: string | null
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('tasks')
      .update({ due_date: dueDate || null, updated_at: new Date().toISOString() })
      .eq('id', taskId)
    revalidatePath('/admin/calendar')
    revalidatePath('/admin/postprod')
  } catch (err) {
    console.error('updateTaskDueDate error:', err)
  }
}
