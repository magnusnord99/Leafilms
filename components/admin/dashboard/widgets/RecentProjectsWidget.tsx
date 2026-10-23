'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { Badge } from '@/components/ui'
import { Project, PIPELINE_STAGE_LABELS_SHORT } from '@/lib/types'
import { C } from '@/lib/admin-theme'
import { WidgetHeader, Btn } from '../shared'

const PIPELINE_STAGE_COLORS: Record<string, string> = {
  lead: C.text3, møte: '#4A9AC4', tilbud_sendt: C.accent,
  kontrakt: C.success, pre_prod: '#F0A500', produksjon: '#F0A500',
  post_prod: '#F0A500', levering: '#E8A838', fakturert: C.success, videresalg: C.text2,
}

type ProjectWithStage = Project & { pipeline_stage?: string }

export default function RecentProjectsWidget() {
  const [loading, setLoading] = useState(true)
  const [recentProjects, setRecentProjects] = useState<Project[]>([])
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({})

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      const { data } = await supabase
        .from('projects')
        .select('id, title, status, pipeline_stage, client_name, updated_at, parent_project_id, version_number')
        .order('updated_at', { ascending: false })
        .limit(5)
      const projects = (data || []) as Project[]
      setRecentProjects(projects)

      const publishedIds = projects.filter((p) => p.status === 'published').map((p) => p.id)
      if (publishedIds.length > 0) {
        const { data: sharesData } = await supabase.from('project_shares').select('project_id, token').in('project_id', publishedIds)
        if (sharesData) {
          const links: Record<string, string> = {}
          sharesData.forEach((s) => { links[s.project_id] = `${window.location.origin}/p/${s.token}` })
          setShareLinks(links)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return null

  return (
    <div>
      <WidgetHeader title="Siste prosjekter" action={<Btn href="/admin/projects" variant="ghost">Se alle →</Btn>} />
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        {recentProjects.length === 0 ? (
          <div style={{ padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>Ingen prosjekter ennå</p>
            <Btn href="/admin/projects/new">Opprett første prosjekt</Btn>
          </div>
        ) : (
          recentProjects.map((project, i) => {
            const stage = (project as ProjectWithStage).pipeline_stage
            return (
              <div
                key={project.id}
                style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '12px 16px', background: C.surface,
                  borderBottom: i < recentProjects.length - 1 ? `1px solid ${C.border}` : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = C.surface}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text }}>
                      {project.title}
                    </p>
                    <Badge variant={project.status as 'draft' | 'published' | 'archived'}>
                      {project.status === 'published' ? 'Publisert' : project.status === 'archived' ? 'Arkivert' : 'Utkast'}
                    </Badge>
                    {stage && stage !== 'lead' && (
                      <span style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 500,
                        color: PIPELINE_STAGE_COLORS[stage] ?? C.text3,
                        background: `${PIPELINE_STAGE_COLORS[stage] ?? C.text3}18`,
                        padding: '1px 7px', borderRadius: 4,
                      }}>
                        {PIPELINE_STAGE_LABELS_SHORT[stage as keyof typeof PIPELINE_STAGE_LABELS_SHORT] ?? stage}
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
                    <span aria-hidden="true" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, display: 'inline-flex', alignItems: 'center', gap: 4, visibility: 'hidden' }}>↗</span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
