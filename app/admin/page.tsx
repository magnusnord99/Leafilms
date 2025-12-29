'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { Button, Card, Badge, Heading, Text } from '@/components/ui'
import { Project, Customer } from '@/lib/types'

export default function AdminDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [recentProjects, setRecentProjects] = useState<Project[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({})

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
        setRecentProjects((projectsData || []) as Project[])
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
            <Heading as="h1" size="lg" className="mb-2 !text-white">Lea Films Pitch</Heading>
            <Text variant="body" className="!text-white">Admin Dashboard</Text>
          </div>
          <div className="flex gap-3">
            <Link href="/admin/cases">
              <Button variant="secondary">Case Studies</Button>
            </Link>
            <Link href="/admin/team">
              <Button variant="secondary">Team</Button>
            </Link>
            <Link href="/admin/images">
              <Button variant="secondary">Bildebibliotek</Button>
            </Link>
            <Link href="/admin/ai-examples">
              <Button variant="secondary">AI Eksempler</Button>
            </Link>
            <Link href="/admin/users">
              <Button variant="secondary">Brukere</Button>
            </Link>
            <Link href="/admin/projects/new">
              <Button variant="primary">+ Nytt Prosjekt</Button>
            </Link>
          </div>
        </div>

        {/* Recent Projects - Sist åpnet */}
        <div className="space-y-4 mb-12">
          <div className="flex items-center justify-between">
            <Heading as="h2" size="md" className="!text-white">Sist åpnet</Heading>
            <Link href="/admin/projects">
              <Button variant="secondary" size="sm">Se alle prosjekter</Button>
            </Link>
          </div>
          
          {recentProjects && recentProjects.length > 0 ? (
            <div className="grid gap-4">
              {recentProjects.map((project) => (
                <Card key={project.id} hover>
                  <div className="flex items-start justify-between">
                    <div>
                      <Heading as="h3" size="sm" className="mb-2">{project.title}</Heading>
                      {project.client_name && (
                        <Text variant="body" className="mb-2">Kunde: {project.client_name}</Text>
                      )}
                      <div className="flex items-center gap-3">
                        <Badge variant={project.status as 'draft' | 'published' | 'archived'}>
                          {project.status === 'published' ? '🟢 Publisert' : 
                           project.status === 'archived' ? '⚫ Arkivert' : 
                           '🟡 Utkast'}
                        </Badge>
                        <Text variant="muted">
                          Oppdatert: {new Date(project.updated_at).toLocaleDateString('nb-NO')}
                        </Text>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/admin/projects/${project.id}/edit`}>
                        <Button variant="primary" size="sm">Åpne</Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <Text variant="body" className="mb-4">Ingen prosjekter ennå</Text>
              <Link href="/admin/projects/new">
                <Button variant="primary">Opprett første prosjekt →</Button>
              </Link>
            </Card>
          )}
        </div>

        {/* Customers List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Heading as="h2" size="md" className="!text-white">Kunder</Heading>
            <Link href="/admin/customers/new">
              <Button variant="primary" size="sm">+ Ny Kunde</Button>
            </Link>
          </div>
          
          {customers && customers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customers.map((customer) => (
                <Link key={customer.id} href={`/admin/customers/${customer.id}/projects`}>
                  <Card hover className="bg-background-widget">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Heading as="h3" size="sm" className="font-bold">{customer.name}</Heading>
                          {customer.company && (
                            <Text variant="muted">• {customer.company}</Text>
                          )}
                        </div>
                        <div className="space-y-1 mb-3">
                          {customer.email && (
                            <Text variant="body" className="text-sm ">📧 {customer.email}</Text>
                          )}
                          {customer.phone && (
                            <Text variant="body" className="text-sm">📞 {customer.phone}</Text>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Text variant="muted" className="text-sm">
                            {projectCounts[customer.id] || 0} prosjekt{projectCounts[customer.id] !== 1 ? 'er' : ''}
                          </Text>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <Text variant="muted">→</Text>
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <Text variant="body" className="mb-4">Ingen kunder ennå</Text>
              <Link href="/admin/customers/new">
                <Button variant="primary">Opprett første kunde →</Button>
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

