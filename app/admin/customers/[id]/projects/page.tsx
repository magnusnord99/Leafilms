'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Badge, Heading, Text } from '@/components/ui'
import { Customer, Project, Quote, Contract } from '@/lib/types'

export default function CustomerProjectsPage() {
  const router = useRouter()
  const params = useParams()
  const customerId = params.id as string

  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [projects, setProjects] = useState<(Project & { quotes: Quote[], contracts: Contract[] })[]>([])

  useEffect(() => {
    if (customerId) {
      fetchData()
    }
  }, [customerId])

  async function fetchData() {
    // Hent kunde
    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single()

    if (customerError) {
      console.error('Error fetching customer:', customerError)
      return
    }

    setCustomer(customerData as Customer)

    // Hent prosjekter for kunden
    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (projectsError) {
      console.error('Error fetching projects:', projectsError)
      setLoading(false)
      return
    }

    // Hent tilbud og kontrakter for hvert prosjekt
    const projectsWithDetails = await Promise.all(
      (projectsData || []).map(async (project) => {
        // Hent tilbud
        const { data: quotesData } = await supabase
          .from('quotes')
          .select('*')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false })

        // Hent kontrakter
        const { data: contractsData } = await supabase
          .from('contracts')
          .select('*')
          .eq('project_id', project.id)
          .order('created_at', { ascending: false })

        return {
          ...project,
          quotes: (quotesData || []) as Quote[],
          contracts: (contractsData || []) as Contract[]
        }
      })
    )

    setProjects(projectsWithDetails)
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Text variant="body">Laster...</Text>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-6xl mx-auto">
          <Card className="p-12 text-center">
            <Text variant="body" className="mb-4">Kunde ikke funnet</Text>
            <Link href="/admin/customers">
              <Button variant="primary">Tilbake til kunder</Button>
            </Link>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/admin/customers">
            <Button variant="secondary" size="sm" className="mb-4">← Tilbake til kunder</Button>
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <Heading as="h1" size="lg" className="mb-2 !text-white">{customer.name}</Heading>
              {customer.company && (
                <Text variant="body" className="!text-white">{customer.company}</Text>
              )}
              {customer.email && (
                <Text variant="body" className="!text-white">📧 {customer.email}</Text>
              )}
            </div>
            <div className="flex gap-3">
              <Link href={`/admin/customers/${customer.id}/edit`}>
                <Button variant="secondary">Rediger Kunde</Button>
              </Link>
              <Link href={`/admin/projects/new?customer_id=${customer.id}`}>
                <Button variant="primary">+ Nytt Prosjekt</Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Projects List */}
        <div className="space-y-6">
          <Heading as="h2" size="md" className="!text-white">Prosjekter</Heading>
          
          {projects && projects.length > 0 ? (
            <div className="space-y-4">
              {projects.map((project) => (
                <Card key={project.id} hover>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <Heading as="h3" size="sm">{project.title}</Heading>
                        <Badge variant={project.status as 'draft' | 'published' | 'archived'}>
                          {project.status === 'published' ? '🟢 Publisert' : 
                           project.status === 'archived' ? '⚫ Arkivert' : 
                           '🟡 Utkast'}
                        </Badge>
                      </div>

                      {/* Tilbud */}
                      {project.quotes && project.quotes.length > 0 ? (
                        <div className="mb-3 p-3 bg-background-elevated rounded-lg">
                          <Text variant="body" className="text-sm font-medium mb-2">Pristilbud ({project.quotes.length}):</Text>
                          <div className="space-y-2">
                            {project.quotes.map((quote) => (
                              <div key={quote.id} className="flex items-center justify-between p-2 bg-background rounded border border-border">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge variant={quote.status === 'accepted' ? 'published' : quote.status === 'sent' ? 'published' : 'draft'}>
                                    {quote.version || 'V1'}
                                  </Badge>
                                  <Badge variant={quote.status === 'accepted' ? 'published' : 'draft'}>
                                    {quote.status === 'accepted' ? 'Godtatt' : 
                                     quote.status === 'sent' ? 'Sendt' : 
                                     quote.status === 'rejected' ? 'Avslått' : 
                                     'Utkast'}
                                  </Badge>
                                  {quote.pdf_path ? (
                                    <a
                                      href={supabase.storage.from('assets').getPublicUrl(quote.pdf_path).data.publicUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:text-blue-300 underline text-xs"
                                    >
                                      📄 Se PDF
                                    </a>
                                  ) : (
                                    <Text variant="muted" className="text-xs">
                                      (Ingen PDF lagret)
                                    </Text>
                                  )}
                                  {quote.accepted_at && (
                                    <Text variant="muted" className="text-xs">
                                      Akseptert: {new Date(quote.accepted_at).toLocaleDateString('nb-NO')}
                                    </Text>
                                  )}
                                  <Text variant="muted" className="text-xs">
                                    {new Date(quote.created_at).toLocaleDateString('nb-NO', {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </Text>
                                </div>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={async () => {
                                    if (!confirm('Er du sikker på at du vil slette dette tilbudet? Dette kan ikke angres.')) {
                                      return
                                    }

                                    try {
                                      // Slett PDF fra storage hvis den finnes
                                      if (quote.pdf_path) {
                                        const { error: storageError } = await supabase.storage
                                          .from('assets')
                                          .remove([quote.pdf_path])

                                        if (storageError) {
                                          console.error('Error deleting PDF from storage:', storageError)
                                        }
                                      }

                                      // Slett quote fra database
                                      const { error: deleteError } = await supabase
                                        .from('quotes')
                                        .delete()
                                        .eq('id', quote.id)

                                      if (deleteError) {
                                        console.error('Error deleting quote:', deleteError)
                                        alert('Kunne ikke slette tilbud. Prøv igjen.')
                                      } else {
                                        // Refresh data
                                        fetchData()
                                      }
                                    } catch (error: any) {
                                      console.error('Error deleting quote:', error)
                                      alert('Kunne ikke slette tilbud. Prøv igjen.')
                                    }
                                  }}
                                  className="text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  🗑️ Slett
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mb-3">
                          <Text variant="body" className="text-sm text-gray-500">Ingen tilbud lagt ved ennå</Text>
                        </div>
                      )}

                      {/* Kontrakter */}
                      {project.contracts && project.contracts.length > 0 && (
                        <div className="mb-3">
                          <Text variant="body" className="text-sm font-medium mb-1">Kontrakter:</Text>
                          <div className="space-y-1">
                            {project.contracts.map((contract) => (
                              <div key={contract.id} className="flex items-center gap-2 text-sm">
                                <Badge variant={contract.status === 'signed' ? 'success' : 'secondary'}>
                                  {contract.status === 'signed' ? '✅ Signert' : 
                                   contract.status === 'sent' ? '📤 Sendt' : 
                                   '⏳ Ventende'}
                                </Badge>
                                {contract.signed_at && (
                                  <Text variant="muted" className="text-xs">
                                    Signert: {new Date(contract.signed_at).toLocaleDateString('nb-NO')}
                                  </Text>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <Text variant="muted" className="text-sm">
                        Opprettet: {new Date(project.created_at).toLocaleDateString('nb-NO')}
                      </Text>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/admin/projects/${project.id}/edit`}>
                        <Button variant="primary" size="sm">Rediger</Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <Text variant="body" className="mb-4">Ingen prosjekter for denne kunden ennå</Text>
              <Link href={`/admin/projects/new?customer_id=${customer.id}`}>
                <Button variant="primary">Opprett første prosjekt →</Button>
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

