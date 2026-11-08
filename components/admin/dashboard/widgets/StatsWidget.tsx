'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { C } from '@/lib/admin-theme'

const ACTIVE_STAGES = ['tilbud_sendt', 'møte', 'kontrakt', 'levering', 'videresalg']

export default function StatsWidget() {
  const [loading, setLoading] = useState(true)
  const [totalProjects, setTotalProjects] = useState(0)
  const [activeInPipeline, setActiveInPipeline] = useState(0)
  const [customerCount, setCustomerCount] = useState(0)
  const [emailFollowUpCount, setEmailFollowUpCount] = useState(0)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      const [totalResult, pipelineResult, customersResult, activeProjectsResult] = await Promise.all([
        supabase.from('projects').select('*', { count: 'exact', head: true }),
        supabase.from('projects').select('*', { count: 'exact', head: true }).not('pipeline_stage', 'eq', 'lead'),
        supabase.from('customers').select('*', { count: 'exact', head: true }),
        supabase.from('projects').select('id').in('pipeline_stage', ACTIVE_STAGES),
      ])

      setTotalProjects(totalResult.count ?? 0)
      setActiveInPipeline(pipelineResult.count ?? 0)
      setCustomerCount(customersResult.count ?? 0)

      const activeIds = (activeProjectsResult.data ?? []).map((p) => (p as { id: string }).id)
      if (activeIds.length > 0) {
        const { data: emailLogs } = await supabase
          .from('email_log')
          .select('project_id, sent_at')
          .in('project_id', activeIds)
          .order('sent_at', { ascending: true })

        const logsByProject = new Map<string, string>()
        for (const row of emailLogs ?? []) {
          const r = row as { project_id: string; sent_at: string }
          logsByProject.set(r.project_id, r.sent_at)
        }
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
        const needsFollowUp = activeIds.filter((id) => {
          const lastSent = logsByProject.get(id)
          return !lastSent || new Date(lastSent).getTime() < sevenDaysAgo
        }).length
        setEmailFollowUpCount(needsFollowUp)
      } else {
        setEmailFollowUpCount(0)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div style={{ height: 76 }} />

  const stats = [
    { label: 'Prosjekter', value: totalProjects, href: '/admin/projects', highlight: false },
    { label: 'Aktive i pipeline', value: activeInPipeline, href: '/admin/pipeline', highlight: false },
    { label: 'Kunder', value: customerCount, href: '/admin/customers', highlight: false },
    { label: 'E-post oppfølging', value: emailFollowUpCount, href: '/admin/email', highlight: emailFollowUpCount > 0 },
  ]

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
      {stats.map((s) => (
        <Link key={s.label} href={s.href} style={{ textDecoration: 'none' }}>
          <div
            style={{ background: C.surface, border: `1px solid ${s.highlight ? 'rgba(124,92,252,0.4)' : C.border}`, borderRadius: 8, padding: '16px 20px', cursor: 'pointer', transition: 'border-color 0.12s' }}
            onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.borderColor = C.hoverBorder}
            onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.borderColor = (s.highlight ? 'rgba(124,92,252,0.4)' : C.border)}
          >
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.6rem', fontWeight: 600, color: s.highlight ? C.accent : C.text, lineHeight: 1, marginBottom: 4 }}>{s.value}</p>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>{s.label}</p>
          </div>
        </Link>
      ))}
    </div>
  )
}
