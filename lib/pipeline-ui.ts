// Delte fargemappinger for pipeline-stegene, brukt av både board- og listevisningen
// i /admin/projects — så de to visningene alltid fargekoder de samme 10 stegene likt.

import { PIPELINE_STAGES, PipelineStage } from './types'
import { C } from './admin-theme'

export const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  PIPELINE_STAGES.map(s => [s.value, s.label])
)

// Gruppe 1: Lead → Tilbud (før kontrakt) — stålblå
// Gruppe 2: Kontrakt → Produksjon — gull
// Gruppe 3: Post & Levering — lilla
// Gruppe 4: Fakturert & Videresalg — grønn
export const STAGE_ACCENT: Record<PipelineStage, string> = {
  lead:          '#4A8FA8',
  møte:          '#4A8FA8',
  tilbud_sendt:  '#4A8FA8',
  kontrakt:      C.accent,
  pre_prod:      C.accent,
  produksjon:    C.accent,
  post_prod:     '#7C5CFC',
  levering:      '#7C5CFC',
  fakturert:     '#4CAF7D',
  videresalg:    '#4CAF7D',
}

export type StageGroup = 'salg' | 'produksjon' | 'post' | 'fullført'

export const STAGE_GROUP: Record<PipelineStage, StageGroup> = {
  lead: 'salg', møte: 'salg', tilbud_sendt: 'salg',
  kontrakt: 'produksjon', pre_prod: 'produksjon', produksjon: 'produksjon',
  post_prod: 'post', levering: 'post',
  fakturert: 'fullført', videresalg: 'fullført',
}

export const GROUP_COLOR: Record<StageGroup, string> = {
  salg: '#4A8FA8',
  produksjon: '#F0A500',
  post: '#7C5CFC',
  fullført: '#4CAF7D',
}

export const GROUP_FILTERS: { value: StageGroup; label: string }[] = [
  { value: 'salg', label: 'Salg' },
  { value: 'produksjon', label: 'Produksjon' },
  { value: 'post', label: 'Post & levering' },
  { value: 'fullført', label: 'Fullført' },
]

// Hvor et prosjektkort skal lenke til når man klikker inn på det — samme steg-spesifikke
// destinasjon uansett om man kommer fra board- eller listevisningen.
export function getStageHref(projectId: string, stage: PipelineStage | null | undefined): string {
  switch (stage) {
    case 'lead':         return `/admin/projects/${projectId}/contact`
    case 'møte':         return `/admin/projects/${projectId}/email`
    case 'tilbud_sendt':  return `/admin/projects/${projectId}?tab=pitch`
    case 'kontrakt':      return `/admin/projects/${projectId}?tab=kontrakt`
    case 'pre_prod':      return `/admin/preprod/${projectId}`
    case 'produksjon':    return `/admin/produksjon/${projectId}`
    case 'post_prod':     return `/admin/postprod/${projectId}`
    case 'levering':      return `/admin/projects/${projectId}/email`
    case 'fakturert':     return `/admin/faktura/${projectId}`
    case 'videresalg':    return `/admin/projects/${projectId}/email`
    default:              return `/admin/projects/${projectId}`
  }
}
