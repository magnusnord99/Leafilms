'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import { notifyAssignment } from '@/lib/notify-assignment'
import Anthropic from '@anthropic-ai/sdk'
import type { PipelineStage, ProjectType, Task, TaskMessage, ProjectWithPipeline, Quote, PipelineData, SectionContent, AssigneeJoin, TaskRow, ProjectRow, DeliverableItem } from '@/lib/types'
import { PIPELINE_STAGES } from '@/lib/types'
import { computeInsertionOrder, mergeReseededSequence, assignSortOrder, reorderExistingIds, type SequenceRow } from '@/lib/postprod-flow'
import { computeStepperLocks, computeLocksFromSiblings, type StepperTaskLite } from '@/lib/task-lock'
import { pickBestQuote } from '@/lib/quote-builder-utils'

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
  stage: PipelineStage,
  client?: SupabaseServerClient
): Promise<void> {
  try {
    const supabase = client ?? await createClient()

    const { error } = await supabase
      .from('projects')
      .update({ pipeline_stage: stage, updated_at: new Date().toISOString() })
      .eq('id', projectId)

    if (error) {
      console.error('updatePipelineStage error:', error)
      return
    }

    await seedTasksFromTemplates(projectId, stage, supabase)

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
  stage: PipelineStage,
  client?: SupabaseServerClient
): Promise<void> {
  try {
    const supabase = client ?? await createClient()

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

    // Opprett kun templates som ikke allerede finnes — deduper også innen template-listen
    const seenInBatch = new Set<string>()
    const tasksToInsert = templates
      .filter((t: TaskTemplateRow) => {
        if (existingTitles.has(t.title) || seenInBatch.has(t.title)) return false
        seenInBatch.add(t.title)
        return true
      })
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

  const seenVideo = new Set<string>()
  const seenPhoto = new Set<string>()
  const toInsert = [
    ...(videoTemplates ?? [])
      .filter((t: TaskTemplateRow) => {
        const key = `video:${t.title}`
        if (existingKeys.has(key) || seenVideo.has(t.title)) return false
        seenVideo.add(t.title)
        return true
      })
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
      .filter((t: TaskTemplateRow) => {
        const key = `photo:${t.title}`
        if (existingKeys.has(key) || seenPhoto.has(t.title)) return false
        seenPhoto.add(t.title)
        return true
      })
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

    revalidatePath('/admin/projects')
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
): Promise<{ ok: boolean; advanced: boolean; projectId: string | null; nextStage: PipelineStage | null }> {
  try {
    const supabase = await createClient()

    // Hent task-info før oppdatering
    const { data: task } = await supabase
      .from('tasks')
      .select('project_id, pipeline_stage, sub_type, sort_order, is_custom, deliverable_id, title, status')
      .eq('id', taskId)
      .single()

    const { error } = await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', taskId)

    if (error) {
      console.error('updateTaskStatus error:', error)
      return { ok: false, advanced: false, projectId: null, nextStage: null }
    }

    // Varsle assignees på oppgaver som blir ulåst i post-prod-stepperen av at
    // denne settes til 'done' ("din tur nå"). Skal aldri blokkere hovedhandlingen.
    if (status === 'done' && task && task.pipeline_stage === 'post_prod' && !task.is_custom && task.status !== 'done') {
      notifyNewlyUnlockedPostProdTasks(supabase, taskId, task).catch(err =>
        console.error('notifyNewlyUnlockedPostProdTasks error:', err)
      )
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
            revalidatePath('/admin/projects')
            revalidatePath('/admin/postprod')
            return { ok: true, advanced: true, projectId: task.project_id, nextStage: nextStage as PipelineStage }
          }
        }
      }
    }

    revalidatePath('/admin/projects')
    revalidatePath('/admin/postprod')
    return { ok: true, advanced: false, projectId: null, nextStage: null }
  } catch (err) {
    console.error('updateTaskStatus unexpected error:', err)
    return { ok: false, advanced: false, projectId: null, nextStage: null }
  }
}

/**
 * Kalt fra updateTaskStatus når en post_prod-oppgave settes til 'done'. Finner
 * oppgaver i samme stepper-sekvens som går fra låst til ulåst som følge av dette
 * (samme diff-teknikk som computeStepperLocks, men før/etter i minnet i stedet for
 * to DB-runder), og varsler assignees på dem om at det nå er deres tur.
 */
async function notifyNewlyUnlockedPostProdTasks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  completedTaskId: string,
  completedTask: { project_id: string; status: string; title: string }
): Promise<void> {
  const { data: siblings, error } = await supabase
    .from('tasks')
    .select('id, project_id, pipeline_stage, sub_type, sort_order, status, title, deliverable_id, is_custom')
    .eq('project_id', completedTask.project_id)
    .eq('pipeline_stage', 'post_prod')
    .eq('is_custom', false)

  if (error || !siblings) return

  const candidates: StepperTaskLite[] = siblings.filter(s => s.id !== completedTaskId)
  if (candidates.length === 0) return

  const afterLocks = computeLocksFromSiblings(candidates, siblings)
  const siblingsBefore = siblings.map(s =>
    s.id === completedTaskId ? { ...s, status: completedTask.status } : s
  )
  const beforeLocks = computeLocksFromSiblings(candidates, siblingsBefore)

  const newlyUnlocked = candidates.filter(c => beforeLocks.get(c.id)?.locked && !afterLocks.get(c.id)?.locked)
  if (newlyUnlocked.length === 0) return

  const [{ data: project }, { data: assignees }, { data: { user: sender } }] = await Promise.all([
    supabase.from('projects').select('title').eq('id', completedTask.project_id).single(),
    supabase.from('task_assignees').select('task_id, profile_id').in('task_id', newlyUnlocked.map(t => t.id)),
    supabase.auth.getUser(),
  ])
  if (!assignees?.length) return

  // Hent avsenderens profil én gang i stedet for at notifyAssignment gjør det
  // på nytt for hver mottaker i loopen under.
  let senderName: string | undefined
  if (sender) {
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', sender.id)
      .single()
    senderName = senderProfile?.name ?? senderProfile?.email ?? 'Ukjent'
  }

  for (const nextTask of newlyUnlocked) {
    for (const recipient of assignees.filter(a => a.task_id === nextTask.id)) {
      await notifyAssignment({
        recipientId: recipient.profile_id,
        type: 'task_turn_ready',
        projectId: completedTask.project_id,
        taskId: nextTask.id,
        preview: project?.title ? `${nextTask.title} — ${project.title}` : (nextTask.title ?? ''),
        senderName,
      })
    }
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

    const { data: proj, error: projError } = await supabase
      .from('projects')
      .select('project_type, deliverables')
      .eq('id', projectId)
      .single()

    if (projError || !proj) {
      return { count: 0, error: 'Fant ikke prosjektet' }
    }

    if (!proj.project_type) {
      return { count: 0, error: 'Innholdstype ikke satt på prosjektet' }
    }

    // Samme mønster som getPostProdBoard: video-sporet seedes annerledes (delt +
    // per-leveranse) når prosjektet har 2+ video-leveranser.
    const deliverables = (proj.deliverables ?? []) as DeliverableItem[]
    const videoDeliverables = deliverables.filter(d => d.type === 'video')
    const hasVideoTabs = videoDeliverables.length >= 2

    const { data: existingTasks, error: existingError } = await supabase
      .from('tasks')
      .select('id, title, description, sub_type, custom_lane_id, is_parallel, created_by, is_custom')
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'post_prod')
      .order('sort_order', { ascending: true })

    if (existingError) {
      console.error('reseedPostProdTasks fetch error:', existingError)
      return { count: 0, error: 'Kunne ikke hente eksisterende oppgaver' }
    }

    // Kun maloppgaver (created_by=null) slettes og regenereres. Alt et
    // menneske har lagt til — frie egendefinerte oppgaver OG planlagte
    // post-prod-steg — bevares.
    const toDeleteIds = (existingTasks ?? [])
      .filter((t: { created_by: string | null }) => t.created_by === null)
      .map((t: { id: string }) => t.id)

    // isCustom skiller "frie egendefinerte oppgaver" (is_custom=true, vises i "Egendefinerte
    // oppgaver"-seksjonen, ALDRI en del av den låste sekvensen) fra "planlagte post-prod-steg"
    // (is_custom=false, satt inn i selve Video/Foto-sekvensen via addPostProdBoardTask) — kun
    // sistnevnte kan narre ensureVideoDeliverablesSeededs "allerede seedet?"-sjekk under
    // (den filtrerer eksplisitt på is_custom=false), så kun de skal slettes der.
    const preserved: (SequenceRow & { subType: 'video' | 'photo' | null; isCustom: boolean })[] = (existingTasks ?? [])
      .filter((t: { created_by: string | null; custom_lane_id: string | null; is_parallel: boolean }) =>
        t.created_by !== null && !t.custom_lane_id && !t.is_parallel
      )
      .map((t: { id: string; title: string; description: string | null; sub_type: 'video' | 'photo' | null; is_custom: boolean }) => ({
        id: t.id, title: t.title, description: t.description, origin: 'existing' as const, subType: t.sub_type, isCustom: t.is_custom,
      }))

    if (toDeleteIds.length > 0) {
      const { error: deleteError } = await supabase.from('tasks').delete().in('id', toDeleteIds)
      if (deleteError) {
        console.error('reseedPostProdTasks delete error:', deleteError)
        return { count: 0, error: 'Kunne ikke slette gamle maloppgaver' }
      }
    }

    const subTypeTracks: ('video' | 'photo' | null)[] = proj.project_type === 'mixed' ? ['video', 'photo'] : [null]
    let totalInserted = 0

    for (const subType of subTypeTracks) {
      const templateProjectType = proj.project_type === 'mixed' ? subType! : proj.project_type

      // Video-sporet for prosjekter med 2+ video-leveranser følger en annen struktur
      // (delt + per-leveranse-kort, samme sort_order gjenbrukt per leveranse) enn
      // merge-baserte flate reseed-logikken under, som forutsetter én kort-per-tittel.
      // ensureVideoDeliverablesSeeded er allerede idempotent — MEN kun hvis den faktisk
      // ser null video-tasks der den forventer en tom tavle. Preserved planlagte steg
      // (menneske-lagte, som normalt overlever en reseed via
      // mergeReseededSequence/computeInsertionOrder) har ingen definert plass i
      // delt/per-leveranse-strukturen, OG hvis de blir liggende narrer de
      // ensureVideoDeliverablesSeededs "er dette allerede seedet?"-sjekk — den ser det
      // gjenværende kortet, tror delt-stegene (Logging/Ferdig) alt finnes og hopper over
      // å seede dem, og 1→2-overgangslogikken kan i tillegg feilaktig kreve én leveranse
      // «ferdig seedet» uten at den er det. Derfor slettes preserved video-steg her, som
      // del av den samme fulle nullstillingen «Nullstill»-knappen allerede advarer om
      // («Fremdrift, notater og chat-meldinger går tapt») — videosporet i
      // 2+-leveranse-tilfellet blir en ekte blank tavle før seeding.
      const isVideoTrack = proj.project_type === 'mixed' ? subType === 'video' : proj.project_type === 'video'
      if (isVideoTrack && hasVideoTabs) {
        const preservedVideoIds = preserved
          .filter(p => p.subType === subType && !p.isCustom)
          .map(p => p.id as string)
        if (preservedVideoIds.length > 0) {
          const { error: deletePreservedError } = await supabase.from('tasks').delete().in('id', preservedVideoIds)
          if (deletePreservedError) {
            console.error('reseedPostProdTasks delete preserved video error:', deletePreservedError)
            return { count: 0, error: 'Kunne ikke slette gamle videooppgaver' }
          }
        }
        await ensureVideoDeliverablesSeeded(supabase, projectId, subType, videoDeliverables)
        continue
      }

      const { data: templates, error: templatesError } = await supabase
        .from('task_templates')
        .select('title, description')
        .eq('pipeline_stage', 'post_prod')
        .eq('project_type', templateProjectType)
        .order('sort_order', { ascending: true })

      if (templatesError) {
        console.error('reseedPostProdTasks templates error:', templatesError)
        return { count: 0, error: 'Kunne ikke hente maler' }
      }

      if (!templates || templates.length === 0) {
        return { count: 0, error: `Ingen maler funnet for type "${templateProjectType}"` }
      }

      const freshRows: SequenceRow[] = templates.map((t: { title: string; description: string | null }) => ({
        id: null, title: t.title, description: t.description ?? null, origin: 'template' as const,
      }))

      const preservedForTrack: SequenceRow[] = preserved
        .filter(p => p.subType === subType)
        .map(p => ({ id: p.id, title: p.title, description: p.description, origin: p.origin }))

      const merged = assignSortOrder(mergeReseededSequence(freshRows, preservedForTrack))

      for (const row of merged) {
        if (row.origin === 'existing') {
          const { error } = await supabase
            .from('tasks')
            .update({ sort_order: row.sortOrder })
            .eq('id', row.id as string)

          if (error) {
            console.error('reseedPostProdTasks reorder error:', error)
            return { count: 0, error: 'Kunne ikke oppdatere rekkefølgen' }
          }
        } else {
          const { error } = await supabase.from('tasks').insert({
            project_id: projectId,
            pipeline_stage: 'post_prod',
            title: row.title,
            description: row.description,
            status: 'todo' as const,
            sort_order: row.sortOrder,
            sub_type: subType,
            is_custom: false,
            created_by: null,
            due_date: null,
            priority: null,
          })

          if (error) {
            console.error('reseedPostProdTasks insert error:', error)
            return { count: 0, error: 'Kunne ikke opprette oppgaver' }
          }
          totalInserted++
        }
      }
    }

    revalidatePath('/admin/postprod')
    revalidatePath('/admin/preprod')
    return { count: totalInserted }
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
      .select(`*, customers(id, name, company), project_lead:profiles!project_lead_id(id, name, email)`)
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
      project_lead: (row as { project_lead?: ProjectWithPipeline['project_lead'] }).project_lead ?? null,
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

    const { data: { user } } = await supabase.auth.getUser()

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
        is_custom: true,
        created_by: user?.id ?? null,
      })
      .select('*')
      .single()

    if (error) {
      console.error('createTask error:', error)
      return null
    }

    revalidatePath('/admin/projects')

    return { ...created, assignees: [] } as Task
  } catch (err) {
    console.error('createTask unexpected error:', err)
    return null
  }
}

/**
 * Sletter en oppgave brukeren har lagt til (fri egendefinert oppgave eller
 * planlagt post-prod-steg). Nekter å slette maloppgaver (created_by=null,
 * seedet fra task_templates) for å beskytte den faste sjekklisten/stepperen.
 */
export async function deleteTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: task, error: fetchError } = await supabase
      .from('tasks')
      .select('created_by')
      .eq('id', taskId)
      .single()

    if (fetchError || !task) {
      return { ok: false, error: 'Oppgave ikke funnet' }
    }

    if (!task.created_by) {
      return { ok: false, error: 'Kan ikke slette faste oppgaver' }
    }

    const { error } = await supabase.from('tasks').delete().eq('id', taskId)

    if (error) {
      console.error('deleteTask error:', error)
      return { ok: false, error: 'Kunne ikke slette oppgaven' }
    }

    revalidatePath('/admin/projects')

    return { ok: true }
  } catch (err) {
    console.error('deleteTask unexpected error:', err)
    return { ok: false, error: 'Kunne ikke slette oppgaven' }
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

    // Hent prosjekt med customer og prosjektleder. project_lead_id må disambigueres med
    // !project_lead_id siden projects har flere FK-er mot profiles (quote_assignee_id,
    // invoice_assignee_id) — uten det aliaset vet ikke Supabase hvilken relasjon som menes.
    const { data: projectRow, error: projectError } = await supabase
      .from('projects')
      .select(`
        *,
        customers (
          id,
          name,
          company,
          org_nummer,
          address,
          invoice_email,
          invoice_reference,
          invoice_info_skipped
        ),
        project_lead:profiles!project_lead_id (
          id,
          name,
          email
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
      project_lead: projectRow.project_lead ?? null,
    } as ProjectWithPipeline

    // Disse fire er uavhengige av hverandre (kun projectId trengs) — kjør parallelt
    // i stedet for som fire sekvensielle round trips.
    const [tasks, quoteResult, shareResult, sectionCountResult] = await Promise.all([
      project.pipeline_stage
        ? getTasksForProject(projectId, project.pipeline_stage)
        : getTasksForProject(projectId),
      // Hent tilbudet som best representerer prosjektet nå — et akseptert/signert
      // tilbud vinner alltid over "gjeldende versjon" (is_current), se pickBestQuote.
      // Uten dette kan et nyere, usignert tilleggstilbud for samme prosjekt vises som
      // om DET var det kunden hadde akseptert (feedback 08a0235b).
      supabase
        .from('quotes')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      // Hent pitch-token fra project_shares
      supabase
        .from('project_shares')
        .select('token')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('sections')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId),
    ])

    if (quoteResult.error) {
      console.error('getProjectHub quote error:', quoteResult.error)
    }
    const quoteRow = pickBestQuote((quoteResult.data ?? []) as Quote[])

    if (shareResult.error) {
      console.error('getProjectHub share error:', shareResult.error)
    }
    const shareRow = shareResult.data

    const sectionCount = sectionCountResult.count

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

// Genererer ett kort, sammenhengende sammendrag (ikke strukturerte felter) — skal kunne
// leses av et team-medlem som ikke har sett prosjektet før, og gi dem nok kontekst til å
// forstå hva det handler om uten å måtte lese hele e-posttråden selv.
export async function analyzeProjectNotes(
  projectId: string,
  notes: string,
  projectTitle: string
): Promise<{ sammendrag: string; shootStart?: string | null; shootEnd?: string | null } | { error: string }> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return { error: 'AI-analyse er ikke konfigurert.' }
    const supabase = await createClient()
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const today = new Date().toISOString().slice(0, 10)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: 'Du er en assistent for et norsk film- og fotoproduksjonsselskap. Du oppsummerer e-posttråder og møtenotater til et kort, lettlest sammendrag, og plukker i tillegg ut en eventuell opptaksdato som er nevnt i teksten. Svar KUN med et JSON-objekt — ingen markdown-fences, ingen tekst før eller etter.',
      messages: [{
        role: 'user',
        content: `Dagens dato: ${today}\n\nProsjekt: "${projectTitle}"\n\nE-posttråd / møtenotater:\n${notes}\n\n1. Skriv et sammenhengende sammendrag på 3-5 setninger (vanlig løpende tekst, ikke punktliste) som dekker: hvem kunden er, hva prosjektet går ut på, viktige krav/ønsker, og eventuelt budsjett/tidslinje/kontaktperson hvis det er nevnt.\n\n2. Nevner teksten en konkret opptaksdato eller -periode (filming, innspilling, "vi filmer den...", "opptak i uke ...", osv.)? Regn ut datoen(e) i ISO-format (YYYY-MM-DD) relativt til dagens dato over. Én dag: sett shootEnd likt shootStart. Ingen dato nevnt eller for vagt til å regne ut (f.eks. "en gang i høst"): sett begge til null.\n\nSvar med nøyaktig dette JSON-objektet:\n{"sammendrag": "...", "shootStart": "YYYY-MM-DD eller null", "shootEnd": "YYYY-MM-DD eller null"}`
      }]
    })

    const raw = (response.content.find(b => b.type === 'text')?.text ?? '').trim()
    if (!raw) return { error: 'Fikk ikke noe svar fra AI-tjenesten.' }

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    let parsed: { sammendrag?: string; shootStart?: string | null; shootEnd?: string | null } = {}
    try {
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {}
    } catch {
      parsed = {}
    }

    const sammendrag = (parsed.sammendrag ?? raw).trim()
    if (!sammendrag) return { error: 'Fikk ikke noe svar fra AI-tjenesten.' }
    const summary = { sammendrag }

    // Skriv aldri over en opptaksdato som allerede er satt (f.eks. bekreftet i kalender
    // eller kontrakt) — AI-uttrekket fra frittekst skal kun fylle inn en dato som mangler.
    const { data: existing } = await supabase.from('projects').select('shoot_start').eq('id', projectId).maybeSingle()
    const extractedStart = typeof parsed.shootStart === 'string' ? parsed.shootStart : null
    const shouldSetShootDates = !existing?.shoot_start && !!extractedStart

    await supabase
      .from('projects')
      .update({
        meeting_notes: notes,
        meeting_summary: summary,
        updated_at: new Date().toISOString(),
        ...(shouldSetShootDates && {
          shoot_start: extractedStart,
          shoot_end: typeof parsed.shootEnd === 'string' ? parsed.shootEnd : extractedStart,
        }),
      })
      .eq('id', projectId)
    revalidatePath(`/admin/projects/${projectId}`)
    if (shouldSetShootDates) revalidatePath('/admin/calendar')

    return {
      ...summary,
      ...(shouldSetShootDates && {
        shootStart: extractedStart,
        shootEnd: typeof parsed.shootEnd === 'string' ? parsed.shootEnd : extractedStart,
      }),
    }
  } catch (err) {
    console.error('analyzeProjectNotes error:', err)
    if (err instanceof Anthropic.APIError && err.status === 400 && /credit balance/i.test(err.message)) {
      return { error: 'AI-tjenesten har ikke nok kreditt. Kontakt en administrator.' }
    }
    return { error: 'Kunne ikke analysere akkurat nå. Prøv igjen senere.' }
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

    revalidatePath('/admin/projects')

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
      .select('sort_order, sub_type, deliverable_id')
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

    // Et delt steg (deliverable_id=NULL, f.eks. Logging) nullstiller alle leveranser — et
    // per-leveranse-steg nullstiller kun samme leveranse pluss delte steg som Ferdig (den
    // er ikke lenger ferdig hvis ett steg i én leveranse går tilbake), aldri andre
    // leveransers oppgaver. Se docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md §7.3.
    if (task.deliverable_id) {
      query = query.or(`deliverable_id.eq.${task.deliverable_id},deliverable_id.is.null`)
    }

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
      .select('sort_order, sub_type, deliverable_id')
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

    // Samme leveranse-skopering som resetTaskAndSubsequent over.
    if (venterTask.deliverable_id) {
      resetQuery = resetQuery.or(`deliverable_id.eq.${venterTask.deliverable_id},deliverable_id.is.null`)
    }

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
  message: string,
  mentions: string[] = []
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { ok: false, error: 'Ikke autentisert' }

    const { error } = await supabase
      .from('task_messages')
      .insert({ task_id: taskId, user_id: user.id, message: message.trim(), mentions })

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

export async function getTaskMessageCounts(taskIds: string[]): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {}
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('task_messages')
      .select('task_id')
      .in('task_id', taskIds)

    if (error) {
      console.error('getTaskMessageCounts error:', error)
      return {}
    }

    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
      counts[row.task_id] = (counts[row.task_id] ?? 0) + 1
    }
    return counts
  } catch (err) {
    console.error('getTaskMessageCounts unexpected error:', err)
    return {}
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
export async function getAllProfiles(): Promise<{ id: string; name: string | null; email: string; color: string | null; phone: string | null }[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, color, phone')
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

    const myTasks = ((data ?? []) as unknown as { task: (TaskRow & { project?: unknown }) | null }[])
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

    const locks = await computeStepperLocks(supabase, myTasks)
    return myTasks.map(t => ({ ...t, ...(locks.get(t.id) ?? {}) }))
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
  color: string | null
} | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, name, email, color')
      .eq('id', user.id)
      .single()

    return profile ?? { id: user.id, name: null, email: user.email ?? '', color: null }
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
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
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

    revalidatePath('/admin/projects')
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
    const { data: project, error } = await supabase
      .from('projects')
      .update({ quote_assignee_id: assigneeId, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .select('title')
      .single()
    if (error) return { ok: false, error: 'Kunne ikke oppdatere tilbud-ansvarlig' }
    if (assigneeId) {
      await notifyAssignment({
        recipientId: assigneeId,
        type: 'quote_assigned',
        projectId,
        preview: project?.title ?? '',
      })
    }
    revalidatePath('/admin/projects')
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
    const { data: project, error } = await supabase
      .from('projects')
      .update({ invoice_assignee_id: assigneeId, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .select('title')
      .single()
    if (error) return { ok: false, error: 'Kunne ikke oppdatere faktura-ansvarlig' }
    if (assigneeId) {
      await notifyAssignment({
        recipientId: assigneeId,
        type: 'invoice_assigned',
        projectId,
        preview: project?.title ?? '',
      })
    }
    revalidatePath('/admin/projects')
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
      .select('title')
      .eq('id', projectId)
      .single()

    if (fetchError || !project) {
      return { ok: false, error: 'Prosjekt ikke funnet' }
    }

    const { error } = await supabase
      .from('projects')
      .update({
        quote_assignee_id: assigneeId,
        pipeline_stage: 'tilbud_sendt',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    if (error) {
      return { ok: false, error: 'Kunne ikke oppdatere prosjekt' }
    }

    await seedTasksFromTemplates(projectId, 'tilbud_sendt')

    await notifyAssignment({
      recipientId: assigneeId,
      type: 'quote_assigned',
      projectId,
      preview: project.title,
    })

    revalidatePath('/admin/projects')
    revalidatePath(`/admin/projects/${projectId}`)

    return { ok: true }
  } catch (err) {
    console.error('assignQuoteAndMove unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function setResaleAssignee(
  projectId: string,
  assigneeId: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: project, error } = await supabase
      .from('projects')
      .update({ resale_assignee_id: assigneeId, updated_at: new Date().toISOString() })
      .eq('id', projectId)
      .select('title')
      .single()
    if (error) return { ok: false, error: 'Kunne ikke oppdatere videresalg-ansvarlig' }
    if (assigneeId) {
      await notifyAssignment({
        recipientId: assigneeId,
        type: 'resale_assigned',
        projectId,
        preview: project?.title ?? '',
      })
    }
    revalidatePath('/admin/projects')
    revalidatePath(`/admin/projects/${projectId}`)
    return { ok: true }
  } catch (err) {
    console.error('setResaleAssignee unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function assignResaleAndMove(
  projectId: string,
  assigneeId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('title')
      .eq('id', projectId)
      .single()

    if (fetchError || !project) {
      return { ok: false, error: 'Prosjekt ikke funnet' }
    }

    const { error } = await supabase
      .from('projects')
      .update({
        resale_assignee_id: assigneeId,
        pipeline_stage: 'videresalg',
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)

    if (error) {
      return { ok: false, error: 'Kunne ikke oppdatere prosjekt' }
    }

    await seedTasksFromTemplates(projectId, 'videresalg')

    await notifyAssignment({
      recipientId: assigneeId,
      type: 'resale_assigned',
      projectId,
      preview: project.title,
    })

    revalidatePath('/admin/projects')
    revalidatePath(`/admin/projects/${projectId}`)

    return { ok: true }
  } catch (err) {
    console.error('assignResaleAndMove unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

/**
 * Setter eller fjerner prosjektleder for et prosjekt.
 */
export async function setProjectLead(
  projectId: string,
  profileId: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('projects')
      .update({ project_lead_id: profileId, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Endrer prosjektnavnet.
 */
export async function updateProjectTitle(
  projectId: string,
  title: string
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = title.trim()
  if (!trimmed) return { ok: false, error: 'Navn kan ikke være tomt' }
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('projects')
      .update({ title: trimmed, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Bytter hvilken kunde et prosjekt er koblet til.
 */
export async function updateProjectCustomer(
  projectId: string,
  customerId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('projects')
      .update({ customer_id: customerId, updated_at: new Date().toISOString() })
      .eq('id', projectId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

/**
 * Henter en lett kundeliste til bytt-kunde-velgeren.
 */
export async function getCustomersList(): Promise<{ id: string; name: string; company: string | null }[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('customers')
      .select('id, name, company')
      .order('name', { ascending: true })

    if (error) {
      console.error('getCustomersList error:', error)
      return []
    }
    return data ?? []
  } catch {
    return []
  }
}

export type PostProdBoardCard = {
  id: string
  title: string
  description: string | null
  color: string | null
  icon: string | null
  dueDate: string | null
  assignees: { id: string; name: string | null; email: string }[]
}

export type PostProdBoardLane = {
  kind: 'video' | 'photo' | 'custom'
  laneId: string | null
  name: string
  color: string | null
  deadline: string | null
  cards: PostProdBoardCard[]
}

// Én per video i projects.deliverables, kun bygget når det er 2+ videoer —
// se PostProdBoard.videoTabs. lane.laneId er alltid null her (id-en for
// dra-og-slipp-ruting er tab.id, ikke lane.laneId — se laneIdToDestination
// i PostProdBoard.tsx).
export type VideoDeliverableTab = {
  id: string
  name: string
  lane: PostProdBoardLane
}

export type PostProdBoard = {
  projectType: ProjectType | null
  lanes: PostProdBoardLane[]
  // Ikke-null kun når prosjektet har 2+ video-leveranser — da inneholder
  // `lanes` IKKE lenger noen 'video'-kind lane (den er erstattet av disse to).
  videoShared: PostProdBoardLane | null
  videoTabs: VideoDeliverableTab[] | null
  parallel: PostProdBoardCard[]
}

type BoardTaskRow = {
  id: string
  title: string
  description: string | null
  sub_type: 'video' | 'photo' | null
  deliverable_id: string | null
  custom_lane_id: string | null
  is_parallel: boolean
  color: string | null
  icon: string | null
  due_date: string | null
  task_assignees: { profile: { id: string; name: string | null; email: string } | null }[]
}

async function shouldMaterializeDefaults(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<boolean> {
  const { count } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('pipeline_stage', 'post_prod')
    .eq('is_custom', false)

  return (count ?? 0) === 0
}

async function materializeDefaultLane(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  dbSubType: 'video' | 'photo' | null,
  templateProjectType: ProjectType
): Promise<void> {
  const { data: templates } = await supabase
    .from('task_templates')
    .select('title, description')
    .eq('pipeline_stage', 'post_prod')
    .eq('project_type', templateProjectType)
    .order('sort_order', { ascending: true })

  if (!templates?.length) return

  await supabase.from('tasks').insert(
    templates.map((t: { title: string; description: string | null }, i: number) => ({
      project_id: projectId,
      pipeline_stage: 'post_prod',
      title: t.title,
      description: t.description,
      status: 'todo' as const,
      sort_order: i + 1,
      sub_type: dbSubType,
      custom_lane_id: null,
      is_parallel: false,
      is_custom: false,
      created_by: null,
      due_date: null,
      priority: null,
    }))
  )
}

/**
 * Seeder video-post-prod for prosjekter med 2+ video-leveranser. Idempotent —
 * trygt å kalle på hver getPostProdBoard-forespørsel:
 * 1. Kort som matcher en `per_deliverable`-mal og fortsatt har
 *    deliverable_id=NULL tilhørte den gamle flate lanen (1 video) — de
 *    reassignes til den FØRSTE leveransen. Kjøres dette igjen senere finnes
 *    ingen slike kort lenger, så UPDATE treffer 0 rader.
 * 2. Delt-seksjonen (`shared`-maler) seedes kun hvis prosjektet aldri har
 *    hatt video-kort i det hele tatt.
 * 3. Hver leveranse uten egne kort ennå (helt ny, eller lagt til i en senere
 *    re-signering) får friskt seedede per-leveranse-steg.
 * Se docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md §3.
 */
async function ensureVideoDeliverablesSeeded(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
  // Typet identisk med dbSubTypeFor()s returtype i getPostProdBoard (ikke bare
  // 'video' | null) — TS narrower ikke dbSubTypeFor('video') sin returtype til
  // undermengden basert på det bokstavelige argumentet, siden funksjonen alltid
  // er deklarert til å returnere hele unionen uansett input.
  videoDbSubType: 'video' | 'photo' | null,
  videoDeliverables: DeliverableItem[]
): Promise<void> {
  const { data: scopedTemplates } = await supabase
    .from('task_templates')
    .select('title, description, default_scope, sort_order')
    .eq('pipeline_stage', 'post_prod')
    .eq('project_type', 'video')
    .order('sort_order', { ascending: true })

  const sharedTemplates = (scopedTemplates ?? []).filter(
    (t: { default_scope: string | null }) => t.default_scope === 'shared'
  )
  const perDeliverableTemplates = (scopedTemplates ?? []).filter(
    (t: { default_scope: string | null }) => t.default_scope === 'per_deliverable'
  )

  let videoTaskQuery = supabase
    .from('tasks')
    .select('id, title, deliverable_id')
    .eq('project_id', projectId)
    .eq('pipeline_stage', 'post_prod')
    .eq('is_custom', false)
    .eq('is_parallel', false)
    .is('custom_lane_id', null)
  videoTaskQuery = videoDbSubType === null
    ? videoTaskQuery.is('sub_type', null)
    : videoTaskQuery.eq('sub_type', videoDbSubType)
  const { data: existingVideoTasks } = await videoTaskQuery

  const perDeliverableTitles = new Set(perDeliverableTemplates.map((t: { title: string }) => t.title))
  const unassigned = (existingVideoTasks ?? []).filter(
    (t: { title: string; deliverable_id: string | null }) =>
      t.deliverable_id === null && perDeliverableTitles.has(t.title)
  )

  if (unassigned.length > 0) {
    const firstId = videoDeliverables[0].id
    await supabase.from('tasks')
      .update({ deliverable_id: firstId })
      .in('id', unassigned.map((t: { id: string }) => t.id))
  }

  if ((existingVideoTasks ?? []).length === 0 && sharedTemplates.length > 0) {
    await supabase.from('tasks').insert(
      sharedTemplates.map((t: { title: string; description: string | null; sort_order: number }) => ({
        project_id: projectId,
        pipeline_stage: 'post_prod',
        title: t.title,
        description: t.description,
        status: 'todo' as const,
        // Malens EGEN sort_order (ikke indeksbasert i+1) — slik at delt og
        // per-leveranse-steg deler samme 1..7-nummerering og kan slås sammen til én
        // virtuell sekvens i stepper-siden (app/admin/postprod/[id]/page.tsx). Se
        // docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md §7.1.
        sort_order: t.sort_order,
        sub_type: videoDbSubType,
        deliverable_id: null,
        custom_lane_id: null,
        is_parallel: false,
        is_custom: false,
        created_by: null,
        due_date: null,
        priority: null,
      }))
    )
  }

  // Sjekk hvilke leveranser som allerede har per-leveranse-tasks i én batchet
  // spørring, i stedet for en count-spørring per leveranse (var N round trips).
  if (perDeliverableTemplates.length > 0 && videoDeliverables.length > 0) {
    const { data: existingPerDeliverableTasks } = await supabase
      .from('tasks')
      .select('deliverable_id')
      .eq('project_id', projectId)
      .in('deliverable_id', videoDeliverables.map(d => d.id))

    const deliverableIdsWithTasks = new Set((existingPerDeliverableTasks ?? []).map(t => t.deliverable_id))
    const deliverablesNeedingSeed = videoDeliverables.filter(d => !deliverableIdsWithTasks.has(d.id))

    if (deliverablesNeedingSeed.length > 0) {
      await supabase.from('tasks').insert(
        deliverablesNeedingSeed.flatMap(deliverable =>
          perDeliverableTemplates.map((t: { title: string; description: string | null; sort_order: number }) => ({
            project_id: projectId,
            pipeline_stage: 'post_prod',
            title: t.title,
            description: t.description,
            status: 'todo' as const,
            sort_order: t.sort_order,
            sub_type: videoDbSubType,
            deliverable_id: deliverable.id,
            custom_lane_id: null,
            is_parallel: false,
            is_custom: false,
            created_by: null,
            due_date: null,
            priority: null,
          }))
        )
      )
    }
  }
}

/**
 * Henter alt post-produksjon-brettet trenger: Video/Foto-lanes (materialisert
 * fra task_templates hvis prosjektet ikke har noen post-prod-oppgaver i det
 * hele tatt ennå), prosjektets egendefinerte lanes, og parallell-oppgaver —
 * alt bygget fra ekte tasks-rader, ingen hardkodede rollelister.
 */
export async function getPostProdBoard(projectId: string): Promise<PostProdBoard> {
  try {
    const supabase = await createClient()

    const { data: proj } = await supabase
      .from('projects')
      .select('project_type, deliverables')
      .eq('id', projectId)
      .single()

    const projectType = (proj?.project_type ?? null) as ProjectType | null
    if (!projectType) return { projectType: null, lanes: [], videoShared: null, videoTabs: null, parallel: [] }

    const deliverables = (proj?.deliverables ?? []) as DeliverableItem[]
    const videoDeliverables = deliverables.filter(d => d.type === 'video')
    const hasVideoTabs = videoDeliverables.length >= 2

    const subTypes: ('video' | 'photo')[] =
      projectType === 'photo' ? ['photo'] : projectType === 'mixed' ? ['video', 'photo'] : ['video']

    // Ikke-mixed prosjekter lagrer sub_type=null i DB — samme konvensjon som
    // seedTasksFromTemplates/reseedPostProdTasks/getTasksForProject bruker
    // overalt ellers i kodebasen. Kun mixed-prosjekter skiller video/foto via
    // sub_type. 'video'/'photo' i subTypes over er kun en UI-nøkkel for
    // hvilken lane som vises, ikke nødvendigvis den faktiske DB-verdien.
    const dbSubTypeFor = (uiSubType: 'video' | 'photo'): 'video' | 'photo' | null =>
      projectType === 'mixed' ? uiSubType : null

    // Når video splittes i faner, seedes den via ensureVideoDeliverablesSeeded
    // under i stedet for her — å inkludere 'video' i denne loopen ville seedet
    // hele video-malsettet en gang til, uavhengig av delt/per-leveranse.
    const materializeSubTypes = hasVideoTabs ? subTypes.filter(t => t !== 'video') : subTypes

    if (materializeSubTypes.length > 0 && await shouldMaterializeDefaults(supabase, projectId)) {
      await Promise.all(
        materializeSubTypes.map(uiSubType =>
          materializeDefaultLane(
            supabase,
            projectId,
            dbSubTypeFor(uiSubType),
            projectType === 'mixed' ? uiSubType : projectType
          )
        )
      )
    }

    if (hasVideoTabs && subTypes.includes('video')) {
      await ensureVideoDeliverablesSeeded(supabase, projectId, dbSubTypeFor('video'), videoDeliverables)
    }

    const [{ data: taskRows }, { data: laneRows }] = await Promise.all([
      supabase
        .from('tasks')
        .select('id, title, description, sub_type, deliverable_id, custom_lane_id, is_parallel, color, icon, due_date, task_assignees(profile:profiles(id, name, email))')
        .eq('project_id', projectId)
        .eq('pipeline_stage', 'post_prod')
        .eq('is_custom', false)
        .order('sort_order', { ascending: true }),
      supabase
        .from('post_prod_lanes')
        .select('id, name, color, deadline, sort_order')
        .eq('project_id', projectId)
        .order('sort_order', { ascending: true }),
    ])

    const rows = (taskRows ?? []) as unknown as BoardTaskRow[]

    const toCard = (t: BoardTaskRow): PostProdBoardCard => ({
      id: t.id,
      title: t.title,
      description: t.description,
      color: t.color,
      icon: t.icon,
      dueDate: t.due_date,
      assignees: (t.task_assignees ?? [])
        .map(ta => ta.profile)
        .filter((p): p is NonNullable<typeof p> => p !== null),
    })

    const parallel = rows.filter(t => t.is_parallel).map(toCard)

    let videoShared: PostProdBoardLane | null = null
    let videoTabs: VideoDeliverableTab[] | null = null

    // Eksplisitt typet mellomsteg: TS 5.5+ inferrer et type predicate for
    // `.filter(t => t !== 'video')` og snevrer uiSubType til kun 'photo' i
    // .map under — det gjør ternaryen for 'video' (uendret, se pre-eksisterende
    // mønster) til en TS2367-feil. Ingen atferdsendring, kun for å unngå at
    // tsc feiler på dette laget.
    const nonVideoSubTypes: ('video' | 'photo')[] = subTypes.filter(t => t !== 'video')
    const builtinLanes: PostProdBoardLane[] = nonVideoSubTypes
      .map(uiSubType => ({
        kind: uiSubType,
        laneId: null,
        name: uiSubType === 'video' ? 'Video' : 'Foto',
        color: uiSubType === 'video' ? '#C49434' : '#4A9EFF',
        deadline: null,
        cards: rows
          .filter(t => t.sub_type === dbSubTypeFor(uiSubType) && !t.is_parallel && !t.custom_lane_id)
          .map(toCard),
      }))

    if (subTypes.includes('video')) {
      const videoDbSubType = dbSubTypeFor('video')
      const videoRows = rows.filter(t => t.sub_type === videoDbSubType && !t.is_parallel && !t.custom_lane_id)

      if (hasVideoTabs) {
        videoShared = {
          kind: 'video', laneId: null, name: 'Video — Delt', color: '#C49434', deadline: null,
          cards: videoRows.filter(t => t.deliverable_id === null).map(toCard),
        }
        videoTabs = videoDeliverables.map(d => ({
          id: d.id,
          name: d.name,
          lane: {
            kind: 'video', laneId: null, name: d.name, color: '#C49434', deadline: null,
            cards: videoRows.filter(t => t.deliverable_id === d.id).map(toCard),
          },
        }))
      } else {
        builtinLanes.unshift({
          kind: 'video', laneId: null, name: 'Video', color: '#C49434', deadline: null,
          cards: videoRows.map(toCard),
        })
      }
    }

    const customLanes: PostProdBoardLane[] = (laneRows ?? []).map(
      (lane: { id: string; name: string; color: string | null; deadline: string | null }) => ({
        kind: 'custom' as const,
        laneId: lane.id,
        name: lane.name,
        color: lane.color,
        deadline: lane.deadline,
        cards: rows.filter(t => t.custom_lane_id === lane.id && !t.is_parallel).map(toCard),
      })
    )

    return { projectType, lanes: [...builtinLanes, ...customLanes], videoShared, videoTabs, parallel }
  } catch (err) {
    console.error('getPostProdBoard error:', err)
    return { projectType: null, lanes: [], videoShared: null, videoTabs: null, parallel: [] }
  }
}

export type PostProdDestination =
  | { kind: 'video' }
  | { kind: 'video_deliverable'; deliverableId: string }
  | { kind: 'photo' }
  | { kind: 'custom'; laneId: string }
  | { kind: 'parallel' }

/**
 * Legger til en ny post-prod-oppgave: i Video/Foto-sekvensen (samme
 * innsettingslogikk som addPlannedPostProdStep hadde), i en egendefinert
 * lanes egen sekvens, eller i parallell-raden (ingen sekvens der).
 */
export async function addPostProdBoardTask(input: {
  projectId: string
  title: string
  description?: string
  assigneeId?: string
  color?: string
  icon?: string
  destination: PostProdDestination
  insertBeforeTaskId?: string | null
  isReusable?: boolean
}): Promise<{ ok: boolean; error?: string; taskId?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    let dbSubType: 'video' | 'photo' | null = null
    if (input.destination.kind === 'video' || input.destination.kind === 'video_deliverable' || input.destination.kind === 'photo') {
      const { data: destProj } = await supabase
        .from('projects')
        .select('project_type')
        .eq('id', input.projectId)
        .single()
      const uiKind = input.destination.kind === 'video_deliverable' ? 'video' : input.destination.kind
      dbSubType = destProj?.project_type === 'mixed' ? uiKind : null
    }

    let newTaskId: string

    if (input.destination.kind === 'parallel') {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          project_id: input.projectId,
          pipeline_stage: 'post_prod',
          title: input.title,
          description: input.description ?? null,
          status: 'todo' as const,
          sort_order: 0,
          sub_type: null,
          custom_lane_id: null,
          is_parallel: true,
          color: input.color ?? null,
          icon: input.icon ?? null,
          is_custom: false,
          created_by: user.id,
          due_date: null,
          priority: null,
        })
        .select('id')
        .single()

      if (error || !data) return { ok: false, error: 'Kunne ikke opprette oppgaven' }
      newTaskId = data.id
    } else {
      const subType = input.destination.kind === 'custom' ? null : dbSubType
      const customLaneId = input.destination.kind === 'custom' ? input.destination.laneId : null
      const deliverableId = input.destination.kind === 'video_deliverable' ? input.destination.deliverableId : null

      let existingQuery = supabase
        .from('tasks')
        .select('id, title, description')
        .eq('project_id', input.projectId)
        .eq('pipeline_stage', 'post_prod')
        .eq('is_custom', false)
        .eq('is_parallel', false)
        .order('sort_order', { ascending: true })

      existingQuery = input.destination.kind === 'custom'
        ? existingQuery.eq('custom_lane_id', customLaneId as string)
        : subType === null
          ? existingQuery.is('sub_type', null).is('custom_lane_id', null)
          : existingQuery.eq('sub_type', subType).is('custom_lane_id', null)

      existingQuery = deliverableId === null
        ? existingQuery.is('deliverable_id', null)
        : existingQuery.eq('deliverable_id', deliverableId)

      const { data: existingRows, error: existingError } = await existingQuery
      if (existingError) return { ok: false, error: 'Kunne ikke hente eksisterende steg' }

      const currentSequence: SequenceRow[] = (existingRows ?? []).map(
        (r: { id: string; title: string; description: string | null }) => ({
          id: r.id, title: r.title, description: r.description, origin: 'existing' as const,
        })
      )

      const insertBeforeTitle = input.insertBeforeTaskId
        ? currentSequence.find(r => r.id === input.insertBeforeTaskId)?.title ?? null
        : null

      const newStep: SequenceRow = { id: null, title: input.title, description: input.description ?? null, origin: 'new' }
      const merged = assignSortOrder(computeInsertionOrder(currentSequence, newStep, insertBeforeTitle))

      newTaskId = ''
      for (const row of merged) {
        if (row.origin === 'existing') {
          const { error } = await supabase.from('tasks').update({ sort_order: row.sortOrder }).eq('id', row.id as string)
          if (error) return { ok: false, error: 'Kunne ikke oppdatere rekkefølgen' }
        } else {
          const { data, error } = await supabase
            .from('tasks')
            .insert({
              project_id: input.projectId,
              pipeline_stage: 'post_prod',
              title: row.title,
              description: row.description,
              status: 'todo' as const,
              sort_order: row.sortOrder,
              sub_type: subType,
              deliverable_id: deliverableId,
              custom_lane_id: customLaneId,
              is_parallel: false,
              color: input.color ?? null,
              icon: input.icon ?? null,
              is_custom: false,
              created_by: user.id,
              due_date: null,
              priority: null,
            })
            .select('id')
            .single()

          if (error || !data) return { ok: false, error: 'Kunne ikke opprette steget' }
          newTaskId = data.id
        }
      }
    }

    if (input.assigneeId) {
      const { error: assigneeError } = await supabase
        .from('task_assignees')
        .insert({ task_id: newTaskId, profile_id: input.assigneeId })
      if (assigneeError) console.error('addPostProdBoardTask assignee insert error:', assigneeError)
    }

    if (input.isReusable) {
      let customLaneName: string | null = null
      if (input.destination.kind === 'custom') {
        const { data: lane, error: laneError } = await supabase
          .from('post_prod_lanes')
          .select('name')
          .eq('id', input.destination.laneId)
          .single()
        if (laneError) console.error('addPostProdBoardTask lane lookup error:', laneError)
        customLaneName = lane?.name ?? null
      }

      // 'video_deliverable' finnes ikke i post_prod_task_library.lane_type sin
      // CHECK-constraint (kun 'video'|'photo'|'custom'|'parallel') — biblioteket
      // er prosjekt-uavhengig, så «hvilken navngitt video» gir ingen mening der.
      const libraryLaneType = input.destination.kind === 'video_deliverable' ? 'video' : input.destination.kind
      const { error: libraryError } = await supabase.from('post_prod_task_library').insert({
        created_by: user.id,
        title: input.title,
        description: input.description ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        lane_type: libraryLaneType,
        custom_lane_name: customLaneName,
      })
      if (libraryError) console.error('addPostProdBoardTask library insert error:', libraryError)
    }

    revalidatePath('/admin/preprod')
    revalidatePath('/admin/postprod')
    revalidatePath('/admin/projects')

    return { ok: true, taskId: newTaskId }
  } catch (err) {
    console.error('addPostProdBoardTask unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

/**
 * Flytter en eksisterende post-prod-oppgave: omplassering innad i samme
 * lane, eller til en annen lane/parallell-raden. I motsetning til
 * addPostProdBoardTask jobber denne på allerede lagrede rader, derfor
 * reorderExistingIds (id-basert) i stedet for computeInsertionOrder
 * (tittel-basert, for ulagrede rader).
 */
export async function moveBoardTask(
  taskId: string,
  destination: PostProdDestination,
  beforeTaskId: string | null
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, project_id')
      .eq('id', taskId)
      .single()

    if (taskError || !task) return { ok: false, error: 'Fant ikke oppgaven' }

    let dbSubType: 'video' | 'photo' | null = null
    if (destination.kind === 'video' || destination.kind === 'video_deliverable' || destination.kind === 'photo') {
      const { data: destProj } = await supabase
        .from('projects')
        .select('project_type')
        .eq('id', task.project_id)
        .single()
      const uiKind = destination.kind === 'video_deliverable' ? 'video' : destination.kind
      dbSubType = destProj?.project_type === 'mixed' ? uiKind : null
    }

    if (destination.kind === 'parallel') {
      const { error } = await supabase
        .from('tasks')
        .update({ is_parallel: true, sub_type: null, custom_lane_id: null, deliverable_id: null, sort_order: 0 })
        .eq('id', taskId)

      if (error) return { ok: false, error: 'Kunne ikke flytte oppgaven' }
      revalidatePath('/admin/preprod')
      revalidatePath('/admin/postprod')
      return { ok: true }
    }

    const deliverableId = destination.kind === 'video_deliverable' ? destination.deliverableId : null

    let destQuery = supabase
      .from('tasks')
      .select('id')
      .eq('project_id', task.project_id)
      .eq('pipeline_stage', 'post_prod')
      .eq('is_custom', false)
      .eq('is_parallel', false)
      .order('sort_order', { ascending: true })

    destQuery = destination.kind === 'custom'
      ? destQuery.eq('custom_lane_id', destination.laneId)
      : dbSubType === null
        ? destQuery.is('sub_type', null).is('custom_lane_id', null)
        : destQuery.eq('sub_type', dbSubType).is('custom_lane_id', null)

    destQuery = deliverableId === null
      ? destQuery.is('deliverable_id', null)
      : destQuery.eq('deliverable_id', deliverableId)

    const { data: destRows, error: destError } = await destQuery
    if (destError) return { ok: false, error: 'Kunne ikke hente mållanen' }

    const destIds = (destRows ?? []).map((r: { id: string }) => r.id)
    const idsIncludingSubject = destIds.includes(taskId) ? destIds : [...destIds, taskId]
    const finalIds = reorderExistingIds(idsIncludingSubject, taskId, beforeTaskId)

    // Kilde-lanen (hvis annerledes) trenger ingen renummerering — gap i
    // sort_order er harmløst siden ordering alltid leses med ORDER BY.
    for (let i = 0; i < finalIds.length; i++) {
      const patch: Record<string, unknown> = { sort_order: i + 1 }
      if (finalIds[i] === taskId) {
        patch.is_parallel = false
        patch.custom_lane_id = destination.kind === 'custom' ? destination.laneId : null
        patch.sub_type = destination.kind === 'custom' ? null : dbSubType
        patch.deliverable_id = deliverableId
      }
      const { error } = await supabase.from('tasks').update(patch).eq('id', finalIds[i])
      if (error) return { ok: false, error: 'Kunne ikke oppdatere rekkefølgen' }
    }

    revalidatePath('/admin/preprod')
    revalidatePath('/admin/postprod')
    return { ok: true }
  } catch (err) {
    console.error('moveBoardTask unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function createCustomLane(
  projectId: string,
  name: string,
  color?: string
): Promise<{ ok: boolean; error?: string; laneId?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: 'Lane trenger et navn' }

    const { count } = await supabase
      .from('post_prod_lanes')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)

    const { data, error } = await supabase
      .from('post_prod_lanes')
      .insert({
        project_id: projectId,
        name: trimmed,
        color: color ?? null,
        sort_order: count ?? 0,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: 'Kunne ikke opprette lane' }

    revalidatePath('/admin/preprod')
    return { ok: true, laneId: data.id }
  } catch (err) {
    console.error('createCustomLane unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function updateLaneDeadline(laneId: string, deadline: string | null): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('post_prod_lanes').update({ deadline }).eq('id', laneId)
    revalidatePath('/admin/preprod')
  } catch (err) {
    console.error('updateLaneDeadline unexpected error:', err)
  }
}

export type PostProdLibraryItem = {
  id: string
  title: string
  description: string | null
  color: string | null
  icon: string | null
  laneType: 'video' | 'photo' | 'custom' | 'parallel'
  customLaneName: string | null
}

export async function getTaskLibrary(): Promise<PostProdLibraryItem[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('post_prod_task_library')
      .select('id, title, description, color, icon, lane_type, custom_lane_name')
      .order('created_at', { ascending: false })

    if (error) console.error('getTaskLibrary error:', error)

    return (data ?? []).map(
      (r: { id: string; title: string; description: string | null; color: string | null; icon: string | null; lane_type: 'video' | 'photo' | 'custom' | 'parallel'; custom_lane_name: string | null }) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        color: r.color,
        icon: r.icon,
        laneType: r.lane_type,
        customLaneName: r.custom_lane_name,
      })
    )
  } catch (err) {
    console.error('getTaskLibrary error:', err)
    return []
  }
}

/** Lagrer en allerede eksisterende oppgave i biblioteket (kopi av felter, ingen videre kobling). */
export async function addTaskToLibrary(taskId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, error: 'Ikke innlogget' }

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('title, description, color, icon, sub_type, custom_lane_id, is_parallel')
      .eq('id', taskId)
      .single()

    if (taskError) console.error('addTaskToLibrary task lookup error:', taskError)
    if (taskError || !task) return { ok: false, error: 'Fant ikke oppgaven' }

    let laneType: 'video' | 'photo' | 'custom' | 'parallel'
    let customLaneName: string | null = null

    if (task.is_parallel) {
      laneType = 'parallel'
    } else if (task.custom_lane_id) {
      laneType = 'custom'
      const { data: lane, error: laneError } = await supabase.from('post_prod_lanes').select('name').eq('id', task.custom_lane_id).single()
      if (laneError) console.error('addTaskToLibrary lane lookup error:', laneError)
      customLaneName = lane?.name ?? null
    } else {
      laneType = task.sub_type === 'photo' ? 'photo' : 'video'
    }

    const { error } = await supabase.from('post_prod_task_library').insert({
      created_by: user.id,
      title: task.title,
      description: task.description,
      color: task.color,
      icon: task.icon,
      lane_type: laneType,
      custom_lane_name: customLaneName,
    })

    if (error) {
      console.error('addTaskToLibrary insert error:', error)
      return { ok: false, error: 'Kunne ikke lagre i biblioteket' }
    }
    return { ok: true }
  } catch (err) {
    console.error('addTaskToLibrary unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}

export async function deleteTaskLibraryItem(itemId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('post_prod_task_library').delete().eq('id', itemId)
    if (error) {
      console.error('deleteTaskLibraryItem error:', error)
      return { ok: false, error: 'Kunne ikke slette' }
    }
    return { ok: true }
  } catch (err) {
    console.error('deleteTaskLibraryItem unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
