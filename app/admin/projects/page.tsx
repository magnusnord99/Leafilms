'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Badge, Heading, Text } from '@/components/ui'
import { Project } from '@/lib/types'

export default function ProjectsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<Project[]>([])
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
        // Sorter prosjekter: publisert først, deretter utkast, deretter arkivert
        const sortedProjects = (projectsData || []).sort((a, b) => {
          const statusOrder: Record<string, number> = {
            'published': 0,
            'draft': 1,
            'archived': 2
          }
          const aOrder = statusOrder[a.status] ?? 3
          const bOrder = statusOrder[b.status] ?? 3
          
          // Hvis samme status, sorter etter updated_at
          if (aOrder === bOrder) {
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          }
          
          return aOrder - bOrder
        })
        
        setProjects(sortedProjects as Project[])

        // Hent share tokens for publiserte prosjekter
        const publishedProjectIds = sortedProjects
          .filter(p => p.status === 'published')
          .map(p => p.id)

        if (publishedProjectIds.length > 0) {
          const { data: sharesData } = await supabase
            .from('project_shares')
            .select('project_id, token')
            .in('project_id', publishedProjectIds)

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

  // Grupper prosjekter etter status
  const publishedProjects = projects.filter(p => p.status === 'published')
  const draftProjects = projects.filter(p => p.status === 'draft')
  const archivedProjects = projects.filter(p => p.status === 'archived')

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
            <Heading as="h1" size="lg" className="mb-2 !text-white">Alle Prosjekter</Heading>
            <Text variant="body" className="!text-white">
              {projects.length} prosjekt{projects.length !== 1 ? 'er' : ''} totalt
            </Text>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/projects/new">
              <Button variant="primary">+ Nytt Prosjekt</Button>
            </Link>
          </div>
        </div>

        {/* Publiserte Prosjekter */}
        {publishedProjects.length > 0 && (
          <div className="space-y-4 mb-12">
            <Heading as="h2" size="md" className="mb-4 !text-white">
              🟢 Publiserte ({publishedProjects.length})
            </Heading>
            <div className="grid gap-4">
              {publishedProjects.map((project) => (
                <Card key={project.id} hover>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Heading as="h3" size="sm" className="mb-2">{project.title}</Heading>
                      {project.client_name && (
                        <Text variant="body" className="mb-2">Kunde: {project.client_name}</Text>
                      )}
                      <div className="flex items-center gap-3">
                        <Badge variant="published">🟢 Publisert</Badge>
                        <Text variant="muted">
                          Oppdatert: {new Date(project.updated_at).toLocaleDateString('nb-NO')}
                        </Text>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/admin/projects/${project.id}/edit`}>
                        <Button variant="primary" size="sm">Åpne</Button>
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
                        <Button variant="secondary" size="sm">📊 Se statistikk</Button>
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
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Utkast */}
        {draftProjects.length > 0 && (
          <div className="space-y-4 mb-12">
            <Heading as="h2" size="md" className="mb-4 !text-white">
              🟡 Utkast ({draftProjects.length})
            </Heading>
            <div className="grid gap-4">
              {draftProjects.map((project) => (
                <Card key={project.id} hover>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Heading as="h3" size="sm" className="mb-2">{project.title}</Heading>
                      {project.client_name && (
                        <Text variant="body" className="mb-2">Kunde: {project.client_name}</Text>
                      )}
                      <div className="flex items-center gap-3">
                        <Badge variant="draft">🟡 Utkast</Badge>
                        <Text variant="muted">
                          Oppdatert: {new Date(project.updated_at).toLocaleDateString('nb-NO')}
                        </Text>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/admin/projects/${project.id}/edit`}>
                        <Button variant="primary" size="sm">Åpne</Button>
                      </Link>
                      <Link href={`/admin/projects/${project.id}/quote-analytics`}>
                        <Button variant="secondary" size="sm">📊 Se statistikk</Button>
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
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Arkiverte Prosjekter */}
        {archivedProjects.length > 0 && (
          <div className="space-y-4 mb-12">
            <Heading as="h2" size="md" className="mb-4 !text-white">
              ⚫ Arkiverte ({archivedProjects.length})
            </Heading>
            <div className="grid gap-4">
              {archivedProjects.map((project) => (
                <Card key={project.id} hover>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <Heading as="h3" size="sm" className="mb-2">{project.title}</Heading>
                      {project.client_name && (
                        <Text variant="body" className="mb-2">Kunde: {project.client_name}</Text>
                      )}
                      <div className="flex items-center gap-3">
                        <Badge variant="archived">⚫ Arkivert</Badge>
                        <Text variant="muted">
                          Oppdatert: {new Date(project.updated_at).toLocaleDateString('nb-NO')}
                        </Text>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/admin/projects/${project.id}/edit`}>
                        <Button variant="primary" size="sm">Åpne</Button>
                      </Link>
                      <Link href={`/admin/projects/${project.id}/quote-analytics`}>
                        <Button variant="secondary" size="sm">📊 Se statistikk</Button>
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
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Ingen prosjekter */}
        {projects.length === 0 && (
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

