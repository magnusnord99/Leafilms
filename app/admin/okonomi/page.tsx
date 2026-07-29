'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { getQuoteAmountExclVat } from '@/lib/quote-builder-utils'
import { QuoteBuilderData, PipelineStage, PIPELINE_STAGES, PIPELINE_STAGE_LABELS_SHORT } from '@/lib/types'
import { C } from '@/lib/admin-theme'

const green = '#4CAF7D'
const amber = '#F0A429'
const blue  = '#4A9EFF'

type QuoteRow = {
  id: string
  status: string
  quote_data: QuoteBuilderData | null
  selected_addon_ids: string[] | null
  created_at: string
  is_current: boolean
}

type ProjectRow = {
  id: string
  title: string
  pipeline_stage: PipelineStage | null
  parent_project_id: string | null
  updated_at: string
  customers: { name: string } | null
  quotes: QuoteRow[]
}

type ProjectWithAmount = {
  id: string
  title: string
  customerName: string | null
  stage: PipelineStage | null
  amount: number | null
}

const POTENTIAL_STAGES: PipelineStage[] = ['lead', 'møte', 'tilbud_sendt', 'kontrakt']
const UPCOMING_STAGES: PipelineStage[] = ['pre_prod', 'produksjon', 'post_prod', 'levering']
const EARNED_STAGES: PipelineStage[] = ['fakturert', 'videresalg']

const STAGE_LABELS: Record<string, string> = PIPELINE_STAGE_LABELS_SHORT

const STAGE_INDEX: Record<string, number> = Object.fromEntries(
  PIPELINE_STAGES.map((s, i) => [s.value, i])
)

// Et signert/akseptert tilbud er det sterkeste signalet vi har — det vinner alltid, selv om
// en nyere kladd (f.eks. et tilleggstilbud for ekstraarbeid) senere har blitt "is_current"
// (satt automatisk hver gang en ny versjon lages, uavhengig av om den forrige var signert).
// Uten signert tilbud: fall tilbake på is_current (siden-brukeren har bevisst valgt denne),
// ellers nyeste opprettet — rekkefølgen quotes(...) kommer i fra Supabase er uansett ikke
// garantert stabil.
function pickBestQuote(quotes: QuoteRow[]): QuoteRow | null {
  const withData = quotes.filter(q => q.quote_data)
  if (!withData.length) return null
  const byRecency = (a: QuoteRow, b: QuoteRow) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  const accepted = withData.filter(q => q.status === 'accepted').sort(byRecency)
  if (accepted.length) return accepted[0]
  const current = withData.find(q => q.is_current)
  if (current) return current
  return withData.sort(byRecency)[0]
}

function getAmount(quote: QuoteRow | null): number | null {
  if (!quote?.quote_data) return null
  // Kundens avkryssede tillegg fra pitch-siden telles med, slik at beløpet her
  // matcher det kunden faktisk ser og signerer på.
  return getQuoteAmountExclVat(quote.quote_data, quote.selected_addon_ids ?? [])
}

function formatNok(amount: number): string {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(amount)
}

function StageBadge({ stage }: { stage: PipelineStage | null }) {
  if (!stage) return null
  return (
    <span style={{
      fontFamily: 'var(--font-dm-sans)',
      fontSize: '0.68rem',
      color: C.text3,
      background: C.surface2,
      border: `1px solid ${C.border}`,
      borderRadius: 4,
      padding: '2px 7px',
      letterSpacing: '0.03em',
    }}>
      {STAGE_LABELS[stage] ?? stage}
    </span>
  )
}

function SummaryCard({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: '20px 24px',
      flex: 1,
      minWidth: 0,
    }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, margin: 0, marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </p>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color, margin: 0 }}>
        {formatNok(amount)}
      </p>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, margin: 0, marginTop: 4 }}>
        eks. MVA
      </p>
    </div>
  )
}

function CashflowSection({
  title,
  projects,
  color,
  total,
}: {
  title: string
  projects: ProjectWithAmount[]
  color: string
  total: number
}) {
  return (
    <div style={{
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, background: color }} />
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 500, color: C.text }}>
            {title}
          </span>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
            {projects.length} {projects.length === 1 ? 'prosjekt' : 'prosjekter'}
          </span>
        </div>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color }}>
          {formatNok(total)}
        </span>
      </div>

      {projects.length === 0 ? (
        <div style={{ padding: '24px 20px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, margin: 0 }}>
            Ingen prosjekter
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {(['Prosjekt', 'Kunde', 'Stadium', 'Beløp eks. MVA'] as const).map((h, i) => (
                <th key={h} style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.68rem',
                  fontWeight: 500,
                  color: C.text3,
                  textAlign: i === 3 ? 'right' : 'left',
                  padding: '8px 20px',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {projects.map((p, idx) => (
              <tr
                key={p.id}
                style={{
                  borderBottom: idx < projects.length - 1 ? `1px solid ${C.border}` : 'none',
                }}
              >
                <td style={{ padding: '12px 20px' }}>
                  <Link
                    href={`/admin/projects/${p.id}`}
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text, textDecoration: 'none' }}
                  >
                    {p.title}
                  </Link>
                </td>
                <td style={{ padding: '12px 20px' }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>
                    {p.customerName ?? '—'}
                  </span>
                </td>
                <td style={{ padding: '12px 20px' }}>
                  <StageBadge stage={p.stage} />
                </td>
                <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: p.amount !== null ? C.text : C.text3 }}>
                    {p.amount !== null ? formatNok(p.amount) : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  )
}

export default function OkonomiPage() {
  const [loading, setLoading] = useState(true)
  const [potential, setPotential] = useState<ProjectWithAmount[]>([])
  const [upcoming, setUpcoming] = useState<ProjectWithAmount[]>([])
  const [earned, setEarned] = useState<ProjectWithAmount[]>([])

  async function fetchData() {
    const supabase = createClient()
    const { data } = await supabase
      .from('projects')
      .select('id, title, pipeline_stage, parent_project_id, updated_at, customers(name), quotes(id, status, quote_data, selected_addon_ids, created_at, is_current)')
      .neq('status', 'archived')
      .neq('status', 'lost')
      .order('created_at', { ascending: false })

    const allRows = (data ?? []) as unknown as ProjectRow[]

    // Grupper V1/V2/... av samme prosjekt til én rad — ellers telles samme avtale flere
    // ganger hvis en eldre versjon fortsatt henger igjen i et tidligere pipeline-steg mens
    // en nyere versjon har gått videre (samme gruppering som admin/projects/page.tsx).
    const byRoot = new Map<string, ProjectRow[]>()
    for (const p of allRows) {
      const rootId = p.parent_project_id ?? p.id
      const list = byRoot.get(rootId) ?? []
      list.push(p)
      byRoot.set(rootId, list)
    }
    const rows = Array.from(byRoot.values()).map(versions =>
      [...versions].sort((a, b) => {
        const stageDiff = (STAGE_INDEX[b.pipeline_stage ?? 'lead'] ?? 0) - (STAGE_INDEX[a.pipeline_stage ?? 'lead'] ?? 0)
        if (stageDiff !== 0) return stageDiff
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      })[0]
    )

    function toAmountRows(stages: PipelineStage[]): ProjectWithAmount[] {
      return rows
        .filter(p => p.pipeline_stage && stages.includes(p.pipeline_stage))
        .map(p => {
          const quote = pickBestQuote(p.quotes ?? [])
          return {
            id: p.id,
            title: p.title,
            customerName: p.customers?.name ?? null,
            stage: p.pipeline_stage,
            amount: getAmount(quote),
          }
        })
    }

    // Et prosjekt med et allerede signert tilbud kan i tillegg ha et NYERE, ikke-signert
    // tilleggstilbud (kunden ba om noe ekstra etter at hovedjobben var avtalt) — det signerte
    // beløpet ligger i sitt vanlige steg-basert bøtte (typisk Kommende/Inntjeninger), men
    // tilleggsbeløpet skal telle som Potensiell inntekt helt til DET også signeres, i stedet
    // for å stille erstatte det signerte beløpet (jf. Magnus 2026-07-23).
    const pendingAddonRows: ProjectWithAmount[] = []
    for (const p of rows) {
      if (!p.pipeline_stage) continue
      const quotes = p.quotes ?? []
      const primary = pickBestQuote(quotes)
      if (primary?.status !== 'accepted') continue
      const primaryCreatedAt = new Date(primary.created_at).getTime()
      // Kun kladder laget ETTER det signerte tilbudet telles som tilleggstilbud — en eldre,
      // forlatt kladd fra FØR signeringen (f.eks. en tidligere versjon som ble forkastet) er
      // ikke noe nytt kunden har bedt om i tillegg, bare historikk.
      const pendingAmount = quotes
        .filter(q => q.quote_data && q.id !== primary.id && q.status !== 'accepted' && new Date(q.created_at).getTime() > primaryCreatedAt)
        .reduce((sum, q) => sum + (getAmount(q) ?? 0), 0)
      if (pendingAmount > 0) {
        pendingAddonRows.push({
          id: `${p.id}-addon`,
          title: `${p.title} (tilleggstilbud)`,
          customerName: p.customers?.name ?? null,
          stage: p.pipeline_stage,
          amount: pendingAmount,
        })
      }
    }

    setPotential([...toAmountRows(POTENTIAL_STAGES), ...pendingAddonRows])
    setUpcoming(toAmountRows(UPCOMING_STAGES))
    setEarned(toAmountRows(EARNED_STAGES))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const sumOf = (rows: ProjectWithAmount[]) =>
    rows.reduce((acc, p) => acc + (p.amount ?? 0), 0)

  const potentialTotal = sumOf(potential)
  const upcomingTotal  = sumOf(upcoming)
  const earnedTotal    = sumOf(earned)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, letterSpacing: '0.08em' }}>
          Laster...
        </p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '32px 28px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.25rem', fontWeight: 600, color: C.text, margin: 0 }}>
            Økonomi
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, margin: '4px 0 0' }}>
            Cashflow-oversikt basert på prosjektstadium
          </p>
        </div>

        {/* Summary cards */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
          <SummaryCard label="Potensiell inntekt" amount={potentialTotal} color={amber} />
          <SummaryCard label="Kommende betalinger" amount={upcomingTotal} color={blue} />
          <SummaryCard label="Inntjeninger" amount={earnedTotal} color={green} />
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <CashflowSection title="Potensiell inntekt" projects={potential} color={amber} total={potentialTotal} />
          <CashflowSection title="Kommende betalinger" projects={upcoming} color={blue} total={upcomingTotal} />
          <CashflowSection title="Inntjeninger" projects={earned} color={green} total={earnedTotal} />
        </div>

      </div>
    </div>
  )
}
