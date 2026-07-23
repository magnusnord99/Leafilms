import type { createClient } from '@/lib/supabase-server'

// Post-prod-siden (app/admin/postprod/[id]/page.tsx) har en stepper der oppgaver innenfor
// samme prosjekt+sub_type må fullføres i rekkefølge (sort_order) — en oppgave er "aktiv" først
// når alle tidligere steg er ferdig. Den låsingen finnes kun som UI i post-prod-siden selv.
// Denne hjelperen gjør samme beregning tilgjengelig for flate oppgavelister utenfor post-prod
// (Mine oppgaver, Dagens plan), slik at de ikke lar brukeren starte et steg før sin tur.
// Kun is_custom=false-steg i post_prod deltar — egne/ad-hoc-oppgaver har ingen fast rekkefølge.

export type StepperLockInfo = { locked: boolean; blockedByTitle: string | null }

type StepperTaskLite = {
  id: string
  project_id: string
  pipeline_stage: string
  sub_type: string | null
  sort_order: number
  is_custom: boolean
  status: string
}

export async function computeStepperLocks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tasks: StepperTaskLite[]
): Promise<Map<string, StepperLockInfo>> {
  const candidates = tasks.filter(t => t.pipeline_stage === 'post_prod' && !t.is_custom)
  const result = new Map<string, StepperLockInfo>()
  if (candidates.length === 0) return result

  const projectIds = Array.from(new Set(candidates.map(t => t.project_id)))

  const { data: siblings, error } = await supabase
    .from('tasks')
    .select('project_id, sub_type, sort_order, status, title')
    .in('project_id', projectIds)
    .eq('pipeline_stage', 'post_prod')
    .eq('is_custom', false)

  if (error || !siblings) {
    console.error('computeStepperLocks error:', error)
    return result
  }

  for (const task of candidates) {
    const groupSiblings = siblings.filter(s => s.project_id === task.project_id && s.sub_type === task.sub_type)
    const blocking = groupSiblings
      .filter(s => s.sort_order < task.sort_order && s.status !== 'done')
      .sort((a, b) => a.sort_order - b.sort_order)[0]

    result.set(task.id, { locked: !!blocking, blockedByTitle: blocking?.title ?? null })
  }

  return result
}
