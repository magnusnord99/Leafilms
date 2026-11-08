'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { PIPELINE_STAGE_LABELS_SHORT } from '@/lib/types'
import { C } from '@/lib/admin-theme'
import { WidgetHeader, Btn } from '../shared'

const PIPELINE_STAGE_COLORS: Record<string, string> = {
  lead: C.text3, møte: '#4A9AC4', tilbud_sendt: C.accent,
  kontrakt: C.success, pre_prod: '#F0A500', produksjon: '#F0A500',
  post_prod: '#F0A500', levering: '#E8A838', fakturert: C.success, videresalg: C.text2,
}
const STAGE_ORDER = ['lead', 'møte', 'tilbud_sendt', 'kontrakt', 'pre_prod', 'produksjon', 'post_prod', 'levering', 'fakturert', 'videresalg']

export default function PipelineWidget() {
  const [loading, setLoading] = useState(true)
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, number>>({})

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      const { data } = await supabase.from('projects').select('pipeline_stage').not('pipeline_stage', 'eq', 'lead').eq('is_package_template', false)
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        const stage = (row as { pipeline_stage: string }).pipeline_stage
        counts[stage] = (counts[stage] ?? 0) + 1
      }
      setPipelineCounts(counts)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const activeStages = Object.entries(pipelineCounts)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b))

  if (loading || activeStages.length === 0) return null

  return (
    <div>
      <WidgetHeader title="Pipeline" action={<Btn href="/admin/pipeline" variant="ghost">Åpne pipeline →</Btn>} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {activeStages.map(([stage, count]) => (
          <Link key={stage} href="/admin/pipeline" style={{ textDecoration: 'none' }}>
            <div
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'border-color 0.12s' }}
              onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.borderColor = C.hoverBorder}
              onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: PIPELINE_STAGE_COLORS[stage] ?? C.text3, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
                {PIPELINE_STAGE_LABELS_SHORT[stage as keyof typeof PIPELINE_STAGE_LABELS_SHORT] ?? stage}
              </span>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, color: C.text }}>
                {count}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
