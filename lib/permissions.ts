// Sentral definisjon av hva de ulike interne rollene har tilgang til.
// 'customer' er egen rolle for kunde-brukere på /p/*-sider og har aldri tilgang til /admin —
// håndteres separat i middleware/auth-callback, ikke her.

import type { PipelineStage } from './types'

export type StaffRole = 'admin' | 'sales' | 'production'

export const STAFF_ROLES: StaffRole[] = ['admin', 'sales', 'production']

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role === 'admin' || role === 'sales' || role === 'production'
}

// Hvilke pipeline-steg hver rolle har tilgang til. Admin har alltid tilgang til alt (sjekkes
// separat i isStageAllowed) — denne mappingen gjelder kun sales/production.
const ROLE_ALLOWED_STAGES: Record<'sales' | 'production', PipelineStage[]> = {
  sales: ['lead', 'møte', 'tilbud_sendt', 'kontrakt', 'videresalg'],
  production: ['pre_prod', 'produksjon', 'post_prod'],
}

export function isStageAllowed(role: StaffRole, stage: PipelineStage | null | undefined): boolean {
  if (role === 'admin') return true
  if (!stage) return true
  return ROLE_ALLOWED_STAGES[role].includes(stage)
}

export function allowedStagesForRole(role: StaffRole): PipelineStage[] | null {
  return role === 'admin' ? null : ROLE_ALLOWED_STAGES[role]
}

// Kolonneplan for pipeline-kanbanen (app/admin/pipeline) — steg rollen ikke har tilgang til
// slås sammen til én sammenhengende, låst blokk i stedet for å vises som egne kolonner eller
// fjernes helt. Prosjekter blir dermed synlige (antall) men ikke interagerbare før de flyttes
// ut av blokken og inn i et steg rollen faktisk har tilgang til.
export type PipelineColumnPlanEntry =
  | { type: 'stage'; stage: PipelineStage }
  | { type: 'locked'; label: string; stages: PipelineStage[] }

function lockedBlockLabel(stages: PipelineStage[]): string {
  return stages.some((s) => s === 'pre_prod' || s === 'produksjon' || s === 'post_prod') ? 'Produksjon' : 'Salg'
}

export function buildPipelineColumnPlan(role: StaffRole, orderedStages: PipelineStage[]): PipelineColumnPlanEntry[] {
  if (role === 'admin') return orderedStages.map((stage) => ({ type: 'stage', stage }))

  const plan: PipelineColumnPlanEntry[] = []
  let lockedRun: PipelineStage[] = []
  const flushLocked = () => {
    if (lockedRun.length === 0) return
    plan.push({ type: 'locked', label: lockedBlockLabel(lockedRun), stages: lockedRun })
    lockedRun = []
  }

  for (const stage of orderedStages) {
    if (isStageAllowed(role, stage)) {
      flushLocked()
      plan.push({ type: 'stage', stage })
    } else {
      lockedRun.push(stage)
    }
  }
  flushLocked()
  return plan
}

// Sti-prefikser koblet til samme rollebegrensning som menygruppene i app/admin/layout.tsx —
// brukes til å håndheve tilgangen ved direkte URL-navigasjon forbi menyfiltreringen (menyen
// skjuler kun lenken, dette er det som faktisk stopper besøket).
const PATH_ROLE_PREFIXES: { prefix: string; roles: StaffRole[] }[] = [
  { prefix: '/admin/okonomi', roles: ['admin'] },
  { prefix: '/admin/prices', roles: ['admin'] },
  { prefix: '/admin/market-analysis', roles: ['admin'] },
  { prefix: '/admin/users', roles: ['admin'] },
  { prefix: '/admin/leads', roles: ['admin', 'sales'] },
  { prefix: '/admin/pipeline', roles: ['admin', 'sales', 'production'] },
  { prefix: '/admin/pitches', roles: ['admin', 'sales'] },
  { prefix: '/admin/tapte', roles: ['admin', 'sales'] },
  { prefix: '/admin/customers', roles: ['admin', 'sales'] },
  { prefix: '/admin/email', roles: ['admin', 'sales'] },
  { prefix: '/admin/calendar', roles: ['admin', 'production'] },
  { prefix: '/admin/preprod', roles: ['admin', 'production'] },
  { prefix: '/admin/boards', roles: ['admin', 'production'] },
  { prefix: '/admin/produksjon', roles: ['admin', 'production'] },
  { prefix: '/admin/postprod', roles: ['admin', 'production'] },
  { prefix: '/admin/selections', roles: ['admin', 'production'] },
  { prefix: '/admin/transfers', roles: ['admin', 'production'] },
]

export function isPathAllowedForRole(role: StaffRole, pathname: string): boolean {
  if (role === 'admin') return true
  const match = PATH_ROLE_PREFIXES.find((p) => pathname.startsWith(p.prefix))
  return match ? match.roles.includes(role) : true
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  admin: 'Admin',
  sales: 'Salg',
  production: 'Produksjon',
}
