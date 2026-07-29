// Deler flere pitch-versjoner av samme prosjekt (koblet via parent_project_id) inn i grupper,
// og plukker ut hvilken versjon som representerer gruppen. Brukt av både liste- og
// board-visningen i /admin/projects slik at de alltid viser samme "ett kort per prosjekt".

import { PIPELINE_STAGES, PipelineStage } from './types'

export const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  PIPELINE_STAGES.map((s, i) => [s.value, i])
)

type Versioned = {
  id: string
  parent_project_id?: string | null
  pipeline_stage?: PipelineStage | null
  updated_at: string
}

export function groupByProjectRoot<T extends Versioned>(rows: T[]): Map<string, T[]> {
  const byRoot = new Map<string, T[]>()
  for (const row of rows) {
    const rootId = row.parent_project_id ?? row.id
    const list = byRoot.get(rootId) ?? []
    list.push(row)
    byRoot.set(rootId, list)
  }
  return byRoot
}

// Representativ versjon = den som har kommet lengst i pipelinen (nyeste ved likt steg).
export function pickRepresentativeVersion<T extends Versioned>(versions: T[]): T {
  return [...versions].sort((a, b) => {
    const stageDiff = (STAGE_INDEX[b.pipeline_stage ?? 'lead'] ?? 0) - (STAGE_INDEX[a.pipeline_stage ?? 'lead'] ?? 0)
    if (stageDiff !== 0) return stageDiff
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  })[0]
}
