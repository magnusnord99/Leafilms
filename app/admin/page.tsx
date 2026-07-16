'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { Badge } from '@/components/ui'
import { Project, Customer, MarketAnalysis, PIPELINE_STAGE_LABELS_SHORT } from '@/lib/types'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  success:  '#4CAF7D',
  danger:   '#E05555',
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 32 }}>
      <div>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, lineHeight: 1.2, marginBottom: subtitle ? 4 : 0 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  )
}

function Btn({ href, onClick, children, variant = 'primary', size = 'sm' }: {
  href?: string
  onClick?: () => void
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}) {
  const styles: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: size === 'sm' ? '0.75rem' : '0.8rem',
    fontWeight: 500,
    padding: size === 'sm' ? '6px 12px' : '8px 16px',
    borderRadius: 6,
    cursor: 'pointer',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    textDecoration: 'none',
    transition: 'opacity 0.12s',
    ...(variant === 'primary' && { background: C.accent, color: '#fff' }),
    ...(variant === 'secondary' && { background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }),
    ...(variant === 'ghost' && { background: 'transparent', color: C.text3 }),
    ...(variant === 'danger' && { background: 'transparent', color: C.danger }),
  }
  if (href) return <Link href={href} style={styles}>{children}</Link>
  return <button onClick={onClick} style={styles}>{children}</button>
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true)
  const [recentProjects, setRecentProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({})
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({})
  const [totalProjects, setTotalProjects] = useState(0)
  const [latestAnalysis, setLatestAnalysis] = useState<MarketAnalysis | null>(null)
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, number>>({})
  const [emailFollowUpCount, setEmailFollowUpCount] = useState(0)

  useEffect(() => {
    fetchData()
    fetch('/api/market-analysis').then(r => r.json()).then(({ analysis }) => {
      if (analysis) setLatestAnalysis(analysis)
    }).catch(() => {})
  }, [])

  async function fetchData() {
    try {
      const [totalResult, projectsResult, customersResult, pipelineResult, emailLogsResult] = await Promise.all([
        supabase.from('projects').select('*', { count: 'exact', head: true }),
        supabase.from('projects').select('id, title, status, pipeline_stage, client_name, updated_at, parent_project_id, version_number').order('updated_at', { ascending: false }).limit(5),
        supabase.from('customers').select('id, name, company, email, phone, customer_number').order('name', { ascending: true }),
        supabase.from('projects').select('pipeline_stage').not('pipeline_stage', 'eq', 'lead'),
        supabase.from('email_log').select('project_id, sent_at').order('sent_at', { ascending: true }),
      ])

      setTotalProjects(totalResult.count ?? 0)

      const projects = (projectsResult.data || []) as Project[]
      setRecentProjects(projects)

      const publishedIds = projects.filter(p => p.status === 'published').map(p => p.id)
      if (publishedIds.length > 0) {
        const { data: sharesData } = await supabase.from('project_shares').select('project_id, token').in('project_id', publishedIds)
        if (sharesData) {
          const links: Record<string, string> = {}
          sharesData.forEach(s => { links[s.project_id] = `${window.location.origin}/p/${s.token}` })
          setShareLinks(links)
        }
      }

      // Pipeline counts per stage
      const stageCounts: Record<string, number> = {}
      for (const row of pipelineResult.data ?? []) {
        const stage = (row as { pipeline_stage: string }).pipeline_stage
        stageCounts[stage] = (stageCounts[stage] ?? 0) + 1
      }
      setPipelineCounts(stageCounts)

      // Email follow-up: projects in active stages with no email in last 7 days
      const ACTIVE_STAGES = ['tilbud_sendt', 'møte', 'kontrakt', 'levering', 'videresalg']
      const { data: activeProjects } = await supabase
        .from('projects')
        .select('id')
        .in('pipeline_stage', ACTIVE_STAGES)
      const logsByProject = new Map<string, string>()
      for (const row of emailLogsResult.data ?? []) {
        const r = row as { project_id: string; sent_at: string }
        logsByProject.set(r.project_id, r.sent_at)
      }
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const needsFollowUp = (activeProjects ?? []).filter(p => {
        const lastSent = logsByProject.get((p as { id: string }).id)
        return !lastSent || new Date(lastSent).getTime() < sevenDaysAgo
      }).length
      setEmailFollowUpCount(needsFollowUp)

      const customerList = (customersResult.data || []) as Customer[]
      setCustomers(customerList)

      const customerIds = customerList.map(c => c.id)
      if (customerIds.length > 0) {
        const { data: countsData } = await supabase.from('projects').select('customer_id').in('customer_id', customerIds)
        if (countsData) {
          const counts: Record<string, number> = {}
          countsData.forEach(p => { if (p.customer_id) counts[p.customer_id] = (counts[p.customer_id] || 0) + 1 })
          setProjectCounts(counts)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(projectId: string, projectTitle: string) {
    if (!confirm(`Slett "${projectTitle}"? Dette kan ikke angres.`)) return
    try {
      await supabase.from('projects').delete().eq('id', projectId)
      fetchData()
    } catch (err) { console.error(err) }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  const stats = [
    { label: 'Prosjekter',         value: totalProjects,                  href: '/admin/projects'  },
    { label: 'Aktive i pipeline',  value: Object.values(pipelineCounts).reduce((a, b) => a + b, 0), href: '/admin/pipeline' },
    { label: 'Kunder',             value: customers.length,               href: '/admin/customers' },
    { label: 'E-post oppfølging',  value: emailFollowUpCount,             href: '/admin/email', highlight: emailFollowUpCount > 0 },
  ]

  const PIPELINE_STAGE_LABELS: Record<string, string> = PIPELINE_STAGE_LABELS_SHORT
  const PIPELINE_STAGE_COLORS: Record<string, string> = {
    lead: C.text3, møte: '#4A9AC4', tilbud_sendt: C.accent,
    kontrakt: C.success, pre_prod: '#F0A500', produksjon: '#F0A500',
    post_prod: '#F0A500', levering: '#E8A838', fakturert: C.success, videresalg: C.text2,
  }
  const activePipelineStages = Object.entries(pipelineCounts)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => {
      const order = ['lead', 'møte', 'tilbud_sendt', 'kontrakt', 'pre_prod', 'produksjon', 'post_prod', 'levering', 'fakturert', 'videresalg']
      return order.indexOf(a) - order.indexOf(b)
    })

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        <PageHeader
          title="Dashboard"
          action={<Btn href="/admin/projects/new">+ Nytt prosjekt</Btn>}
        />

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
          {stats.map(s => (
            <Link key={s.label} href={s.href} style={{ textDecoration: 'none' }}>
              <div
                style={{ background: C.surface, border: `1px solid ${'highlight' in s && s.highlight ? 'rgba(124,92,252,0.4)' : C.border}`, borderRadius: 8, padding: '16px 20px', cursor: 'pointer', transition: 'border-color 0.12s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#3D3D4E'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = ('highlight' in s && s.highlight ? 'rgba(124,92,252,0.4)' : C.border)}
              >
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.6rem', fontWeight: 600, color: 'highlight' in s && s.highlight ? C.accent : C.text, lineHeight: 1, marginBottom: 4 }}>{s.value}</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>{s.label}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Pipeline-oversikt */}
        {activePipelineStages.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pipeline
              </h2>
              <Btn href="/admin/pipeline" variant="ghost">Åpne pipeline →</Btn>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {activePipelineStages.map(([stage, count]) => (
                <Link key={stage} href="/admin/pipeline" style={{ textDecoration: 'none' }}>
                  <div style={{
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: 'pointer',
                    transition: 'border-color 0.12s',
                  }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#3D3D4E'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: PIPELINE_STAGE_COLORS[stage] ?? C.text3,
                      flexShrink: 0,
                    }} />
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
                      {PIPELINE_STAGE_LABELS[stage] ?? stage}
                    </span>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, color: C.text }}>
                      {count}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent projects */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Siste prosjekter
            </h2>
            <Btn href="/admin/projects" variant="ghost">Se alle →</Btn>
          </div>

          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
            {recentProjects.length === 0 ? (
              <div style={{ padding: '40px 24px', textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>Ingen prosjekter ennå</p>
                <Btn href="/admin/projects/new">Opprett første prosjekt</Btn>
              </div>
            ) : (
              recentProjects.map((project, i) => (
                <div
                  key={project.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '12px 16px',
                    background: C.surface,
                    borderBottom: i < recentProjects.length - 1 ? `1px solid ${C.border}` : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                  onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = C.surface}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text }}>
                        {project.title}
                      </p>
                      <Badge variant={project.status as 'draft' | 'published' | 'archived'}>
                        {project.status === 'published' ? 'Publisert' : project.status === 'archived' ? 'Arkivert' : 'Utkast'}
                      </Badge>
                      {(project as Project & { pipeline_stage?: string }).pipeline_stage && (project as Project & { pipeline_stage?: string }).pipeline_stage !== 'lead' && (
                        <span style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 500,
                          color: PIPELINE_STAGE_COLORS[(project as Project & { pipeline_stage?: string }).pipeline_stage!] ?? C.text3,
                          background: `${PIPELINE_STAGE_COLORS[(project as Project & { pipeline_stage?: string }).pipeline_stage!] ?? C.text3}18`,
                          padding: '1px 7px', borderRadius: 4,
                        }}>
                          {PIPELINE_STAGE_LABELS[(project as Project & { pipeline_stage?: string }).pipeline_stage!] ?? (project as Project & { pipeline_stage?: string }).pipeline_stage}
                        </span>
                      )}
                    </div>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
                      {new Date(project.updated_at).toLocaleDateString('nb-NO')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Btn href={`/admin/projects/${project.id}`}>Oversikt</Btn>
                    <Btn href={`/admin/projects/${project.id}/edit`} variant="secondary">Pitch</Btn>
                    {shareLinks[project.id] ? (
                      <Btn variant="ghost" onClick={() => window.open(shareLinks[project.id], '_blank')}>↗</Btn>
                    ) : (
                      <span
                        aria-hidden="true"
                        style={{
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          padding: '6px 12px',
                          borderRadius: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          visibility: 'hidden',
                        }}
                      >
                        ↗
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Customers */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Kunder
            </h2>
            <Btn href="/admin/customers/new" variant="secondary">+ Ny kunde</Btn>
          </div>

          {customers.length === 0 ? (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>Ingen kunder ennå</p>
              <Btn href="/admin/customers/new">Opprett første kunde</Btn>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
              {customers.map(customer => (
                <Link key={customer.id} href={`/admin/customers/${customer.id}/projects`} style={{ textDecoration: 'none' }}>
                  <div
                    style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.12s' }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#3D3D4E'}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text, marginBottom: 2 }}>
                          {customer.name}
                        </p>
                        {customer.company && (
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginBottom: 6 }}>{customer.company}</p>
                        )}
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
                          {projectCounts[customer.id] || 0} prosjekt{(projectCounts[customer.id] || 0) !== 1 ? 'er' : ''}
                        </p>
                      </div>
                      <svg width="14" height="14" fill="none" stroke={C.text3} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Market analysis widget */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Markedsanalyse
            </h2>
            <Btn href="/admin/market-analysis" variant="ghost">Se analyse →</Btn>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            {latestAnalysis?.results ? (
              <>
                <div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, marginBottom: 3 }}>
                    <span style={{ color: C.accent, fontWeight: 600 }}>{latestAnalysis.results.customers.length} leads</span> funnet sist uke
                  </p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
                    {new Date(latestAnalysis.created_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <Btn href="/admin/market-analysis" variant="secondary">Se detaljer</Btn>
              </>
            ) : (
              <>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                  Ingen analyser kjørt ennå. Kjøres automatisk hver mandag kl 08:00.
                </p>
                <Btn href="/admin/market-analysis">Kjør nå</Btn>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
