import type { createClient } from '@/lib/supabase-server'

// Post-prod-siden (app/admin/postprod/[id]/page.tsx) har en stepper der oppgaver innenfor
// samme prosjekt+sub_type må fullføres i rekkefølge (sort_order) — en oppgave er "aktiv" først
// når alle tidligere steg er ferdig. Den låsingen finnes kun som UI i post-prod-siden selv.
// Denne hjelperen gjør samme beregning tilgjengelig for flate oppgavelister utenfor post-prod
// (Mine oppgaver, Dagens plan), slik at de ikke lar brukeren starte et steg før sin tur.
// Kun is_custom=false-steg i post_prod deltar — egne/ad-hoc-oppgaver har ingen fast rekkefølge.

export type StepperLockInfo = { locked: boolean; blockedByTitle: string | null }

export type StepperTaskLite = {
  id: string
  project_id: string
  pipeline_stage: string
  sub_type: string | null
  sort_order: number
  is_custom: boolean
  status: string
  deliverable_id: string | null
  title?: string
}

/**
 * Ren beregning av stepper-lås ut fra en allerede innhentet liste med
 * søsken-oppgaver (samme prosjekt+sub_type, post_prod, is_custom=false).
 * Ingen DB-kall — kalles fra computeStepperLocks under, og fra
 * updateTaskStatus i lib/actions/pipeline.ts for å finne oppgaver som blir
 * ulåst når en oppgave settes til 'done' (for "din tur nå"-varsling).
 */
export function computeLocksFromSiblings(
  candidates: StepperTaskLite[],
  siblings: StepperTaskLite[]
): Map<string, StepperLockInfo> {
  const result = new Map<string, StepperLockInfo>()

  for (const task of candidates) {
    // Samme leveranse-skoperingsregel som resetTaskAndSubsequent/rejectFeedbackAndReset
    // i lib/actions/pipeline.ts: to oppgaver hører til samme "sekvens" hvis de har lik
    // deliverable_id, ELLER minst én av dem er delt (deliverable_id=NULL, f.eks. Logging/
    // Ferdig). Dette hindrer at et per-leveranse-steg i én leveranse blokkeres av et
    // ikke-ferdig steg i en ANNEN leveranse (som deler samme sort_order), samtidig som
    // delte steg fortsatt korrekt låser/låser opp per-leveranse-steg og andre delte steg.
    // For prosjekter med 0-1 video-leveranser er deliverable_id alltid NULL på begge sider,
    // så betingelsen er da alltid triviell sann — uendret oppførsel.
    const groupSiblings = siblings.filter(s =>
      s.project_id === task.project_id &&
      s.sub_type === task.sub_type &&
      (s.deliverable_id === task.deliverable_id || s.deliverable_id === null || task.deliverable_id === null)
    )
    const blocking = groupSiblings
      .filter(s => s.sort_order < task.sort_order && s.status !== 'done')
      .sort((a, b) => a.sort_order - b.sort_order)[0]

    result.set(task.id, { locked: !!blocking, blockedByTitle: blocking?.title ?? null })
  }

  return result
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
    .select('id, project_id, pipeline_stage, sub_type, sort_order, status, title, deliverable_id, is_custom')
    .in('project_id', projectIds)
    .eq('pipeline_stage', 'post_prod')
    .eq('is_custom', false)

  if (error || !siblings) {
    console.error('computeStepperLocks error:', error)
    return result
  }

  return computeLocksFromSiblings(candidates, siblings)
}
