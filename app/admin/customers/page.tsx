'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'
import { Customer } from '@/lib/types'

export default function CustomersPage() {
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
    if (!confirm(`Er du sikker på at du vil slette "${customerName}"?\n\nDette kan ikke angres.`)) return

    try {
      const { error } = await supabase.from('customers').delete().eq('id', customerId)
      if (error) throw error
      fetchCustomers()
    } catch (error) {
      console.error('Error deleting customer:', error)
      alert('Kunne ikke slette kunde')
    }
  }

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

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
    <div className="min-h-screen p-4 sm:p-8 md:p-12" style={{ background: '#0C0B09', color: '#E8E1D5' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div style={{ width: 32, height: 1, background: '#C49434' }} />
              {sectionLabel('Kundeliste')}
            </div>
            <h1 style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 300,
              fontStyle: 'italic',
              color: '#E8E1D5',
              lineHeight: 1,
            }}>
              Kunder
            </h1>
          </div>
          <Link href="/admin/customers/new">
            <Button variant="primary" size="sm">+ Ny Kunde</Button>
          </Link>
        </div>

        {/* Search */}
        <div className="mb-8">
          <Input
            type="text"
            placeholder="Søk etter navn, firma eller e-post..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </div>

        {/* Customer list */}
        {filteredCustomers.length > 0 ? (
          <div className="flex flex-col gap-px" style={{ border: '1px solid #2A261F', borderRadius: 3 }}>
            {filteredCustomers.map((customer, i) => (
              <div
                key={customer.id}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                style={{
                  background: '#161410',
                  borderBottom: i < filteredCustomers.length - 1 ? '1px solid #2A261F' : 'none',
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <p style={{
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      color: '#E8E1D5',
                    }}>
                      {customer.name}
                    </p>
                    {customer.customer_number && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#C49434', letterSpacing: '0.1em' }}>
                        #{customer.customer_number}
                      </span>
                    )}
                    {customer.company && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#62594E' }}>
                        {customer.company}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                    {customer.email && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#62594E' }}>
                        {customer.email}
                      </span>
                    )}
                    {customer.phone && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#62594E' }}>
                        {customer.phone}
                      </span>
                    )}
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#38332A', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {projectCounts[customer.id] || 0} prosjekt{projectCounts[customer.id] !== 1 ? 'er' : ''}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Link href={`/admin/customers/${customer.id}/projects`}>
                    <Button variant="primary" size="sm">Prosjekter</Button>
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
            ))}
          </div>
        ) : (
          <div
            className="p-10 text-center"
            style={{ background: '#161410', border: '1px solid #2A261F', borderRadius: 3 }}
          >
            <p style={{ color: '#62594E', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', marginBottom: 16 }}>
              {searchQuery ? 'Ingen kunder funnet' : 'Ingen kunder ennå'}
            </p>
            {!searchQuery && (
              <Link href="/admin/customers/new">
                <Button variant="primary">Opprett første kunde</Button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
