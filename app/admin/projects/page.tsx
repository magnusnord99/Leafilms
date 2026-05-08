'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Badge } from '@/components/ui'
import { Project } from '@/lib/types'

type ProjectWithVersion = Project & { rootId: string; versionNumber: number }
type ProjectGroup = { rootId: string; baseTitle: string; versions: ProjectWithVersion[] }

const sectionLabel = (text: string) => (
  <span style={{
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.6rem',
    letterSpacing: '0.16em',
    color: '#C49434',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
  }}>
    {text}
  </span>
)

export default function ProjectsPage() {
  const [loading, setLoading] = useState(true)
  const [projectGroups, setProjectGroups] = useState<ProjectGroup[]>([])
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchProjects()
  }, [])

  async function fetchProjects() {
    try {
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('id, title, status, client_name, updated_at, parent_project_id, version_number')
        .order('updated_at', { ascending: false })

      if (projectsError) {
        console.error('Error fetching projects:', projectsError)
      } else {
        const projectsWithVersion = (projectsData || []).map((p: any) => ({
          ...p,
          rootId: p.parent_project_id ?? p.id,
          versionNumber: p.version_number ?? 1
        }))

        const byRoot = new Map<string, ProjectWithVersion[]>()
        for (const p of projectsWithVersion) {
          const list = byRoot.get(p.rootId) ?? []
          list.push(p)
          byRoot.set(p.rootId, list)
        }
        for (const list of byRoot.values()) {
          list.sort((a, b) => a.versionNumber - b.versionNumber)
        }

        const groups: ProjectGroup[] = Array.from(byRoot.entries()).map(([rootId, versions]) => {
          const rootProject = versions.find(v => v.id === rootId) ?? versions[0]
          const baseTitle = (rootProject.title || '').replace(/\s+V\d+$/, '').trim() || rootProject.title
          return { rootId, baseTitle, versions }
        })

        groups.sort((a, b) => {
          const newestA = Math.max(...a.versions.map(p => new Date(p.updated_at).getTime()))
          const newestB = Math.max(...b.versions.map(p => new Date(p.updated_at).getTime()))
          return newestB - newestA
        })

        setProjectGroups(groups)

        const publishedIds = projectsWithVersion
          .filter((p: ProjectWithVersion) => p.status === 'published')
          .map((p: ProjectWithVersion) => p.id)

        if (publishedIds.length > 0) {
          const { data: sharesData } = await supabase
            .from('project_shares')
            .select('project_id, token')
            .in('project_id', publishedIds)

          if (sharesData) {
            const links: Record<string, string> = {}
            sharesData.forEach(share => {
              links[share.project_id] = `${window.location.origin}/p/${share.token}`
            })
            setShareLinks(links)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(projectId: string, projectTitle: string) {
    if (!confirm(`Er du sikker på at du vil slette "${projectTitle}"?\n\nDette kan ikke angres.`)) return

    try {
      const { error } = await supabase.from('projects').delete().eq('id', projectId)
      if (error) throw error
      fetchProjects()
    } catch (error) {
      console.error('Error deleting project:', error)
      alert('Kunne ikke slette prosjekt')
    }
  }

  const getVersionLabel = (p: Project) => {
    const v = (p as { version_number?: number }).version_number ?? 1
    return `V${v}`
  }

  const totalProjects = projectGroups.reduce((sum, g) => sum + g.versions.length, 0)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0C0B09' }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#62594E', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Laster...
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: '#0C0B09', color: '#E8E1D5' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 mb-14">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div style={{ width: 32, height: 1, background: '#C49434' }} />
              {sectionLabel('Alle prosjekter')}
            </div>
            <h1 style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 300,
              fontStyle: 'italic',
              color: '#E8E1D5',
              lineHeight: 1,
            }}>
              Prosjekter
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#62594E', marginTop: 8, letterSpacing: '0.06em' }}>
              {projectGroups.length} prosjekt{projectGroups.length !== 1 ? 'er' : ''} · {totalProjects} versjon{totalProjects !== 1 ? 'er' : ''} totalt
            </p>
          </div>
          <Link href="/admin/projects/new">
            <Button variant="primary" size="sm">+ Nytt Prosjekt</Button>
          </Link>
        </div>

        {/* Project groups */}
        {projectGroups.length > 0 ? (
          <div className="flex flex-col gap-4">
            {projectGroups.map((group) => (
              <div
                key={group.rootId}
                style={{ border: '1px solid #2A261F', borderRadius: 3, overflow: 'hidden' }}
              >
                {/* Group header */}
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ background: '#161410', borderBottom: '1px solid #2A261F' }}
                >
                  <div>
                    <p style={{
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      color: '#E8E1D5',
                      letterSpacing: '0.03em',
                    }}>
                      {group.baseTitle}
                    </p>
                    {group.versions[0]?.client_name && (
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#62594E', marginTop: 2 }}>
                        {group.versions[0].client_name}
                      </p>
                    )}
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.6rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: '#38332A',
                  }}>
                    {group.versions.length} versjon{group.versions.length !== 1 ? 'er' : ''}
                  </span>
                </div>

                {/* Versions */}
                {group.versions.map((project, i) => (
                  <div
                    key={project.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                    style={{
                      background: '#0E0D0B',
                      borderBottom: i < group.versions.length - 1 ? '1px solid #2A261F' : 'none',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant={project.status as 'draft' | 'published' | 'archived'}>
                        {project.status === 'published' ? 'Publisert' : project.status === 'archived' ? 'Arkivert' : 'Utkast'}
                      </Badge>
                      <span style={{
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.6rem',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        background: 'rgba(196,148,52,0.1)',
                        color: '#C49434',
                        padding: '2px 7px',
                        borderRadius: 2,
                      }}>
                        {getVersionLabel(project)}
                      </span>
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#38332A' }}>
                        {new Date(project.updated_at).toLocaleDateString('nb-NO')}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Link href={`/admin/projects/${project.id}/edit`}>
                        <Button variant="primary" size="sm">Rediger</Button>
                      </Link>
                      {shareLinks[project.id] && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => window.open(shareLinks[project.id], '_blank')}
                        >
                          Se publisert
                        </Button>
                      )}
                      <Link href={`/admin/projects/${project.id}/quote-analytics`}>
                        <Button variant="secondary" size="sm">Statistikk</Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(project.id, project.title)}
                        style={{ color: '#B84040' }}
                      >
                        Slett
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div
            className="p-10 text-center"
            style={{ background: '#161410', border: '1px solid #2A261F', borderRadius: 3 }}
          >
            <p style={{ color: '#62594E', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', marginBottom: 16 }}>
              Ingen prosjekter ennå
            </p>
            <Link href="/admin/projects/new">
              <Button variant="primary">Opprett første prosjekt</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
