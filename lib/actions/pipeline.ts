'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { notifyAssignment } from '@/lib/notify-assignment'
import Anthropic from '@anthropic-ai/sdk'
import type { PipelineStage, ProjectType, Task, TaskMessage, ProjectWithPipeline, Quote, PipelineData, SectionContent, AssigneeJoin, TaskRow, ProjectRow } from '@/lib/types'
import { PIPELINE_STAGES } from '@/lib/types'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
type CustomerJoin = { id?: string; name: string | null; email?: string | null; company: string | null } | null
type TaskTemplateRow = { title: string; description: string | null; sort_order: number }

/**
 * Henter alle prosjekter med pipeline_stage og customer-info,
 * sortert etter updated_at DESC.
 */
export async function getProjectsForPipeline(): Promise<ProjectWithPipeline[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        customers (
          id,
          name,
          company
        )
      `)
      .neq('status', 'lost')
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('getProjectsForPipeline error:', error)
      return []
    }

    return (data ?? []).map((row: ProjectRow) => ({
      ...row,
      customer: row.customers ?? null,
      customers: undefined,
    })) as ProjectWithPipeline[]
  } catch (err) {
    console.error('getProjectsForPipeline unexpected error:', err)
    return []
  }
}

/**
 * Oppdaterer pipeline_stage på et prosjekt og seeder oppgaver
 * fra task_templates for det nye steget.
 */
export async function updatePipelineStage(
  projectId: string,
  stage: PipelineStage
): Promise<void> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('projects')
      .update({ pipeline_stage: stage, updated_at: new Date().toISOString() })
      .eq('id', projectId)

    if (error) {
      console.error('updatePipelineStage error:', error)
      return
    }

    await seedTasksFromTemplates(projectId, stage)

    revalidatePath('/admin/pipeline')
    revalidatePath('/admin/projects')
  } catch (err) {
    console.error('updatePipelineStage unexpected error:', err)
  }
}

/**
 * Henter tasks for et prosjekt. Filtrerer på stage hvis oppgitt.
 * Inkluderer assignee-info fra profiles-tabellen.
 */
export async function getTasksForProject(
  projectId: string,
  stage?: PipelineStage
): Promise<Task[]> {
  try {
    const supabase = await createClient()

    let query = supabase
      .from('tasks')
      .select(`
        *,
        task_assignees (
          profile:profiles ( id, name, email )
        )
      `)
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })

    if (stage) {
      query = query.eq('pipeline_stage', stage)
    }

    const { data, error } = await query

    if (error) {
      console.error('getTasksForProject error:', error)
      return []
    }

    return (data ?? []).map((row: TaskRow) => ({
      ...row,
      assignees: (row.task_assignees ?? [])
        .map((ta) => ta.profile)
        .filter(Boolean),
    })) as Task[]
  } catch (err) {
    console.error('getTasksForProject unexpected error:', err)
    return []
  }
}

/**
 * Henter prosjektets nåværende pipeline-steg + oppgavene for det steget.
 * Brukes av oppgavepanelet på lead-sidene.
 */
export async function getProjectStageTasks(projectId: string): Promise<{
  stage: PipelineStage
  tasks: Task[]
} | null> {
  try {
    const supabase = await createClient()
    const { data: proj, error } = await supabase
      .from('projects')
      .select('pipeline_stage')
      .eq('id', projectId)
      .single()

    if (error || !proj) {
      console.error('getProjectStageTasks error:', error)
      return null
    }

    const stage = proj.pipeline_stage as PipelineStage
    const tasks = await getTasksForProject(projectId, stage)
    return { stage, tasks }
  } catch (err) {
    console.error('getProjectStageTasks unexpected error:', err)
    return null
  }
}

/**
 * Sjekker om det allerede finnes tasks for project + stage.
 * Hvis ikke, henter task_templates for steget og oppretter tasks basert på dem.
 *
 * For post_prod-steget: henter project_type fra prosjektet og bruker det
 * til å filtrere templates. Hvis project_type ikke er satt, seedes det ikke —
 * UI må spørre brukeren om type først.
 */
export async function seedTasksFromTemplates(
  projectId: string,
  stage: PipelineStage
): Promise<void> {
  try {
    const supabase = await createClient()

    // Hent eksisterende oppgavetitler for dette steget for å unngå duplikater
    const { data: existingTasks, error: countError } = await supabase
      .from('tasks')
      .select('title')
      .eq('project_id', projectId)
      .eq('pipeline_stage', stage)

    if (countError) {
      console.error('seedTasksFromTemplates count error:', countError)
      return
    }

    const existingTitles = new Set((existingTasks ?? []).map((t: { title: string }) => t.title))

    // For post_prod: hent project_type først
    let projectType: string | null = null
    if (stage === 'post_prod') {
      const { data: proj } = await supabase
        .from('projects')
        .select('project_type')
        .eq('id', projectId)
        .single()
      projectType = proj?.project_type ?? null

      // Hvis project_type ikke er satt: seed ikke — UI vil spørre brukeren
      if (!projectType) return
    }

    // Mixed: seed to uavhengige flyter (video + foto)
    if (stage === 'post_prod' && projectType === 'mixed') {
      await seedMixedPostProdTasks(supabase, projectId)
      return
    }

    // Bygg query for templates
    let query = supabase
      .from('task_templates')
      .select('*')
      .eq('pipeline_stage', stage)
      .order('sort_order', { ascending: true })

    if (stage === 'post_prod' && projectType) {
      query = query.eq('project_type', projectType)
    } else {
      query = query.is('project_type', null)
    }

    const { data: templates, error: templatesError } = await query

    if (templatesError) {
      console.error('seedTasksFromTemplates templates error:', templatesError)
      return
    }

    if (!templates || templates.length === 0) {
      return
    }

    // Opprett kun templates som ikke allerede finnes (tittel-match)
    const tasksToInsert = templates
      .filter((t: TaskTemplateRow) => !existingTitles.has(t.title))
      .map((t: TaskTemplateRow) => ({
        project_id: projectId,
        pipeline_stage: stage,
        title: t.title,
        description: t.description ?? null,
        status: 'todo' as const,
        sort_order: t.sort_order,
        sub_type: null,
        due_date: null,
        priority: null,
        created_by: null,
      }))

    if (tasksToInsert.length === 0) return

    const { error: insertError } = await supabase
      .from('tasks')
      .insert(tasksToInsert)

    if (insertError) {
      console.error('seedTasksFromTemplates insert error:', insertError)
    }
  } catch (err) {
    console.error('seedTasksFromTemplates unexpected error:', err)
  }
}

/**
 * Seeder to uavhengige post_prod-flyter for mixed-prosjekter:
 * én for video (sub_type='video') og én for foto (sub_type='photo').
 */
async function seedMixedPostProdTasks(
  supabase: SupabaseServerClient,
  projectId: string,
): Promise<void> {
  // Bygg et sett av "sub_type:title" for eksisterende oppgaver for å unngå duplikater
  const { data: existing } = await supabase
    .from('tasks')
    .select('title, sub_type')
    .eq('project_id', projectId)
    .eq('pipeline_stage', 'post_prod')

  const existingKeys = new Set(
    (existing ?? []).map((t: { title: string; sub_type: string | null }) => `${t.sub_type}:${t.title}`)
  )

  const [{ data: videoTemplates }, { data: photoTemplates }] = await Promise.all([
    supabase
      .from('task_templates')
      .select('*')
      .eq('pipeline_stage', 'post_prod')
      .eq('project_type', 'video')
      .order('sort_order', { ascending: true }),
    supabase
      .from('task_templates')
      .select('*')
      .eq('pipeline_stage', 'post_prod')
      .eq('project_type', 'photo')
      .order('sort_order', { ascending: true }),
  ])

  const toInsert = [
    ...(videoTemplates ?? [])
      .filter((t: TaskTemplateRow) => !existingKeys.has(`video:${t.title}`))
      .map((t: TaskTemplateRow) => ({
        project_id: projectId,
        pipeline_stage: 'post_prod',
        title: t.title,
        description: t.description ?? null,
        status: 'todo' as const,
        sort_order: t.sort_order,
        sub_type: 'video',
        due_date: null,
        priority: null,
        created_by: null,
      })),
    ...(photoTemplates ?? [])
      .filter((t: TaskTemplateRow) => !existingKeys.has(`photo:${t.title}`))
      .map((t: TaskTemplateRow) => ({
        project_id: projectId,
        pipeline_stage: 'post_prod',
        title: t.title,
        description: t.description ?? null,
        status: 'todo' as const,
        sort_order: t.sort_order,
        sub_type: 'photo',
        due_date: null,
        priority: null,
        created_by: null,
      })),
  ]

  if (toInsert.length > 0) {
    const { error } = await supabase.from('tasks').insert(toInsert)
    if (error) console.error('seedMixedPostProdTasks insert error:', error)
  }
}

/**
 * Setter project_type på et prosjekt og seeder post_prod-oppgaver
 * fra task_templates basert på den valgte typen.
 */
export async function setProjectType(
  projectId: string,
  projectType: ProjectType
): Promise<void> {
  try {
    const supabase = await createClient()

    const { error } = await supabase
      .from('projects')
      .update({ project_type: projectType, updated_at: new Date().toISOString() })
      .eq('id', projectId)

    if (error) {
      console.error('setProjectType error:', error)
      return
    }

    await seedTasksFromTemplates(projectId, 'post_prod')

    revalidatePath('/admin/pipeline')
  } catch (err) {
    console.error('setProjectType unexpected error:', err)
  }
}

/**
 * Oppdaterer status på en task. Hvis alle post_prod-tasks er ferdige,
 * flyttes prosjektet automatisk til levering-steget.
 */
export async function updateTaskStatus(
  taskId: string,
  status: 'todo' | 'in_progress' | 'done'
): Promise<void> {
  try {
    const supabase = await createClient()

    // Hent task-info før oppdatering
    const { data: task } = await supabase
      .from('tasks')
      .select('project_id, pipeline_stage')
      .eq('id', taskId)
      .single()

    const { error } = await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', taskId)

    if (error) {
      console.error('updateTaskStatus error:', error)
      return
    }

    // Auto-advance: når alle tasks i current stage er ferdige → flytt til neste stage
    if (status === 'done' && task) {
      const stage = task.pipeline_stage as PipelineStage
      const stageOrder = PIPELINE_STAGES.map(s => s.value)
      const currentIdx = stageOrder.indexOf(stage)
      const nextStage = currentIdx >= 0 && currentIdx < stageOrder.length - 1
        ? stageOrder[currentIdx + 1]
        : null

      if (nextStage) {
        // Bekreft at prosjektet fortsatt er i denne stage (ikke allerede fremflyttet)
        const { data: proj } = await supabase
          .from('projects')
          .select('pipeline_stage')
          .eq('id', task.project_id)
          .single()

        if (proj?.pipeline_stage === stage) {
          const [{ count: total }, { count: done }] = await Promise.all([
            supabase
              .from('tasks')
              .select('id', { count: 'exact', head: true })
              .eq('project_id', task.project_id)
              .eq('pipeline_stage', stage),
            supabase
              .from('tasks')
              .select('id', { count: 'exact', head: true })
              .eq('project_id', task.project_id)
              .eq('pipeline_stage', stage)
              .eq('status', 'done'),
          ])

          if (total && done && total === done) {
            await updatePipelineStage(task.project_id, nextStage as PipelineStage)
          }
        }
      }
    }

    revalidatePath('/admin/pipeline')
    revalidatePath('/admin/projects')
    revalidatePath('/admin/postprod')
  } catch (err) {
    console.error('updateTaskStatus unexpected error:', err)
  }
}

/**
 * Sletter alle post_prod-tasks for et prosjekt og re-seeder fra gjeldende maler.
 * Returnerer antall tasks som ble opprettet, eller feilmelding.
 */
export async function reseedPostProdTasks(
  projectId: string
): Promise<{ count: number; error?: string }> {
  try {
    const supabase = await createClient()

    // Hent project_type
    const { data: proj, error: projError } = await supabase
      .from('projects')
      .select('project_type')
      .eq('id', projectId)
      .single()

    if (projError || !proj) {
      return { count: 0, error: 'Fant ikke prosjektet' }
    }

    if (!proj.project_type) {
      return { count: 0, error: 'Innholdstype ikke satt på prosjektet' }
    }

    // Slett eksisterende tasks
    const { error: deleteError } = await supabase
      .from('tasks')
      .delete()
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'post_prod')

    if (deleteError) {
      console.error('reseedPostProdTasks delete error:', deleteError)
      return { count: 0, error: 'Kunne ikke slette gamle oppgaver' }
    }

    // Mixed: seed to uavhengige flyter
    if (proj.project_type === 'mixed') {
      await seedMixedPostProdTasks(supabase, projectId)
      revalidatePath('/admin/postprod')
      return { count: -1 } // antall beregnes av to flyter, returnerer bare ok
    }

    // Hent maler
    const { data: templates, error: templatesError } = await supabase
      .from('task_templates')
      .select('*')
      .eq('pipeline_stage', 'post_prod')
      .eq('project_type', proj.project_type)
      .order('sort_order', { ascending: true })

    if (templatesError) {
      console.error('reseedPostProdTasks templates error:', templatesError)
      return { count: 0, error: 'Kunne ikke hente maler' }
    }

    if (!templates || templates.length === 0) {
      return { count: 0, error: `Ingen maler funnet for type "${proj.project_type}"` }
    }

    // Opprett tasks
    const tasksToInsert = templates.map((t: TaskTemplateRow) => ({
      project_id: projectId,
      pipeline_stage: 'post_prod',
      title: t.title,
      description: t.description ?? null,
      status: 'todo' as const,
      sort_order: t.sort_order,
      sub_type: null,
      due_date: null,
      priority: null,
      created_by: null,
    }))

    const { error: insertError } = await supabase
      .from('tasks')
      .insert(tasksToInsert)

    if (insertError) {
      console.error('reseedPostProdTasks insert error:', insertError)
      return { count: 0, error: 'Kunne ikke opprette oppgaver' }
    }

    revalidatePath('/admin/postprod')
    return { count: tasksToInsert.length }
  } catch (err) {
    console.error('reseedPostProdTasks error:', err)
    return { count: 0, error: 'Uventet feil' }
  }
}

/**
 * Henter alle prosjekter i post_prod-steget med task-fremdrift.
 */
export async function getPostProdProjects(): Promise<(ProjectWithPipeline & { task_count: number; done_count: number })[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('projects')
      .select(`*, customers(id, name, company)`)
      .eq('pipeline_stage', 'post_prod')
      .neq('status', 'lost')
      .order('updated_at', { ascending: false })

    if (error || !data || data.length === 0) return []

    const ids = data.map((p: { id: string }) => p.id)

    const { data: tasks } = await supabase
      .from('tasks')
      .select('project_id, status')
      .in('project_id', ids)
      .eq('pipeline_stage', 'post_prod')

    const taskMap: Record<string, { total: number; done: number }> = {}
    for (const t of tasks ?? []) {
      if (!taskMap[t.project_id]) taskMap[t.project_id] = { total: 0, done: 0 }
      taskMap[t.project_id].total++
      if (t.status === 'done') taskMap[t.project_id].done++
    }

    return data.map((row: ProjectRow) => ({
      ...row,
      customer: row.customers ?? null,
      customers: undefined,
      task_count: taskMap[row.id]?.total ?? 0,
      done_count: taskMap[row.id]?.done ?? 0,
    })) as (ProjectWithPipeline & { task_count: number; done_count: number })[]
  } catch (err) {
    console.error('getPostProdProjects error:', err)
    return []
  }
}

/**
 * Oppretter en ny task. sort_order settes til max(sort_order) + 1
 * for samme project + stage.
 */
export async function createTask(data: {
  project_id: string
  pipeline_stage: PipelineStage
  title: string
  description?: string
  due_date?: string
  priority?: 'low' | 'medium' | 'high'
}): Promise<Task | null> {
  try {
    const supabase = await createClient()

    const { data: existing, error: maxError } = await supabase
      .from('tasks')
      .select('sort_order')
      .eq('project_id', data.project_id)
      .eq('pipeline_stage', data.pipeline_stage)
      .order('sort_order', { ascending: false })
      .limit(1)

    if (maxError) {
      console.error('createTask maxError:', maxError)
      return null
    }

    const maxSortOrder = existing && existing.length > 0 ? existing[0].sort_order : 0
    const nextSortOrder = maxSortOrder + 1

    const { data: created, error } = await supabase
      .from('tasks')
      .insert({
        project_id: data.project_id,
        pipeline_stage: data.pipeline_stage,
        title: data.title,
        description: data.description ?? null,
        due_date: data.due_date ?? null,
        priority: data.priority ?? null,
        status: 'todo' as const,
        sort_order: nextSortOrder,
        created_by: null,
      })
      .select('*')
      .single()

    if (error) {
      console.error('createTask error:', error)
      return null
    }

    revalidatePath('/admin/pipeline')
    revalidatePath('/admin/projects')

    return { ...created, assignees: [] } as Task
  } catch (err) {
    console.error('createTask unexpected error:', err)
    return null
  }
}

/**
 * Henter komplett prosjekt-data for hub-siden:
 * prosjektinfo + customer, tasks for current pipeline_stage,
 * siste quote, og pitch-token fra project_shares.
 */
export async function getProjectHub(projectId: string): Promise<{
  project: ProjectWithPipeline
  tasks: Task[]
  quote: Quote | null
  pitchToken: string | null
  hasSections: boolean
} | null> {
  try {
    const supabase = await createClient()

    // Hent prosjekt med customer
    const { data: projectRow, error: projectError } = await supabase
      .from('projects')
      .select(`
        *,
        customers (
          id,
          name,
          company
        )
      `)
      .eq('id', projectId)
      .single()

    if (projectError || !projectRow) {
      console.error('getProjectHub project error:', projectError)
      return null
    }

    const project: ProjectWithPipeline = {
      ...projectRow,
      customer: projectRow.customers ?? null,
      customers: undefined,
    } as ProjectWithPipeline

    // Hent tasks for current pipeline_stage (eller alle hvis stage mangler)
    const tasks = project.pipeline_stage
      ? await getTasksForProject(projectId, project.pipeline_stage)
      : await getTasksForProject(projectId)

    // Hent siste quote for prosjektet
    const { data: quoteRow, error: quoteError } = await supabase
      .from('quotes')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (quoteError) {
      console.error('getProjectHub quote error:', quoteError)
    }

    // Hent pitch-token fra project_shares
    const { data: shareRow, error: shareError } = await supabase
      .from('project_shares')
      .select('token')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (shareError) {
      console.error('getProjectHub share error:', shareError)
    }

    const { count: sectionCount } = await supabase
      .from('sections')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)

    return {
      project,
      tasks,
      quote: (quoteRow as Quote) ?? null,
      pitchToken: shareRow?.token ?? null,
      hasSections: (sectionCount ?? 0) > 0,
    }
  } catch (err) {
    console.error('getProjectHub unexpected error:', err)
    return null
  }
}

export async function saveProjectMeetingNotes(projectId: string, notes: string): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('projects')
      .update({ meeting_notes: notes || null, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    revalidatePath(`/admin/projects/${projectId}`)
  } catch (err) {
    console.error('saveProjectMeetingNotes error:', err)
  }
}

export async function analyzeProjectNotes(
  projectId: string,
  notes: string,
  projectTitle: string
): Promise<Record<string, unknown> | null> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return null
    const supabase = await createClient()
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: 'Du er en assistent for et norsk film- og fotoproduksjonsselskap. Analyser e-posttråder og møtenotater og trekk ut nøkkelinformasjon om prosjektet. Svar alltid med gyldig JSON.',
      messages: [{
        role: 'user',
        content: `Prosjekt: "${projectTitle}"\n\nE-posttråd / møtenotater:\n${notes}\n\nTrekk ut følgende og svar med JSON:\n{\n  "beskrivelse": "Kort sammendrag av hva prosjektet går ut på (2-3 setninger)",\n  "krav": ["Nøkkelkrav eller ønsker fra kunden (liste)"],\n  "budsjett": "Eventuell budsjettantydning, eller null",\n  "tidslinje": "Eventuell tidslinje eller deadline, eller null",\n  "kontaktperson": "Navn på kontaktperson hos kunden, eller null",\n  "notater": ["Andre viktige punkter som bør huskes"]\n}`
      }]
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const summary = JSON.parse(jsonMatch[0])

    await supabase
      .from('projects')
      .update({ meeting_notes: notes, meeting_summary: summary, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    revalidatePath(`/admin/projects/${projectId}`)
    return summary
  } catch (err) {
    console.error('analyzeProjectNotes error:', err)
    return null
  }
}

/**
 * Lagrer møtelink i pipeline_data, genererer e-postutkast med Claude,
 * sender via Resend og oppdaterer meeting_link_sent_at.
 */
export async function sendMeetingLink(
  projectId: string,
  meetingLink: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Steg 1: Hent prosjektinfo med customer
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*, customers(name, email, company)')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      console.error('sendMeetingLink project error:', projectError)
      return { success: false, error: 'Fant ikke prosjektet' }
    }

    const customer = project.customers ?? null
    const customerEmail: string | null = customer?.email ?? null
    const customerName: string = customer?.name ?? 'Kunde'
    const customerCompany: string = customer?.company ?? ''

    if (!customerEmail) {
      console.warn(`sendMeetingLink: kunde mangler e-post for prosjekt ${projectId}`)
    }

    // Steg 2: Generer e-postutkast med Claude
    let generatedEmail = `Hei ${customerName},\n\nTakk for din interesse i Leafilms!\n\nVi ønsker å invitere deg til et møte. Du kan booke en tid her: ${meetingLink}\n\nGleder oss til å høre fra deg!\n\nMed vennlig hilsen,\nLeafilms-teamet`

    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('sendMeetingLink: ANTHROPIC_API_KEY mangler — bruker standard e-posttekst')
    } else {
      try {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

        const prompt = `Du skriver en profesjonell møteinvitasjon på norsk for Leafilms (filmproduksjon).
Prosjekt: ${project.title}
Kunde: ${customerName}${customerCompany ? ` hos ${customerCompany}` : ''}
Møtelink: ${meetingLink}

Skriv en kort, vennlig e-post (maks 80 ord) som:
- Takker for interessen
- Inviterer til møte
- Inkluderer møtelinken tydelig
- Signerer med "Leafilms-teamet"

Returner KUN e-postteksten, ingen subject-linje.`

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        })

        const textBlock = response.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
        if (textBlock && textBlock.type === 'text') {
          generatedEmail = textBlock.text.trim()
        }
      } catch (aiErr) {
        console.error('sendMeetingLink AI-generering feilet — bruker standard tekst:', aiErr)
      }
    }

    // Steg 3: Send via Resend
    if (!process.env.RESEND_API_KEY) {
      console.warn('sendMeetingLink: RESEND_API_KEY mangler — hopper over e-postsending')
    } else if (!customerEmail) {
      console.warn('sendMeetingLink: ingen kundes e-post — hopper over e-postsending')
    } else {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Leafilms <post@leafilms.no>',
          to: [customerEmail],
          subject: `Møteinvitasjon — ${project.title}`,
          text: generatedEmail,
        }),
      })

      if (!res.ok) {
        const resBody = await res.text()
        console.error('sendMeetingLink Resend feil:', res.status, resBody)
        // Ikke returner feil her — vi lagrer likevel meeting_link i pipeline_data
      }
    }

    // Steg 4: Oppdater pipeline_data med meeting_link og sent_at
    const existingPipelineData = (project.pipeline_data as PipelineData) ?? {}

    const { error: updateError } = await supabase
      .from('projects')
      .update({
        pipeline_data: {
          ...existingPipelineData,
          meeting_link: meetingLink,
          meeting_link_sent_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    if (updateError) {
      console.error('sendMeetingLink update error:', updateError)
      return { success: false, error: 'Kunne ikke lagre møtelink' }
    }

    revalidatePath('/admin/pipeline')

    return { success: true }
  } catch (err) {
    console.error('sendMeetingLink unexpected error:', err)
    return { success: false, error: 'Uventet feil — se server-logger' }
  }
}

/**
 * Tilbakestiller en task (og alle med høyere sort_order) til 'todo',
 * slik at man kan gå tilbake og gjøre om arbeidet.
 */
export async function resetTaskAndSubsequent(
  projectId: string,
  taskId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('sort_order, sub_type')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      return { ok: false, error: 'Fant ikke oppgaven' }
    }

    let query = supabase
      .from('tasks')
      .update({ status: 'todo', updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'post_prod')
      .gte('sort_order', task.sort_order)

    query = task.sub_type
      ? query.eq('sub_type', task.sub_type)
      : query.is('sub_type', null)

    const { error } = await query

    if (error) {
      console.error('resetTaskAndSubsequent error:', error)
      return { ok: false, error: 'Kunne ikke tilbakestille oppgave' }
    }

    revalidatePath('/admin/postprod')
    return { ok: true }
  } catch (err) {
    console.error('resetTaskAndSubsequent unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

/**
 * Håndterer "Ikke godkjent" på Venter-tasken:
 * lagrer begrunnelsesnotat og tilbakestiller alt fra sort_order 2
 * (klipping/redigering) opp til og med Venter-tasken til 'todo'.
 */
export async function rejectFeedbackAndReset(
  projectId: string,
  venterTaskId: string,
  rejectionNote: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: venterTask, error: venterError } = await supabase
      .from('tasks')
      .select('sort_order, sub_type')
      .eq('id', venterTaskId)
      .single()

    if (venterError || !venterTask) {
      return { ok: false, error: 'Fant ikke oppgaven' }
    }

    // Lagre begrunnelsesnotatet på Venter-tasken
    await supabase
      .from('tasks')
      .update({ notes: rejectionNote, updated_at: new Date().toISOString() })
      .eq('id', venterTaskId)

    // Tilbakestill alt fra sort_order 2 og frem til og med Venter til 'todo'
    // Filtrerer på sub_type slik at kun riktig flyt nullstilles i mixed-prosjekter
    let resetQuery = supabase
      .from('tasks')
      .update({ status: 'todo', updated_at: new Date().toISOString() })
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'post_prod')
      .gt('sort_order', 1)
      .lte('sort_order', venterTask.sort_order)

    resetQuery = venterTask.sub_type
      ? resetQuery.eq('sub_type', venterTask.sub_type)
      : resetQuery.is('sub_type', null)

    const { error: resetError } = await resetQuery

    if (resetError) {
      console.error('rejectFeedbackAndReset reset error:', resetError)
      return { ok: false, error: 'Kunne ikke tilbakestille oppgaver' }
    }

    revalidatePath('/admin/postprod')
    return { ok: true }
  } catch (err) {
    console.error('rejectFeedbackAndReset unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

/**
 * Henter alle chat-meldinger for en task, sortert etter created_at.
 */
export async function getTaskMessages(taskId: string): Promise<TaskMessage[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('task_messages')
      .select(`
        *,
        user:profiles!task_messages_user_id_fkey(id, name, email)
      `)
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('getTaskMessages error:', error)
      return []
    }

    return (data ?? []) as TaskMessage[]
  } catch (err) {
    console.error('getTaskMessages unexpected error:', err)
    return []
  }
}

/**
 * Sender en chat-melding på en task som innlogget bruker.
 */
export async function sendTaskMessage(
  taskId: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { ok: false, error: 'Ikke autentisert' }

    const { error } = await supabase
      .from('task_messages')
      .insert({ task_id: taskId, user_id: user.id, message: message.trim() })

    if (error) {
      console.error('sendTaskMessage error:', error)
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (err) {
    console.error('sendTaskMessage unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

/**
 * Oppdaterer task_data JSONB-feltet på en task (linkdata per steg).
 */
export async function updateTaskData(
  taskId: string,
  data: Record<string, string>
): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('tasks')
      .update({ task_data: data, updated_at: new Date().toISOString() })
      .eq('id', taskId)

    if (error) {
      console.error('updateTaskData error:', error)
    }
  } catch (err) {
    console.error('updateTaskData unexpected error:', err)
  }
}

/**
 * Oppdaterer notatfeltet på en task.
 */
export async function updateTaskNotes(taskId: string, notes: string): Promise<void> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('tasks')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', taskId)

    if (error) {
      console.error('updateTaskNotes error:', error)
    }
  } catch (err) {
    console.error('updateTaskNotes unexpected error:', err)
  }
}

/**
 * Returnerer alle brukerprofiler i systemet — brukes til assignee-picker.
 */
export async function getAllProfiles(): Promise<{ id: string; name: string | null; email: string }[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .order('name', { ascending: true })

    if (error) {
      console.error('getAllProfiles error:', error)
      return []
    }
    return data ?? []
  } catch {
    return []
  }
}

/**
 * Legger til eller fjerner en bruker fra task_assignees (toggle).
 * Returnerer om brukeren nå er tildelt (true) eller fjernet (false).
 */
export async function toggleTaskAssignee(taskId: string, profileId: string): Promise<boolean> {
  try {
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('task_assignees')
      .select('profile_id')
      .eq('task_id', taskId)
      .eq('profile_id', profileId)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('task_assignees')
        .delete()
        .eq('task_id', taskId)
        .eq('profile_id', profileId)
      return false
    } else {
      await supabase
        .from('task_assignees')
        .insert({ task_id: taskId, profile_id: profileId })

      const { data: taskInfo } = await supabase
        .from('tasks')
        .select('title, project_id, project:projects ( title )')
        .eq('id', taskId)
        .single()

      if (taskInfo) {
        const projectTitle = (taskInfo.project as unknown as { title: string } | null)?.title
        await notifyAssignment({
          recipientId: profileId,
          type: 'task_assigned',
          projectId: taskInfo.project_id,
          taskId,
          preview: projectTitle ? `${taskInfo.title} — ${projectTitle}` : taskInfo.title,
        })
      }
      return true
    }
  } catch (err) {
    console.error('toggleTaskAssignee unexpected error:', err)
    return false
  }
}

/**
 * Henter alle tasks tildelt innlogget bruker via task_assignees.
 * Inkluderer prosjekt- og kundeinfo.
 */
export async function getMyTasks(): Promise<(Task & {
  project: { id: string; title: string; pipeline_stage: string; customer: { name: string; company: string | null } | null }
})[]> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('task_assignees')
      .select(`
        task:tasks (
          *,
          task_assignees (
            profile:profiles ( id, name, email )
          ),
          project:projects (
            id, title, pipeline_stage,
            customer:customers ( name, company )
          )
        )
      `)
      .eq('profile_id', user.id)

    if (error) {
      console.error('getMyTasks error:', error)
      return []
    }

    return ((data ?? []) as unknown as { task: (TaskRow & { project?: unknown }) | null }[])
      .map((row) => {
        const t = row.task
        if (!t) return null
        return {
          ...t,
          assignees: (t.task_assignees ?? [])
            .map((ta) => ta.profile)
            .filter(Boolean),
          project: t.project ?? null,
        }
      })
      .filter(Boolean) as (Task & {
        project: { id: string; title: string; pipeline_stage: string; customer: { name: string; company: string | null } | null }
      })[]
  } catch (err) {
    console.error('getMyTasks unexpected error:', err)
    return []
  }
}

/**
 * Returnerer profil for innlogget bruker.
 */
export async function getCurrentUserProfile(): Promise<{
  id: string
  name: string | null
  email: string
} | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, email')
      .eq('id', user.id)
      .single()

    return profile ?? { id: user.id, name: null, email: user.email ?? '' }
  } catch {
    return null
  }
}

/**
 * Genererer et e-postutkast med Claude basert på prosjektinfo og e-posttype.
 * Returnerer alltid { subject, body } — kræsjer aldri.
 */
export async function generateEmailDraft(
  projectId: string,
  type: 'meeting' | 'pitch' | 'follow_up' | 'general',
  extraContext?: string
): Promise<{ subject: string; body: string }> {
  const supabase = await createClient()

  // Hent prosjekt med customer
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('title, pipeline_stage, pipeline_data, customers(id, name, company)')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    console.error('generateEmailDraft project error:', projectError)
    return { subject: `Angående prosjekt`, body: '' }
  }

  const customer = (project as unknown as { customers?: CustomerJoin }).customers ?? null
  const customerName: string = customer?.name ?? 'Kunde'
  const customerCompany: string = customer?.company ?? ''
  const pipelineData = (project.pipeline_data as PipelineData) ?? {}

  const fallbackSubjects = {
    meeting: `Møteinvitasjon — ${project.title}`,
    pitch: `Prosjektbeskrivelse og tilbud — ${project.title}`,
    follow_up: `Oppfølging — ${project.title}`,
    general: `Angående ${project.title}`,
  }

  const prompts: Record<typeof type, string> = {
    meeting: `Generer en profesjonell møteinvitasjon på norsk for Leafilms (filmproduksjon).
Prosjekt: ${project.title}
Kunde: ${customerName}${customerCompany ? ` hos ${customerCompany}` : ''}
Møtelink: ${pipelineData.meeting_link ?? '[LIMES INN AV AVSENDER]'}${extraContext ? `\nEkstra kontekst: ${extraContext}` : ''}

Returner JSON: { "subject": "...", "body": "..." }
Body: vennlig, maks 80 ord, inkluder møtelink, signer med "Leafilms-teamet"`,

    pitch: `Generer en e-post som sender en prosjektbeskrivelse og tilbud til kunden.
Prosjekt: ${project.title}
Kunde: ${customerName}${customerCompany ? ` hos ${customerCompany}` : ''}${extraContext ? `\nEkstra kontekst: ${extraContext}` : ''}

Returner JSON: { "subject": "...", "body": "..." }
Body: profesjonell og entusiastisk, maks 100 ord, nevn at de finner beskrivelse og pris i lenken, signer med "Leafilms-teamet"`,

    follow_up: `Generer en oppfølgingsmail for videresalg til eksisterende kunde.
Prosjekt vi leverte: ${project.title}
Kunde: ${customerName}${customerCompany ? ` hos ${customerCompany}` : ''}${extraContext ? `\nEkstra kontekst: ${extraContext}` : ''}

Returner JSON: { "subject": "...", "body": "..." }
Body: varm og personlig, maks 80 ord, spør om de har nye prosjekter, signer med "Leafilms-teamet"`,

    general: `Generer en generell profesjonell e-post til kunde.
Prosjekt: ${project.title}
Kunde: ${customerName}${customerCompany ? ` hos ${customerCompany}` : ''}${extraContext ? `\nEkstra kontekst: ${extraContext}` : ''}

Returner JSON: { "subject": "...", "body": "..." }`,
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('generateEmailDraft: ANTHROPIC_API_KEY mangler — returnerer fallback')
    return { subject: fallbackSubjects[type], body: '' }
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompts[type] }],
    })

    const textBlock = response.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      console.warn('generateEmailDraft: tomt svar fra Claude — returnerer fallback')
      return { subject: fallbackSubjects[type], body: '' }
    }

    // Forsøk å parse JSON fra responsen
    const raw = textBlock.text.trim()
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      console.warn('generateEmailDraft: fant ikke JSON i Claude-svar — returnerer fallback')
      return { subject: fallbackSubjects[type], body: raw }
    }

    const parsed = JSON.parse(jsonMatch[0]) as { subject?: string; body?: string }
    return {
      subject: parsed.subject ?? fallbackSubjects[type],
      body: parsed.body ?? '',
    }
  } catch (err) {
    console.error('generateEmailDraft AI-kall feilet — returnerer fallback:', err)
    return { subject: fallbackSubjects[type], body: '' }
  }
}

/**
 * Oppdaterer leveringsbeskrivelse og antall post-prod-dager på et prosjekt.
 */
export async function updateProjectDeliveryInfo(
  projectId: string,
  deliveryDescription: string | null,
  postProdDays: number | null
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('projects')
      .update({
        ...(deliveryDescription !== undefined && { delivery_description: deliveryDescription }),
        ...(postProdDays !== undefined && { post_prod_days: postProdDays }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
    revalidatePath('/admin/postprod')
  } catch (err) {
    console.error('updateProjectDeliveryInfo unexpected error:', err)
  }
}

export async function updatePostProdDelivery(
  projectId: string,
  deliveryVideo: string | null,
  deliveryPhoto: string | null
): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('projects')
      .update({
        delivery_video: deliveryVideo ?? null,
        delivery_photo: deliveryPhoto ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
    revalidatePath('/admin/postprod')
  } catch (err) {
    console.error('updatePostProdDelivery unexpected error:', err)
  }
}

export async function getProjectDeliverablesSection(projectId: string): Promise<{ items: NonNullable<SectionContent['deliverableItems']> } | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('sections')
      .select('content')
      .eq('project_id', projectId)
      .eq('type', 'deliverables')
      .maybeSingle()
    if (error || !data) return null
    return { items: (data.content as SectionContent | null)?.deliverableItems ?? [] }
  } catch {
    return null
  }
}

export async function updateProjectDeliverablesSection(
  projectId: string,
  items: NonNullable<SectionContent['deliverableItems']>
): Promise<{ error?: string }> {
  try {
    const supabase = await createClient()
    const { data: section, error: fetchError } = await supabase
      .from('sections')
      .select('id, content')
      .eq('project_id', projectId)
      .eq('type', 'deliverables')
      .maybeSingle()
    if (fetchError) return { error: fetchError.message }
    if (!section) {
      const { error: insertError } = await supabase
        .from('sections')
        .insert({ project_id: projectId, type: 'deliverables', content: { deliverableItems: items } })
      if (insertError) return { error: insertError.message }
    } else {
      const { error: updateError } = await supabase
        .from('sections')
        .update({ content: { ...(section.content as object), deliverableItems: items }, updated_at: new Date().toISOString() })
        .eq('id', section.id)
      if (updateError) return { error: updateError.message }
    }
    return {}
  } catch {
    return { error: 'Noe gikk galt' }
  }
}

/**
 * Henter tasks for en liste med prosjekt-IDer i én spørring.
 * Returnerer tasks gruppert per project_id, med assignees.
 */
export async function getTasksForProjects(
  projectIds: string[]
): Promise<Record<string, Task[]>> {
  if (projectIds.length === 0) return {}
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        task_assignees (
          profile:profiles ( id, name, email )
        )
      `)
      .in('project_id', projectIds)
      .order('sort_order', { ascending: true })

    if (error) {
      console.error('getTasksForProjects error:', error)
      return {}
    }

    const grouped: Record<string, Task[]> = {}
    for (const row of data ?? []) {
      const t = {
        ...row,
        assignees: (row.task_assignees ?? [])
          .map((ta: AssigneeJoin) => ta.profile)
          .filter(Boolean),
      } as Task
      if (!grouped[t.project_id]) grouped[t.project_id] = []
      grouped[t.project_id].push(t)
    }
    return grouped
  } catch (err) {
    console.error('getTasksForProjects unexpected error:', err)
    return {}
  }
}

/**
 * Henter alle post_prod-tasks som har minst én tildelt person.
 * Brukes til teamoversikt på postprod-siden.
 */
export async function getPostProdAssignedTasks(): Promise<{
  task: Task
  projectId: string
  projectTitle: string
  customerName: string | null
}[]> {
  try {
    const supabase = await createClient()

    // Hent alle postprod-prosjekter
    const { data: projects } = await supabase
      .from('projects')
      .select('id, title, customers(name)')
      .eq('pipeline_stage', 'post_prod')
      .neq('status', 'lost')

    if (!projects || projects.length === 0) return []

    const projectIds = projects.map((p: { id: string }) => p.id)

    // Hent tasks for disse prosjektene
    const { data: tasks, error: tasksError } = await supabase
      .from('tasks')
      .select(`
        *,
        task_assignees (
          profile:profiles ( id, name, email )
        )
      `)
      .in('project_id', projectIds)
      .eq('pipeline_stage', 'post_prod')
      .order('sort_order', { ascending: true })

    if (tasksError) {
      console.error('getPostProdAssignedTasks tasks error:', tasksError)
      return []
    }

    const projectMap = new Map(
      (projects as unknown as { id: string; title: string; customers?: { name: string | null } | null }[]).map((p) => [p.id, { title: p.title, customerName: p.customers?.name ?? null }])
    )

    return (tasks ?? [])
      .map((row: TaskRow) => {
        const assignees = (row.task_assignees ?? [])
          .map((ta) => ta.profile)
          .filter(Boolean)
        if (assignees.length === 0) return null
        const proj = projectMap.get(row.project_id)
        return {
          task: { ...row, assignees } as Task,
          projectId: row.project_id,
          projectTitle: proj?.title ?? '',
          customerName: proj?.customerName ?? null,
        }
      })
      .filter(Boolean) as {
        task: Task
        projectId: string
        projectTitle: string
        customerName: string | null
      }[]
  } catch (err) {
    console.error('getPostProdAssignedTasks unexpected error:', err)
    return []
  }
}

/**
 * Sender tilbudet til kunden via e-post og flytter prosjektet til 'kontrakt'-steget.
 * Brukes når alle 3 substeg (pitch, tilbud, kontrakt) er klare.
 */
export async function sendTilbudToKunde(
  projectId: string,
  pitchToken: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('title, pipeline_data, customers(id, name, email, company)')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      return { ok: false, error: 'Fant ikke prosjektet' }
    }

    const customer = (project as unknown as { customers?: CustomerJoin }).customers ?? null
    let recipientEmail: string | null = customer?.email?.trim() || null
    let recipientName: string = customer?.name || customer?.company || 'Kunde'
    const existingPipelineData = (project.pipeline_data as PipelineData) ?? {}

    if (!recipientEmail) {
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('name, company, email')
        .eq('converted_to_project_id', projectId)
        .maybeSingle()

      if (leadError) {
        console.error('sendTilbudToKunde lead lookup error:', leadError)
        return { ok: false, error: 'Kunne ikke hente mottaker for tilbudet' }
      }

      recipientEmail = lead?.email?.trim() || null
      recipientName = lead?.name || lead?.company || recipientName
    }

    if (!process.env.RESEND_API_KEY) {
      return { ok: false, error: 'E-posttjenesten er ikke konfigurert' }
    }

    if (!recipientEmail) {
      return { ok: false, error: 'Fant ingen e-postadresse å sende tilbudet til' }
    }

    const pitchUrl = pitchToken
      ? `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.leafilms.no'}/p/${pitchToken}`
      : null

    // Send e-post
    const subject = `Prosjektbeskrivelse og tilbud — ${project.title}`
    const body = pitchUrl
      ? `Hei ${recipientName},\n\nTakk for interessen i Leafilms!\n\nVi har satt sammen en prosjektbeskrivelse og pristilbud til deg. Du finner alt her:\n\n${pitchUrl}\n\nDu kan også lese gjennom og signere produksjonsavtalen direkte på siden.\n\nTa gjerne kontakt hvis du har spørsmål!\n\nMed vennlig hilsen,\nLeafilms-teamet`
      : `Hei ${recipientName},\n\nTakk for interessen i Leafilms!\n\nVi sender deg hermed pristilbud for ${project.title}. Ta kontakt for å diskutere detaljer.\n\nMed vennlig hilsen,\nLeafilms-teamet`

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Leafilms <post@leafilms.no>',
          to: [recipientEmail],
          subject,
          text: body,
        }),
      })
      if (!res.ok) {
        const resBody = await res.text()
        console.error('sendTilbudToKunde Resend feil:', res.status, resBody)
        return { ok: false, error: 'Kunne ikke sende tilbudet på e-post' }
      }
    } catch (emailErr) {
      console.error('sendTilbudToKunde e-post unntak:', emailErr)
      return { ok: false, error: 'Kunne ikke sende tilbudet på e-post' }
    }

    // Flytt til kontrakt-steget
    const { error: updateError } = await supabase
      .from('projects')
      .update({
        pipeline_stage: 'kontrakt',
        pipeline_data: {
          ...existingPipelineData,
          tilbud_sent_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    if (updateError) {
      console.error('sendTilbudToKunde update error:', updateError)
      return { ok: false, error: 'Kunne ikke oppdatere pipeline-steg' }
    }

    revalidatePath('/admin/pipeline')
    revalidatePath(`/admin/projects/${projectId}`)

    return { ok: true }
  } catch (err) {
    console.error('sendTilbudToKunde unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

/**
 * Henter kontrakt-signeringsstatus for et prosjekt.
 * Returnerer om kontrakten er publisert og/eller signert.
 */
export async function getContractStatus(projectId: string): Promise<{
  isPublished: boolean
  isSigned: boolean
  signedAt: string | null
  signerName: string | null
}> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('contracts')
      .select('published_at, status, signed_at, signature_data')
      .eq('project_id', projectId)
      .maybeSingle()

    return {
      isPublished: !!data?.published_at,
      isSigned: data?.status === 'signed',
      signedAt: data?.signed_at ?? null,
      signerName: (data?.signature_data as { signerName?: string } | null)?.signerName ?? null,
    }
  } catch {
    return { isPublished: false, isSigned: false, signedAt: null, signerName: null }
  }
}

/**
 * Manuell fremflytting fra 'kontrakt'-steget uten signert kontrakt.
 * Setter et varsel-flagg i pipeline_data og avanserer til neste steg.
 */
export async function advanceFromKontraktUnsigned(
  projectId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: project } = await supabase
      .from('projects')
      .select('pipeline_data')
      .eq('id', projectId)
      .single()

    const existingPipelineData = (project?.pipeline_data as PipelineData) ?? {}

    const { error } = await supabase
      .from('projects')
      .update({
        pipeline_stage: 'pre_prod',
        pipeline_data: {
          ...existingPipelineData,
          contract_unsigned_proceed: true,
          contract_unsigned_proceed_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    if (error) {
      return { ok: false, error: 'Kunne ikke oppdatere pipeline-steg' }
    }

    await seedTasksFromTemplates(projectId, 'pre_prod')

    revalidatePath('/admin/pipeline')
    revalidatePath(`/admin/projects/${projectId}`)

    return { ok: true }
  } catch (err) {
    console.error('advanceFromKontraktUnsigned unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function setQuoteAssignee(
  projectId: string,
  assigneeId: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('projects')
      .update({ quote_assignee_id: assigneeId, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (error) return { ok: false, error: 'Kunne ikke oppdatere tilbud-ansvarlig' }
    if (assigneeId) {
      const { data: project } = await supabase
        .from('projects')
        .select('title')
        .eq('id', projectId)
        .single()
      await notifyAssignment({
        recipientId: assigneeId,
        type: 'quote_assigned',
        projectId,
        preview: project?.title ?? '',
      })
    }
    revalidatePath('/admin/pipeline')
    revalidatePath(`/admin/projects/${projectId}`)
    return { ok: true }
  } catch (err) {
    console.error('setQuoteAssignee unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function setInvoiceAssignee(
  projectId: string,
  assigneeId: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('projects')
      .update({ invoice_assignee_id: assigneeId, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (error) return { ok: false, error: 'Kunne ikke oppdatere faktura-ansvarlig' }
    if (assigneeId) {
      const { data: project } = await supabase
        .from('projects')
        .select('title')
        .eq('id', projectId)
        .single()
      await notifyAssignment({
        recipientId: assigneeId,
        type: 'invoice_assigned',
        projectId,
        preview: project?.title ?? '',
      })
    }
    revalidatePath('/admin/pipeline')
    revalidatePath(`/admin/faktura/${projectId}`)
    return { ok: true }
  } catch (err) {
    console.error('setInvoiceAssignee unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function assignQuoteAndMove(
  projectId: string,
  assigneeId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('title, pipeline_stage')
      .eq('id', projectId)
      .single()

    if (fetchError || !project) {
      return { ok: false, error: 'Prosjekt ikke funnet' }
    }

    if (!['lead', 'møte'].includes(project.pipeline_stage ?? '')) {
      return { ok: false, error: 'Prosjektet kan ikke flyttes tilbake til Sende tilbud herfra' }
    }

    const { data: updatedProject, error } = await supabase
      .from('projects')
      .update({
        quote_assignee_id: assigneeId,
        pipeline_stage: 'tilbud_sendt',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .in('pipeline_stage', ['lead', 'møte'])
      .select('id')
      .maybeSingle()

    if (error) {
      return { ok: false, error: 'Kunne ikke oppdatere prosjekt' }
    }
    if (!updatedProject) {
      return { ok: false, error: 'Prosjektet kan ikke flyttes tilbake til Sende tilbud herfra' }
    }

    await seedTasksFromTemplates(projectId, 'tilbud_sendt')

    await notifyAssignment({
      recipientId: assigneeId,
      type: 'quote_assigned',
      projectId,
      preview: project.title,
    })

    revalidatePath('/admin/pipeline')
    revalidatePath(`/admin/projects/${projectId}`)

    return { ok: true }
  } catch (err) {
    console.error('assignQuoteAndMove unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
