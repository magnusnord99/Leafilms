// Delt URL-logikk for meldingstråder (prosjekt, oppgave, pre-prod, tilbud, produksjon,
// lead, e-post). Brukes av varsel-siden og av tråd-listen i Meldinger, slik at samme
// tråd alltid lenker til samme sted.

export type ThreadDescriptor =
  | { kind: 'project'; projectId: string }
  | { kind: 'task'; projectId: string; taskId: string; pipelineStage: 'pre_prod' | 'post_prod' | string | null }
  | { kind: 'preprod'; projectId: string }
  | { kind: 'quote'; projectId: string }
  | { kind: 'production'; projectId: string }
  | { kind: 'lead'; leadId: string }
  | { kind: 'email'; projectId: string }

export function getThreadHref(d: ThreadDescriptor): string {
  switch (d.kind) {
    case 'project':
      return `/admin/projects/${d.projectId}?chat=1`
    case 'task':
      // &chat=1 åpner det flytende oppgave-chat-panelet automatisk (samme mønster
      // som de øvrige melding-trådene) — uten dette valgte siden bare riktig oppgave.
      if (d.pipelineStage === 'post_prod') return `/admin/postprod/${d.projectId}?task=${d.taskId}&chat=1`
      if (d.pipelineStage === 'pre_prod') return `/admin/preprod/${d.projectId}?task=${d.taskId}`
      return `/admin/projects/${d.projectId}?task=${d.taskId}`
    case 'preprod':
      return `/admin/preprod/${d.projectId}?chat=1`
    case 'quote':
      return `/admin/projects/${d.projectId}/quote?chat=1`
    case 'production':
      return `/admin/produksjon/${d.projectId}?chat=1`
    case 'lead':
      return `/admin/leads/${d.leadId}?chat=1`
    case 'email':
      return `/admin/projects/${d.projectId}/email?chat=1`
  }
}
