'use server'

import { createClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { companyLabel, buildTaskCalendarLabel } from '@/lib/calendar-label'

// Abonnements-URL for iPhone/Google Calendar (se lib/ics-feed.ts) — tokenet er et
// serverhemmelig miljøvariabel, så URL-en bygges kun server-side og returneres til
// en allerede innlogget admin-bruker, aldri til et uautentisert endepunkt.
export async function getCalendarFeedUrl(): Promise<{ url: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { url: null }

  const token = process.env.CALENDAR_FEED_TOKEN
  if (!token) return { url: null }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://leafilms.no'
  return { url: `${siteUrl}/api/calendar-feed/${token}` }
}

export type CalendarSyncPreferences = {
  shoots: boolean
  deliveries: boolean
  meetings: boolean
  tasks: boolean
}

// Personlig abonnements-URL (183_personal_calendar_feed.sql) — i tillegg til den
// delte lenken over. Hver bruker har sitt eget token og velger selv hvilke
// hendelsestyper som skal med (se app/admin/profile).
export async function getPersonalCalendarFeedUrl(): Promise<{ url: string | null; prefs: CalendarSyncPreferences | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { url: null, prefs: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('calendar_feed_token, calendar_sync_shoots, calendar_sync_deliveries, calendar_sync_meetings, calendar_sync_tasks')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile?.calendar_feed_token) return { url: null, prefs: null }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://leafilms.no'
  return {
    url: `${siteUrl}/api/calendar-feed/me/${profile.calendar_feed_token}`,
    prefs: {
      shoots: profile.calendar_sync_shoots,
      deliveries: profile.calendar_sync_deliveries,
      meetings: profile.calendar_sync_meetings,
      tasks: profile.calendar_sync_tasks,
    },
  }
}

export async function updateCalendarSyncPreferences(prefs: CalendarSyncPreferences): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Ikke innlogget' }

  const { error } = await supabase
    .from('profiles')
    .update({
      calendar_sync_shoots: prefs.shoots,
      calendar_sync_deliveries: prefs.deliveries,
      calendar_sync_meetings: prefs.meetings,
      calendar_sync_tasks: prefs.tasks,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) return { error: error.message }
  return {}
}

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
          project:projects ( id, title, pipeline_stage, customers(name) )
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
      project: { id: string; title: string; pipeline_stage: string; customers?: { name: string | null } | null } | null
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
    // Enkeltdags opptak: bruker fyller ofte kun ut startdato. Uten fallback
    // blir shoot_end NULL, og alt som regner ut post-prod-frister fra
    // shoot_end (f.eks. suggestDueDates i PostProdBoard) mister opptaksdatoen.
    await supabase
      .from('projects')
      .update({
        shoot_start: shootStart || null,
        shoot_end: shootEnd || shootStart || null,
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
