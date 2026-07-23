'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { DailyPlanItem, Task, TaskRow } from '@/lib/types'
import { computeStepperLocks } from '@/lib/task-lock'

type PlanProject = {
  id: string; title: string; pipeline_stage: string
  customer: { name: string; company: string | null } | null
}

type DailyPlanRow = {
  id: string
  sort_order: number
  title: string | null
  done: boolean
  task: (TaskRow & { project: PlanProject | null }) | null
}

function mapRow(row: DailyPlanRow): DailyPlanItem | null {
  if (row.task) {
    const t = row.task
    const task = {
      ...t,
      assignees: (t.task_assignees ?? []).map(ta => ta.profile).filter(Boolean),
      project: t.project,
    } as Task & { project: PlanProject | null }
    return { id: row.id, kind: 'task', sort_order: row.sort_order, task }
  }
  if (row.title) {
    return { id: row.id, kind: 'custom', sort_order: row.sort_order, title: row.title, done: row.done }
  }
  return null
}

export async function getDailyPlanItems(): Promise<DailyPlanItem[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('daily_plan_items')
      .select(`
        id, sort_order, title, done,
        task:tasks (
          *,
          task_assignees ( profile:profiles ( id, name, email ) ),
          project:projects ( id, title, pipeline_stage, customer:customers ( name, company ) )
        )
      `)
      .eq('profile_id', user.id)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('getDailyPlanItems error:', error)
      return []
    }

    const items = ((data ?? []) as unknown as DailyPlanRow[])
      .map(mapRow)
      .filter((item): item is DailyPlanItem => item !== null)

    const locks = await computeStepperLocks(
      supabase,
      items.filter(i => i.kind === 'task').map(i => i.task)
    )

    return items.map(item =>
      item.kind === 'task' ? { ...item, task: { ...item.task, ...(locks.get(item.task.id) ?? {}) } } : item
    )
  } catch (err) {
    console.error('getDailyPlanItems unexpected error:', err)
    return []
  }
}

async function nextSortOrder(supabase: Awaited<ReturnType<typeof createClient>>, profileId: string): Promise<number> {
  const { data } = await supabase
    .from('daily_plan_items')
    .select('sort_order')
    .eq('profile_id', profileId)
    .order('sort_order', { ascending: false })
    .limit(1)
  return (data && data.length > 0 ? data[0].sort_order : -1) + 1
}

export async function addTaskToPlan(taskId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const sortOrder = await nextSortOrder(supabase, user.id)

    const { error } = await supabase
      .from('daily_plan_items')
      .insert({ profile_id: user.id, task_id: taskId, sort_order: sortOrder })

    if (error) {
      if (error.code === '23505') return { ok: true } // allerede i planen
      console.error('addTaskToPlan error:', error)
      return { ok: false, error: 'Kunne ikke legge til oppgaven' }
    }

    revalidatePath('/admin/tasks')
    return { ok: true }
  } catch (err) {
    console.error('addTaskToPlan unexpected error:', err)
    return { ok: false, error: 'Kunne ikke legge til oppgaven' }
  }
}

export async function addCustomPlanItem(title: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const trimmed = title.trim()
    if (!trimmed) return { ok: false, error: 'Tittel kan ikke være tom' }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const sortOrder = await nextSortOrder(supabase, user.id)

    const { error } = await supabase
      .from('daily_plan_items')
      .insert({ profile_id: user.id, title: trimmed, sort_order: sortOrder })

    if (error) {
      console.error('addCustomPlanItem error:', error)
      return { ok: false, error: 'Kunne ikke legge til oppgaven' }
    }

    revalidatePath('/admin/tasks')
    return { ok: true }
  } catch (err) {
    console.error('addCustomPlanItem unexpected error:', err)
    return { ok: false, error: 'Kunne ikke legge til oppgaven' }
  }
}

export async function toggleCustomPlanItem(id: string, done: boolean): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('daily_plan_items').update({ done }).eq('id', id).is('task_id', null)
    revalidatePath('/admin/tasks')
  } catch (err) {
    console.error('toggleCustomPlanItem error:', err)
  }
}

export async function removePlanItem(id: string): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('daily_plan_items').delete().eq('id', id)
    revalidatePath('/admin/tasks')
  } catch (err) {
    console.error('removePlanItem error:', err)
  }
}

export async function reorderPlanItems(orderedIds: string[]): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await Promise.all(
      orderedIds.map((id, index) =>
        supabase.from('daily_plan_items').update({ sort_order: index }).eq('id', id).eq('profile_id', user.id)
      )
    )

    revalidatePath('/admin/tasks')
  } catch (err) {
    console.error('reorderPlanItems error:', err)
  }
}
