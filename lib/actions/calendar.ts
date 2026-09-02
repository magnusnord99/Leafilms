'use server'

import { createClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

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

export function companyLabel(customer: { name: string | null; company?: string | null } | null | undefined): string | null {
  return customer?.company || customer?.name || null
}

// Standard kalendernavn for en oppgave når ingen har overstyrt det manuelt (feedback
// 89524e2d): "POSTPROD - <oppgavetittel> - <firmanavn>" for post-produksjon, siden det er
// der behovet ble meldt inn — andre steg beholder bare oppgavetittelen som før. Eksportert
// slik at postprod-siden kan vise samme mal som plassholder i "Kalendernavn"-feltet.
export function buildTaskCalendarLabel(title: string, pipelineStage: string, company: string | null): string {
  if (pipelineStage === 'post_prod' && company) return `POSTPROD - ${title} - ${company}`
  return title
}

/**
 * `filterProfileId` = null: ufiltrert (dagens oppførsel — admin uten valgt person).
 * Satt: kun opptak der personen står i prod_crew, og oppgaver personen er tildelt.
 */
export async function getCalendarEvents(filterProfileId: string | null = null): Promise<{
  shootings: ShootingEvent[]
  tasks: TaskEvent[]
}> {
  try {
    const supabase = await createClient()

    const [{ data: projects }, { data: tasks }, { data: signedContracts }, assignedTaskIds] = await Promise.all([
      supabase
        .from('projects')
        .select('id, title, pipeline_stage, shoot_start, shoot_end, shoot_confirmed, pipeline_data, customers(name)')
        .not('shoot_start', 'is', null),
      supabase
        .from('tasks')
        .select(`
          id, title, pipeline_stage, status, due_date, project_id, calendar_name,
          project:projects ( id, title, pipeline_stage, customers(name, company) )
        `)
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true }),
      supabase
        .from('contracts')
        .select('project_id')
        .eq('status', 'signed'),
      filterProfileId
        ? supabase.from('task_assignees').select('task_id').eq('profile_id', filterProfileId)
        : Promise.resolve({ data: null } as { data: { task_id: string }[] | null }),
    ])

    type ProjectCalRow = {
      id: string; title: string; pipeline_stage: string; shoot_start: string; shoot_end: string | null
      shoot_confirmed: boolean; pipeline_data: { preprod?: { prod_crew?: { profile_id: string }[] } } | null
      customers?: { name: string | null } | null
    }
    type TaskCalRow = {
      id: string; title: string; pipeline_stage: string; status: 'todo' | 'in_progress' | 'done'; due_date: string
      calendar_name: string | null
      project: { id: string; title: string; pipeline_stage: string; customers?: { name: string | null; company: string | null } | null } | null
    }

    // Opptak regnes som bekreftet kun når kontrakten er signert, eller admin har bekreftet manuelt.
    // pipeline_stage alene er ikke pålitelig — prosjekter kan flyttes forbi 'kontrakt' uten signatur
    // (se advanceFromKontraktUnsigned i lib/actions/pipeline.ts).
    const signedProjectIds = new Set((signedContracts ?? []).map(c => c.project_id as string))

    let projectRows = (projects ?? []) as unknown as ProjectCalRow[]
    if (filterProfileId) {
      projectRows = projectRows.filter((p) =>
        (p.pipeline_data?.preprod?.prod_crew ?? []).some((c) => c.profile_id === filterProfileId)
      )
    }

    const shootings: ShootingEvent[] = projectRows.map((p) => ({
      projectId: p.id,
      projectTitle: p.title,
      customerName: p.customers?.name ?? null,
      shootStart: p.shoot_start,
      shootEnd: p.shoot_end ?? null,
      confirmed: p.shoot_confirmed || signedProjectIds.has(p.id),
      pipelineStage: p.pipeline_stage,
    }))

    const assignedIdSet = filterProfileId ? new Set((assignedTaskIds.data ?? []).map((r) => r.task_id)) : null

    const taskEvents: TaskEvent[] = ((tasks ?? []) as unknown as TaskCalRow[])
      .filter((t) => t.project && (!assignedIdSet || assignedIdSet.has(t.id)))
      .map((t) => {
        const company = companyLabel(t.project!.customers)
        return {
          taskId: t.id,
          taskTitle: t.calendar_name?.trim() || buildTaskCalendarLabel(t.title, t.pipeline_stage, company),
          pipelineStage: t.pipeline_stage,
          projectId: t.project!.id,
          projectTitle: t.project!.title,
          customerName: t.project!.customers?.name ?? null,
          dueDate: t.due_date,
          status: t.status,
        }
      })

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

export async function setShootConfirmed(
  projectId: string,
  confirmed: boolean
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('projects')
      .update({ shoot_confirmed: confirmed, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    revalidatePath('/admin/calendar')
    revalidatePath(`/admin/projects/${projectId}`)
  } catch (err) {
    console.error('setShootConfirmed error:', err)
  }
}

export async function updateTaskCalendarName(
  taskId: string,
  calendarName: string | null
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('tasks')
      .update({ calendar_name: calendarName?.trim() || null, updated_at: new Date().toISOString() })
      .eq('id', taskId)
    revalidatePath('/admin/calendar')
    revalidatePath('/admin/postprod')
  } catch (err) {
    console.error('updateTaskCalendarName error:', err)
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
