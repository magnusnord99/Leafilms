'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Badge, Heading, Text } from '@/components/ui'
import { Project } from '@/lib/types'

type ProjectWithVersion = Project & { rootId: string; versionNumber: number }
type ProjectGroup = { rootId: string; baseTitle: string; versions: ProjectWithVersion[] }

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
        .select('*')
        .order('updated_at', { ascending: false })

      if (projectsError) {
        console.error('Error fetching projects:', projectsError)
        alert('❌ Kunne ikke hente prosjekter')
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
      alert('❌ Kunne ikke hente prosjekter')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(projectId: string, projectTitle: string) {
    if (!confirm(`Er du sikker på at du vil slette "${projectTitle}"?\n\nDette kan ikke angres.`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', projectId)

      if (error) throw error

      // Prosjekt slettet - refresh data
      fetchProjects()
    } catch (error) {
      console.error('Error deleting project:', error)
      alert('❌ Kunne ikke slette prosjekt')
    }
  }

  const getVersionLabel = (p: Project) => {
    const v = (p as { version_number?: number }).version_number ?? 1
    return `V${v}`
  }

  const totalProjects = projectGroups.reduce((sum, g) => sum + g.versions.length, 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Text variant="body">Laster...</Text>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <Link href="/admin" className="text-white/60 hover:text-white mb-2 inline-block">
              ← Tilbake til dashboard
            </Link>
            <Heading as="h1" size="lg" className="mb-2 !text-white">Prosjekter</Heading>
            <Text variant="body" className="!text-white">
              {projectGroups.length} prosjekt{projectGroups.length !== 1 ? 'er' : ''} · {totalProjects} versjon{totalProjects !== 1 ? 'er' : ''} totalt
            </Text>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/projects/new">
              <Button variant="primary">+ Nytt Prosjekt</Button>
            </Link>
          </div>
        </div>

        {/* Prosjektmapper med versjoner */}
        <div className="space-y-6">
          {projectGroups.map((group) => (
            <Card key={group.rootId} className="overflow-hidden">
              {/* Mappe-header */}
              <div className="p-4 border-b border-white/10 bg-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <Heading as="h3" size="sm" className="mb-1 !text-white">
                      📁 {group.baseTitle}
                    </Heading>
                    {group.versions[0]?.client_name && (
                      <Text variant="muted" className="text-sm">
                        Kunde: {group.versions[0].client_name}
                      </Text>
                    )}
                  </div>
                  <Text variant="muted" className="text-sm">
                    {group.versions.length} versjon{group.versions.length !== 1 ? 'er' : ''}
                  </Text>
                </div>
              </div>
              {/* Versjoner inni mappen */}
              <div className="divide-y divide-white/10">
                {group.versions.map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Badge variant={project.status as 'draft' | 'published' | 'archived'}>
                        {project.status === 'published' ? '🟢 Publisert' : project.status === 'archived' ? '⚫ Arkivert' : '🟡 Utkast'}
                      </Badge>
                      <span className="text-sm font-medium text-white/90 px-2 py-0.5 rounded bg-white/10">
                        {getVersionLabel(project)}
                      </span>
                      <Text variant="muted" className="text-sm truncate">
                        Oppdatert: {new Date(project.updated_at).toLocaleDateString('nb-NO')}
                      </Text>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Link href={`/admin/projects/${project.id}/edit`}>
                        <Button variant="primary" size="sm">Rediger</Button>
                      </Link>
                      {shareLinks[project.id] && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault()
                            window.open(shareLinks[project.id], '_blank')
                          }}
                        >
                          🔗 Se publisert
                        </Button>
                      )}
                      <Link href={`/admin/projects/${project.id}/quote-analytics`}>
                        <Button variant="secondary" size="sm">📊 Statistikk</Button>
                      </Link>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault()
                          handleDelete(project.id, project.title)
                        }}
                        className="text-red-400 hover:text-red-300 hover:bg-red-400/10"
                      >
                        Slett
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* Ingen prosjekter */}
        {projectGroups.length === 0 && (
          <Card className="p-12 text-center">
            <Text variant="body" className="mb-4">Ingen prosjekter ennå</Text>
            <Link href="/admin/projects/new">
              <Button variant="primary">Opprett første prosjekt →</Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  )
}

