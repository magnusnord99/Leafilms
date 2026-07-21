'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getPreprodProjects, PreprodProject } from '@/lib/actions/preprod'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
  success:  '#4CAF7D',
  warning:  '#F0A500',
  blue:     '#4A9EFF',
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  video: { label: 'Video', color: C.accent },
  photo: { label: 'Foto',  color: C.blue   },
  mixed: { label: 'Begge', color: C.success },
}

function ProjectCard({ project }: { project: PreprodProject }) {
  const type = project.project_type ? TYPE_CONFIG[project.project_type] : null
  const pct = project.task_count > 0 ? Math.round((project.done_count / project.task_count) * 100) : 0

  const millanote = project.preprod.millanote_done
  const packingTotal = project.preprod.packing_list.length
  const packingDone = project.preprod.packing_list.filter(i => i.checked).length
  const prodCrew = project.preprod.prod_crew.length
  const postCrew = project.preprod.post_crew.length

  return (
    <Link href={`/admin/preprod/${project.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '18px 20px', cursor: 'pointer', transition: 'border-color 0.12s', display: 'flex', flexDirection: 'column', gap: 14 }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#3D3D4E'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.title}
            </p>
            {project.customer && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                {project.customer.name}{project.customer.company ? ` · ${project.customer.company}` : ''}
              </p>
            )}
            {project.project_lead && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 2 }}>
                Prosjektleder: {project.project_lead.name ?? project.project_lead.email}
              </p>
            )}
          </div>
          {type && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: type.color, background: `${type.color}18`, border: `1px solid ${type.color}30`, padding: '3px 8px', borderRadius: 4, flexShrink: 0 }}>
              {type.label}
            </span>
          )}
        </div>

        {/* Status indicators */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <StatusPill done={millanote} label="Moodboard/planlegging" />
          <StatusPill done={prodCrew > 0} label={`Prod-crew ${prodCrew > 0 ? `(${prodCrew})` : ''}`} />
          <StatusPill done={postCrew > 0} label={`Post-crew ${postCrew > 0 ? `(${postCrew})` : ''}`} />
          {packingTotal > 0 && (
            <StatusPill done={packingDone === packingTotal} label={`Pakking ${packingDone}/${packingTotal}`} />
          )}
        </div>

        {/* Task progress */}
        {project.task_count > 0 && (
          <div>
            <div style={{ height: 3, background: C.surface2, borderRadius: 2, overflow: 'hidden', marginBottom: 5 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? C.success : C.accent, borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: pct === 100 ? C.success : C.text3 }}>
              {project.done_count} av {project.task_count} oppgaver ferdig
            </p>
          </div>
        )}
      </div>
    </Link>
  )
}

function StatusPill({ done, label }: { done: boolean; label: string }) {
  return (
    <span style={{
      fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500,
      padding: '2px 8px', borderRadius: 10,
      color: done ? C.success : C.text3,
      background: done ? 'rgba(76,175,125,0.1)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${done ? 'rgba(76,175,125,0.25)' : C.border}`,
    }}>
      {done ? '✓ ' : ''}{label}
    </span>
  )
}

export default function PreprodPage() {
  const [projects, setProjects] = useState<PreprodProject[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPreprodProjects().then(data => {
      setProjects(data)
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
            Pre-produksjon
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
            {projects.length} prosjekt{projects.length !== 1 ? 'er' : ''} i pre-produksjon
          </p>
        </div>

        {projects.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '64px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', color: C.text3 }}>
              Ingen prosjekter i pre-produksjon akkurat nå
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {projects.map(p => <ProjectCard key={p.id} project={p} />)}
          </div>
        )}

      </div>
    </div>
  )
}
