import type { PipelineStage } from './types'

// Samme steg-til-rute-mapping som brukes på handlingsknappene i BoardView
// (se "Pre-prod →"/"Post-prod →" osv. i app/admin/projects/BoardView.tsx),
// delt her slik at dashboard-widgets kan lenke rett inn i steget et prosjekt er i.
export function getStageHref(projectId: string, stage: PipelineStage | string | undefined): string {
  switch (stage) {
    case 'lead': return `/admin/projects/${projectId}/contact`
    case 'møte': return `/admin/projects/${projectId}/email`
    case 'tilbud_sendt': return `/admin/projects/${projectId}?tab=pitch`
    case 'kontrakt': return `/admin/projects/${projectId}?tab=kontrakt`
    case 'pre_prod': return `/admin/preprod/${projectId}`
    case 'produksjon': return `/admin/produksjon/${projectId}`
    case 'post_prod': return `/admin/postprod/${projectId}`
    case 'levering': return `/admin/projects/${projectId}/email`
    case 'fakturert': return `/admin/faktura/${projectId}`
    case 'videresalg': return `/admin/projects/${projectId}/email`
    default: return `/admin/projects/${projectId}`
  }
}

export function getStageLabel(stage: PipelineStage | string | undefined): string {
  switch (stage) {
    case 'pre_prod': return 'Pre-prod →'
    case 'produksjon': return 'Produksjon →'
    case 'post_prod': return 'Post-prod →'
    case 'levering': return 'Levering →'
    case 'fakturert': return 'Fakturering →'
    case 'videresalg': return 'Videresalg →'
    case 'tilbud_sendt': return 'Tilbud →'
    case 'kontrakt': return 'Kontrakt →'
    case 'møte': return 'Møte →'
    default: return 'Oversikt'
  }
}
