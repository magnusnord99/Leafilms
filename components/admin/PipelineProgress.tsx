'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { PIPELINE_STAGES, type PipelineStage } from '@/lib/types'

const C = {
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.12)',
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
  currentStage, projectId, onGoToTab, viewingStage,
}: {
  currentStage: PipelineStage
  projectId: string
  // Kun prosjektoversikten selv har en lokal "Kontrakt"-fane å bytte til uten
  // full navigasjon — andre sider lenker til ?tab=kontrakt der i stedet.
  onGoToTab?: (tab: 'kontrakt') => void
  // Stadiet som faktisk vises på DENNE siden — skiller seg fra currentStage
  // (prosjektets reelle fremdrift) når man har navigert tilbake for å se et
  // tidligere steg. Uten dette var det ingenting i menyen som viste hvilket
  // steg man sto på (feedback a4641f7f). Defaulter til currentStage for
  // sider som ikke er knyttet til ett bestemt steg (prosjektoversikten).
  viewingStage?: PipelineStage
}) {
  const currentIndex = PIPELINE_STAGES.findIndex(s => s.value === currentStage)
  const viewingIndex = viewingStage ? PIPELINE_STAGES.findIndex(s => s.value === viewingStage) : currentIndex
  const viewingRef = useRef<HTMLDivElement>(null)

  // Containeren er ofte smalere enn alle 10 stegene til sammen (f.eks. 560px på
  // faktura-siden) — uten dette kunne "er her"-steget havne utenfor synlig
  // område med ingen synlig indikasjon på at man må scrolle for å finne det.
  useEffect(() => {
    viewingRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [viewingIndex])

  return (
    <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', gap: 0 }}>
      {PIPELINE_STAGES.map((stage, i) => {
        const isPast = i < currentIndex
        const isCurrent = i === currentIndex
        const isViewing = i === viewingIndex
        const reached = isPast || isCurrent
        const href = reached
          ? (stage.value === 'kontrakt' && !onGoToTab ? `/admin/projects/${projectId}?tab=kontrakt` : stageHref(stage.value, projectId))
          : null
        const isKontrakt = reached && stage.value === 'kontrakt' && !!onGoToTab
        // "Er her"-fremheving (isViewing) er en egen visuell kanal fra fremdrift
        // (isPast/isCurrent, som styrer farge på prikk/linje) — de kan avvike når
        // man har navigert tilbake for å se et tidligere steg enn prosjektets
        // faktiske stadium.
        const dot = (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '3px 7px', borderRadius: 8,
            background: isViewing ? C.accentBg : 'transparent',
            transition: 'background 0.12s',
          }}>
            <div style={{
              width: isViewing ? 10 : 7,
              height: isViewing ? 10 : 7,
              borderRadius: '50%',
              background: isPast || isCurrent ? C.accent : C.surface2,
              border: isViewing ? `2px solid rgba(124,92,252,0.4)` : 'none',
              boxShadow: isViewing ? '0 0 8px rgba(124,92,252,0.4)' : 'none',
            }} />
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.5rem', color: isViewing ? C.accent : C.text3, whiteSpace: 'nowrap', fontWeight: isViewing ? 600 : 400, opacity: isViewing ? 1 : isPast || isCurrent ? 0.7 : 0.4 }}>
              {stage.label}
            </span>
          </div>
        )
        return (
          <div key={stage.value} ref={isViewing ? viewingRef : undefined} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {i > 0 && (
              <div style={{ width: 18, height: 1, background: isPast || isCurrent ? C.accent : C.border }} />
            )}
            {isKontrakt ? (
              <button
                type="button"
                onClick={() => onGoToTab?.('kontrakt')}
                title={`Gå til ${stage.label}`}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                onMouseEnter={e => { if (!isViewing) (e.currentTarget.firstChild as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { if (!isViewing) (e.currentTarget.firstChild as HTMLDivElement).style.background = 'transparent' }}
              >
                {dot}
              </button>
            ) : href ? (
              <Link
                href={href}
                title={`Gå til ${stage.label}`}
                style={{ textDecoration: 'none', cursor: 'pointer', display: 'inline-block' }}
                onMouseEnter={e => { if (!isViewing) (e.currentTarget.firstChild as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)' }}
                onMouseLeave={e => { if (!isViewing) (e.currentTarget.firstChild as HTMLDivElement).style.background = 'transparent' }}
              >
                {dot}
              </Link>
            ) : dot}
          </div>
        )
      })}
    </div>
  )
}
