'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase-client'
import { Customer } from '@/lib/types'
import { C } from '@/lib/admin-theme'
import { WidgetHeader, Btn } from '../shared'

export default function CustomersWidget() {
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({})

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      const { data } = await supabase.from('customers').select('id, name, company, email, phone, customer_number').order('name', { ascending: true })
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
          {customers.map((customer) => (
            <Link key={customer.id} href={`/admin/customers/${customer.id}`} style={{ textDecoration: 'none' }}>
              <div
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.12s' }}
                onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.borderColor = C.hoverBorder}
                onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text, marginBottom: 2 }}>
                      {customer.name}
                    </p>
                    {customer.company && (
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginBottom: 6 }}>{customer.company}</p>
                    )}
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
                      {projectCounts[customer.id] || 0} prosjekt{(projectCounts[customer.id] || 0) !== 1 ? 'er' : ''}
                    </p>
                  </div>
                  <svg width="14" height="14" fill="none" stroke={C.text3} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
