'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { Customer } from '@/lib/types'
import { C } from '@/lib/admin-theme'

export default function CustomersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({})

  async function fetchCustomers() {
    const supabase = createClient()
    const { data } = await supabase.from('customers').select('*').order('name', { ascending: true })
    setCustomers((data || []) as Customer[])
    setLoading(false)
  }

  async function fetchProjectCounts() {
    const supabase = createClient()
    const ids = customers.map(c => c.id)
    const { data } = await supabase.from('projects').select('customer_id').in('customer_id', ids)
    if (data) {
      const counts: Record<string, number> = {}
      data.forEach((p: { customer_id: string | null }) => { if (p.customer_id) counts[p.customer_id] = (counts[p.customer_id] || 0) + 1 })
      setProjectCounts(counts)
    }
  }

  useEffect(() => { fetchCustomers() }, [])

  useEffect(() => {
    if (customers.length > 0) fetchProjectCounts()
  }, [customers])

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Slett "${name}"? Dette kan ikke angres.`)) return
    const supabase = createClient()
    const { error } = await supabase.from('customers').delete().eq('id', id)
    if (error) { alert('Kunne ikke slette kunde'); return }
    fetchCustomers()
  }

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.email?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
              Kunder
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginTop: 4 }}>
              {customers.length} kunder totalt
            </p>
          </div>
          <Link href="/admin/customers/new">
            <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
              + Ny kunde
            </button>
          </Link>
        </div>

        {/* Søk */}
        <div style={{ marginBottom: 20 }}>
          <input
            type="text"
            placeholder="Søk etter navn, firma eller e-post..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', width: '100%', maxWidth: 420, padding: '9px 14px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, outline: 'none', boxSizing: 'border-box' }}
            onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
            onBlur={e => { e.currentTarget.style.borderColor = C.border }}
          />
        </div>

        {/* Liste */}
        {filtered.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {filtered.map(customer => (
              <div
                key={customer.id}
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/admin/customers/${customer.id}`)}
                onKeyDown={e => { if (e.key === 'Enter') router.push(`/admin/customers/${customer.id}`) }}
                style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.accent }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = C.border }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text }}>
                      {customer.name}
                    </p>
                    {customer.customer_number && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, color: C.accent, background: 'rgba(124,92,252,0.1)', border: '1px solid rgba(124,92,252,0.2)', padding: '1px 7px', borderRadius: 4 }}>
                        #{customer.customer_number}
                      </span>
                    )}
                    {customer.company && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>
                        {customer.company}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 16px' }}>
                    {customer.email && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{customer.email}</span>
                    )}
                    {customer.phone && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{customer.phone}</span>
                    )}
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                      {projectCounts[customer.id] || 0} prosjekt{projectCounts[customer.id] !== 1 ? 'er' : ''}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <Link href={`/admin/customers/${customer.id}/edit`}>
                    <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
                      Rediger
                    </button>
                  </Link>
                  <button
                    onClick={() => handleDelete(customer.id, customer.name)}
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'rgba(224,85,85,0.1)', color: C.danger, border: `1px solid rgba(224,85,85,0.25)` }}
                  >
                    Slett
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.text3, marginBottom: 16 }}>
              {searchQuery ? 'Ingen kunder funnet' : 'Ingen kunder ennå'}
            </p>
            {!searchQuery && (
              <Link href="/admin/customers/new">
                <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '9px 20px', borderRadius: 8, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
                  Opprett første kunde
                </button>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
