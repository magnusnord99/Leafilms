'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { Button, Badge } from '@/components/ui'
import { Project, Customer } from '@/lib/types'

export default function AdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [recentProjects, setRecentProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({})
  const [shareLinks, setShareLinks] = useState<Record<string, string>>({})
  const [totalProjects, setTotalProjects] = useState(0)
  const [publishedCount, setPublishedCount] = useState(0)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (customers.length > 0) {
      fetchProjectCounts()
    }
  }, [customers])

  async function fetchData() {
    try {
      // Hent 3 siste prosjekter (sortert på updated_at)
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(3)

      if (projectsError) {
        console.error('Error fetching projects:', projectsError)
        console.error('Projects error details:', JSON.stringify(projectsError, null, 2))
      } else {
        const projects = (projectsData || []) as Project[]
        setRecentProjects(projects)
        setTotalProjects(projects.length)
        setPublishedCount(projects.filter(p => p.status === 'published').length)

        // Hent share tokens for publiserte prosjekter
        const publishedProjectIds = (projectsData || [])
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

      // Hent alle kunder
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true })

      if (customersError) {
        console.error('Error fetching customers:', customersError)
        console.error('Customers error details:', JSON.stringify(customersError, null, 2))
      } else {
        setCustomers((customersData || []) as Customer[])
      }
    } catch (error) {
      console.error('Unexpected error in fetchData:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchProjectCounts() {
    const customerIds = customers.map(c => c.id)
    if (customerIds.length === 0) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('projects')
      .select('customer_id')
      .in('customer_id', customerIds)

    if (!error && data) {
      const counts: Record<string, number> = {}
      data.forEach((project: any) => {
        if (project.customer_id) {
          counts[project.customer_id] = (counts[project.customer_id] || 0) + 1
        }
      })
      setProjectCounts(counts)
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
      fetchData()
    } catch (error) {
      console.error('Error deleting project:', error)
      alert('❌ Kunne ikke slette prosjekt')
    }
  }


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#62594E', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Laster...</p>
      </div>
    )
  }

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

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: '#0C0B09', color: '#E8E1D5' }}>
      <div className="max-w-5xl mx-auto">

        {/* Page header */}
        <div className="flex flex-wrap items-start justify-between gap-6 mb-14">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div style={{ width: 32, height: 1, background: '#C49434' }} />
              {sectionLabel('Dashboard')}
            </div>
            <h1 style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: 'clamp(2.5rem, 5vw, 4rem)',
              fontWeight: 300,
              fontStyle: 'italic',
              color: '#E8E1D5',
              lineHeight: 1,
            }}>
              Leafilms Pitch
            </h1>
          </div>

          <div className="flex gap-2 items-center">
            <Link href="/admin/projects/new">
              <Button variant="primary" size="sm">+ Nytt Prosjekt</Button>
            </Link>
          </div>
        </div>

        {/* Recent Projects */}
        <div className="mb-14">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div style={{ width: 20, height: 1, background: '#38332A' }} />
              {sectionLabel('Sist åpnet')}
            </div>
            <Link href="/admin/projects">
              <Button variant="ghost" size="sm">Se alle →</Button>
            </Link>
          </div>

          {recentProjects && recentProjects.length > 0 ? (
            <div className="flex flex-col gap-px" style={{ border: '1px solid #2A261F', borderRadius: 3 }}>
              {recentProjects.map((project, i) => (
                <div
                  key={project.id}
                  className="flex items-center justify-between px-5 py-4 transition-colors"
                  style={{
                    background: '#161410',
                    borderBottom: i < recentProjects.length - 1 ? '1px solid #2A261F' : 'none',
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <p style={{
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.8rem',
                        fontWeight: 500,
                        color: '#E8E1D5',
                        letterSpacing: '0.03em',
                      }}>
                        {project.title}
                      </p>
                      <Badge variant={project.status as 'draft' | 'published' | 'archived'}>
                        {project.status === 'published' ? 'Publisert' :
                         project.status === 'archived' ? 'Arkivert' : 'Utkast'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      {project.client_name && (
                        <span style={{ fontSize: '0.65rem', color: '#62594E', fontFamily: 'var(--font-dm-sans)' }}>
                          {project.client_name}
                        </span>
                      )}
                      <span style={{ fontSize: '0.65rem', color: '#38332A', fontFamily: 'var(--font-dm-sans)' }}>
                        {new Date(project.updated_at).toLocaleDateString('nb-NO')}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Link href={`/admin/projects/${project.id}/edit`}>
                      <Button variant="primary" size="sm">Åpne</Button>
                    </Link>
                    {shareLinks[project.id] && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => { e.preventDefault(); window.open(shareLinks[project.id], '_blank') }}
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
                      onClick={(e) => { e.preventDefault(); handleDelete(project.id, project.title) }}
                      style={{ color: '#B84040' }}
                    >
                      Slett
                    </Button>
                  </div>
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

        {/* Customers */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div style={{ width: 20, height: 1, background: '#38332A' }} />
              {sectionLabel('Kunder')}
            </div>
            <Link href="/admin/customers/new">
              <Button variant="primary" size="sm">+ Ny Kunde</Button>
            </Link>
          </div>

          {customers && customers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {customers.map((customer) => (
                <Link key={customer.id} href={`/admin/customers/${customer.id}/projects`}>
                  <div
                    className="px-5 py-4 transition-all group"
                    style={{
                      background: '#161410',
                      border: '1px solid #2A261F',
                      borderRadius: 3,
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <p style={{
                            fontFamily: 'var(--font-dm-sans)',
                            fontSize: '0.8rem',
                            fontWeight: 500,
                            color: '#E8E1D5',
                          }}>
                            {customer.name}
                          </p>
                          {customer.company && (
                            <span style={{ fontSize: '0.65rem', color: '#62594E', fontFamily: 'var(--font-dm-sans)' }}>
                              {customer.company}
                            </span>
                          )}
                        </div>
                        <div className="space-y-0.5 mb-2">
                          {customer.email && (
                            <p style={{ fontSize: '0.65rem', color: '#62594E', fontFamily: 'var(--font-dm-sans)' }}>
                              {customer.email}
                            </p>
                          )}
                          {customer.phone && (
                            <p style={{ fontSize: '0.65rem', color: '#62594E', fontFamily: 'var(--font-dm-sans)' }}>
                              {customer.phone}
                            </p>
                          )}
                        </div>
                        <span style={{ fontSize: '0.6rem', color: '#38332A', fontFamily: 'var(--font-dm-sans)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          {projectCounts[customer.id] || 0} prosjekt{projectCounts[customer.id] !== 1 ? 'er' : ''}
                        </span>
                      </div>
                      <svg className="w-3.5 h-3.5 flex-shrink-0 mt-1" fill="none" stroke="#38332A" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div
              className="p-10 text-center"
              style={{ background: '#161410', border: '1px solid #2A261F', borderRadius: 3 }}
            >
              <p style={{ color: '#62594E', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', marginBottom: 16 }}>
                Ingen kunder ennå
              </p>
              <Link href="/admin/customers/new">
                <Button variant="primary">Opprett første kunde</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

