'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Heading, Text, Input } from '@/components/ui'
import { Customer, Project } from '@/lib/types'

export default function CustomersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    fetchCustomers()
  }, [])

  useEffect(() => {
    if (customers.length > 0) {
      fetchProjectCounts()
    }
  }, [customers])

  async function fetchCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      console.error('Error fetching customers:', error)
    } else {
      setCustomers((data || []) as Customer[])
    }
    setLoading(false)
  }

  async function fetchProjectCounts() {
    const customerIds = customers.map(c => c.id)
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

  async function handleDelete(customerId: string, customerName: string) {
    if (!confirm(`Er du sikker på at du vil slette "${customerName}"?\n\nDette kan ikke angres.`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', customerId)

      if (error) throw error

      fetchCustomers()
    } catch (error) {
      console.error('Error deleting customer:', error)
      alert('❌ Kunne ikke slette kunde')
    }
  }

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
            <Heading as="h1" size="lg" className="mb-2 !text-white">Kunder</Heading>
            <Text variant="body" className="!text-white">Oversikt over alle kunder og deres prosjekter</Text>
          </div>
          <div className="flex gap-3">
            <Link href="/admin">
              <Button variant="secondary">Tilbake</Button>
            </Link>
            <Link href="/admin/customers/new">
              <Button variant="primary">+ Ny Kunde</Button>
            </Link>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <Input
            type="text"
            placeholder="Søk etter kunde, firma eller e-post..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Customers List */}
        <div className="space-y-4">
          {filteredCustomers && filteredCustomers.length > 0 ? (
            <div className="grid gap-4">
              {filteredCustomers.map((customer) => (
                <Card key={customer.id} hover>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Heading as="h3" size="sm">{customer.name}</Heading>
                        {customer.company && (
                          <Text variant="muted">• {customer.company}</Text>
                        )}
                      </div>
                      <div className="space-y-1 mb-3">
                        {customer.email && (
                          <Text variant="body" className="text-sm">📧 {customer.email}</Text>
                        )}
                        {customer.phone && (
                          <Text variant="body" className="text-sm">📞 {customer.phone}</Text>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <Text variant="muted" className="text-sm">
                          {projectCounts[customer.id] || 0} prosjekt{projectCounts[customer.id] !== 1 ? 'er' : ''}
                        </Text>
                        <Text variant="muted" className="text-sm">
                          Opprettet: {new Date(customer.created_at).toLocaleDateString('nb-NO')}
                        </Text>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/admin/customers/${customer.id}/projects`}>
                        <Button variant="primary" size="sm">Se Prosjekter</Button>
                      </Link>
                      <Link href={`/admin/customers/${customer.id}/edit`}>
                        <Button variant="secondary" size="sm">Rediger</Button>
                      </Link>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(customer.id, customer.name)}
                      >
                        Slett
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-12 text-center">
              <Text variant="body" className="mb-4">
                {searchQuery ? 'Ingen kunder funnet' : 'Ingen kunder ennå'}
              </Text>
              {!searchQuery && (
                <Link href="/admin/customers/new">
                  <Button variant="primary">Opprett din første kunde →</Button>
                </Link>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

