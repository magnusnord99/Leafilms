'use client'

import Link from 'next/link'
import { PIPELINE_STAGES, type PipelineStage } from '@/lib/types'

const C = {
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
}

// Snarveier fra stepperen til stadier med egen side, slik at man kan hoppe rett
// til f.eks. postprod uten å måtte finne prosjektet igjen via sidemenyen (feedback e5ecec91).
// Kun stadier prosjektet allerede har nådd (isPast || isCurrent) er klikkbare.
function stageHref(stage: PipelineStage, projectId: string): string | null {
  switch (stage) {
    case 'tilbud_sendt': return `/admin/projects/${projectId}/quote`
    case 'pre_prod': return `/admin/preprod/${projectId}`
    case 'produksjon': return `/admin/produksjon/${projectId}`
    case 'post_prod': return `/admin/postprod/${projectId}`
    default: return null
  }
}

// Delt mellom prosjektoversikten og de enkelte steg-sidene (pre-prod,
// produksjon, post-prod, faktura, kontakt) — samme stepper overalt gjør det
// enkelt å bla mellom stegene uten å måtte om via prosjektoversikten hver
// gang. Fullførte og nåværende steg er skrivebeskyttet-visbare (se
// lib/pipeline-stage-lock.ts), så det er trygt å la dem være klikkbare her.
export function PipelineProgress({
  currentStage, projectId, onGoToTab,
}: {
  currentStage: PipelineStage
  projectId: string
  // Kun prosjektoversikten selv har en lokal "Kontrakt"-fane å bytte til uten
  // full navigasjon — andre sider lenker til ?tab=kontrakt der i stedet.
  onGoToTab?: (tab: 'kontrakt') => void
}) {
  const currentIndex = PIPELINE_STAGES.findIndex(s => s.value === currentStage)
  return (
    <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', gap: 0 }}>
      {PIPELINE_STAGES.map((stage, i) => {
        const isPast = i < currentIndex
        const isCurrent = i === currentIndex
        const reached = isPast || isCurrent
        const href = reached
          ? (stage.value === 'kontrakt' && !onGoToTab ? `/admin/projects/${projectId}?tab=kontrakt` : stageHref(stage.value, projectId))
          : null
        const isKontrakt = reached && stage.value === 'kontrakt' && !!onGoToTab
        const dot = (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: isCurrent ? 10 : 7,
              height: isCurrent ? 10 : 7,
              borderRadius: '50%',
              background: isPast ? C.accent : isCurrent ? C.accent : C.surface2,
              border: isCurrent ? `2px solid rgba(124,92,252,0.4)` : 'none',
              boxShadow: isCurrent ? '0 0 8px rgba(124,92,252,0.4)' : 'none',
            }} />
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.5rem', color: isCurrent ? C.accent : isPast ? C.text3 : C.text3, whiteSpace: 'nowrap', fontWeight: isCurrent ? 600 : 400, opacity: isCurrent ? 1 : isPast ? 0.7 : 0.4 }}>
              {stage.label}
            </span>
          </div>
        )
        return (
          <div key={stage.value} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {i > 0 && (
              <div style={{ width: 18, height: 1, background: isPast || isCurrent ? C.accent : C.border }} />
            )}
            {isKontrakt ? (
              <button
                type="button"
                onClick={() => onGoToTab?.('kontrakt')}
                title={`Gå til ${stage.label}`}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                {dot}
              </button>
            ) : href ? (
              <Link href={href} title={`Gå til ${stage.label}`} style={{ textDecoration: 'none', cursor: 'pointer' }}>
                {dot}
              </Link>
            ) : dot}
          </div>
        )
      })}
    </div>
  )
}
