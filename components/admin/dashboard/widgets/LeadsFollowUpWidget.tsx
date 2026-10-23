'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllLeads, type LeadRecord } from '@/lib/actions/leads'
import { LEAD_TEMPERATURE_CONFIG } from '@/lib/lead-temperature'
import { C } from '@/lib/admin-theme'
import { WidgetHeader, Btn } from '../shared'

const ACTIVE_STATUSES = new Set(['new', 'contacted', 'meeting_booked'])

export default function LeadsFollowUpWidget() {
  const [loading, setLoading] = useState(true)
  const [leads, setLeads] = useState<LeadRecord[]>([])

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      const data = await getAllLeads()
      setLeads(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return null

  const todayKey = new Date().toISOString().slice(0, 10)
  const needsFollowUp = leads
    .filter((l) => ACTIVE_STATUSES.has(l.status))
    .filter((l) => l.temperature === 'warm' || (!!l.contact_deadline && l.contact_deadline <= todayKey))
    .sort((a, b) => (a.contact_deadline ?? '9999-12-31').localeCompare(b.contact_deadline ?? '9999-12-31'))
    .slice(0, 6)

  return (
    <div>
      <WidgetHeader title="Leads som trenger oppfølging" action={<Btn href="/admin/leads" variant="ghost">Se alle →</Btn>} />
      {needsFollowUp.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '24px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>Ingen leads trenger oppfølging nå</p>
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {needsFollowUp.map((lead, i) => {
            const overdue = !!lead.contact_deadline && lead.contact_deadline < todayKey
            const tempConfig = lead.temperature ? LEAD_TEMPERATURE_CONFIG[lead.temperature] : null
            return (
              <Link key={lead.id} href={`/admin/leads/${lead.id}`} style={{ textDecoration: 'none' }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    padding: '10px 14px', background: C.surface,
                    borderBottom: i < needsFollowUp.length - 1 ? `1px solid ${C.border}` : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                  onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = C.surface}
                >
                  <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tempConfig && (
                      <span title={tempConfig.label} style={{ width: 7, height: 7, borderRadius: '50%', background: tempConfig.color, flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {lead.company || lead.name}
                      </p>
                      {lead.company && (
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.name}</p>
                      )}
                    </div>
                  </div>
                  {lead.contact_deadline && (
                    <span style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500, flexShrink: 0,
                      color: overdue ? C.danger : C.text3,
                    }}>
                      {new Date(`${lead.contact_deadline}T00:00:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
