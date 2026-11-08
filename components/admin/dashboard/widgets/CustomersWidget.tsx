'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { Customer } from '@/lib/types'
import { C } from '@/lib/admin-theme'
import { WidgetHeader, Btn } from '../shared'

export default function CustomersWidget() {
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      const { data } = await supabase.from('customers').select('id, name, customer_number').order('name', { ascending: true })
      const customerList = (data || []) as Customer[]
      setCustomers(customerList)

      const customerIds = customerList.map((c) => c.id)
      if (customerIds.length > 0) {
        const { data: countsData } = await supabase.from('projects').select('customer_id').in('customer_id', customerIds)
        if (countsData) {
          const counts: Record<string, number> = {}
          countsData.forEach((p) => { if (p.customer_id) counts[p.customer_id] = (counts[p.customer_id] || 0) + 1 })
          setProjectCounts(counts)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => c.name.toLowerCase().includes(q))
  }, [customers, search])

  if (loading) return null

  return (
    <div>
      <WidgetHeader title="Kunder" action={<Btn href="/admin/customers/new" variant="secondary">+ Ny kunde</Btn>} />
      {customers.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>Ingen kunder ennå</p>
          <Btn href="/admin/customers/new">Opprett første kunde</Btn>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søk etter kunde..."
            style={{
              width: '100%', boxSizing: 'border-box', padding: '8px 12px', marginBottom: 8,
              background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, outline: 'none',
              color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
            }}
          />
          <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 8 }}>
            {filtered.length === 0 ? (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, padding: '16px' }}>
                Ingen kunder matcher &quot;{search}&quot;
              </p>
            ) : (
              filtered.map((customer, i) => (
                <Link key={customer.id} href={`/admin/customers/${customer.id}`} style={{ textDecoration: 'none' }}>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '9px 14px', background: C.surface,
                      borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                    onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = C.surface}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {customer.name}
                      </p>
                    </div>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, flexShrink: 0 }}>
                      {projectCounts[customer.id] || 0} prosjekt{(projectCounts[customer.id] || 0) !== 1 ? 'er' : ''}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
