import { PIPELINE_STAGES, type PipelineStage } from './types'

const STAGE_ORDER = PIPELINE_STAGES.map(s => s.value)

export type StageAccess = 'not_yet_reached' | 'current' | 'past'

/**
 * Klassifiserer en stegside i forhold til prosjektets faktiske pipeline_stage,
 * ut fra rekkefølgen i PIPELINE_STAGES. Brukt av de 5 stegsidene (kontakt,
 * preprod, produksjon, postprod, faktura) til å avgjøre om siden skal
 * blokkere helt, vise seg normalt, eller vise seg skrivebeskyttet.
 */
export function getStageAccess(pageStage: PipelineStage, projectStage: PipelineStage): StageAccess {
  const pageIdx = STAGE_ORDER.indexOf(pageStage)
  const projectIdx = STAGE_ORDER.indexOf(projectStage)
  if (projectIdx < pageIdx) return 'not_yet_reached'
  if (projectIdx > pageIdx) return 'past'
  return 'current'
}
