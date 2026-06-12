'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getLeadsWithMeta, deleteLead, LeadListItem, LeadStatus } from '@/lib/actions/leads'
import { C } from '@/lib/admin-theme'

const success = '#4CAF7D'
const warning = '#F0A500'

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string }> = {
  new:            { label: 'Ny',          color: C.text2   },
  contacted:      { label: 'Kontaktet',   color: C.accent  },
  meeting_booked: { label: 'Møte booket', color: warning   },
  converted:      { label: 'Konvertert',  color: success   },
  lost:           { label: 'Tapt',        color: C.danger  },
}

const SOURCE_LABELS: Record<string, string> = {
  market_analysis: 'Markedsanalyse',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  nettside: 'Nettside',
  referanse: 'Referanse',
  telefon: 'Telefon',
  annet: 'Annet',
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    getLeadsWithMeta().then(data => {
      setLeads(data)
      setLoading(false)
    })
  }, [])

  const filtered = filter === 'all' ? leads : leads.filter(l => l.status === filter)

  async function handleDelete(id: string) {
    if (confirmId !== id) { setConfirmId(id); return }
    setDeletingId(id)
    setConfirmId(null)
    await deleteLead(id)
    setLeads(prev => prev.filter(l => l.id !== id))
    setDeletingId(null)
  }

  const counts = leads.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 48px' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, lineHeight: 1.2, marginBottom: 4 }}>
              Leads
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>
              {leads.length} lead{leads.length !== 1 ? 's' : ''} totalt
            </p>
          </div>
          <Link href="/admin/leads/new">
            <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
              + Ny lead
            </button>
          </Link>
        </div>

        {/* Status filter */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
          {([
            { value: 'all', label: 'Alle', count: leads.length },
            ...Object.entries(STATUS_CONFIG).map(([v, c]) => ({ value: v, label: c.label, count: counts[v] ?? 0 })),
          ] as { value: string; label: string; count: number }[]).map(f => {
            const isActive = filter === f.value
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value as LeadStatus | 'all')}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: isActive ? 600 : 400,
                  padding: '8px 14px', background: 'none', border: 'none',
                  borderBottom: `2px solid ${isActive ? C.accent : 'transparent'}`,
                  color: isActive ? C.text : C.text3,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
                  marginBottom: -1, transition: 'color 0.1s',
                }}
              >
                {f.label}
                {f.count > 0 && (
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700, padding: '0 5px', borderRadius: 8, background: isActive ? C.accentBg : 'rgba(255,255,255,0.04)', color: isActive ? C.accent : C.text3, border: `1px solid ${isActive ? 'rgba(124,92,252,0.25)' : C.border}` }}>
                    {f.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Lista */}
        {filtered.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '64px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 500, color: C.text3, marginBottom: 16 }}>
              {filter === 'all' ? 'Ingen leads ennå' : `Ingen leads med status "${STATUS_CONFIG[filter as LeadStatus]?.label}"`}
            </p>
            {filter === 'all' && (
              <Link href="/admin/leads/new">
                <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
                  Legg til første lead
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {filtered.map((lead, i) => {
              const status = STATUS_CONFIG[lead.status]
              const href = lead.converted_to_project_id
                ? `/admin/projects/${lead.converted_to_project_id}/contact`
                : `/admin/leads/${lead.id}`
              const isConfirming = confirmId === lead.id
              const isDeleting = deletingId === lead.id
              return (
                <div
                  key={lead.id}
                  style={{
                    position: 'relative',
                    borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
                  }}
                  onMouseLeave={() => { if (confirmId === lead.id) setConfirmId(null) }}
                >
                  <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: 16,
                        padding: '14px 20px', paddingRight: 56,
                        background: C.surface,
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = C.surface}
                    >
                      {/* Avatar */}
                      <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: C.accentBg, border: `1px solid rgba(124,92,252,0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 700, color: C.accent }}>
                          {(lead.company || lead.name)[0].toUpperCase()}
                        </span>
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lead.company || lead.name}
                          </p>
                          {lead.company && lead.name !== lead.company && (
                            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                              {lead.name}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {lead.email && (
                            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>{lead.email}</span>
                          )}
                          {lead.phone && (
                            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>{lead.phone}</span>
                          )}
                          {lead.source && (
                            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
                              {SOURCE_LABELS[lead.source] ?? lead.source}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Ansvarlig + åpne oppgaver */}
                      {lead.assigned_profile && (
                        <span
                          title={`Ansvarlig: ${lead.assigned_profile.name ?? lead.assigned_profile.email}`}
                          style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: C.accent, color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700,
                          }}
                        >
                          {(lead.assigned_profile.name ?? lead.assigned_profile.email)[0].toUpperCase()}
                        </span>
                      )}
                      {lead.open_tasks > 0 && (
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, flexShrink: 0 }}>
                          {lead.open_tasks} oppgave{lead.open_tasks !== 1 ? 'r' : ''}
                        </span>
                      )}

                      {/* Sales points count */}
                      {(lead.sales_points ?? []).length > 0 && (
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, flexShrink: 0 }}>
                          {(lead.sales_points ?? []).length} salgspunkt{(lead.sales_points ?? []).length !== 1 ? 'er' : ''}
                        </span>
                      )}

                      {/* Date */}
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, flexShrink: 0 }}>
                        {new Date(lead.created_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}
                      </span>

                      {/* Status */}
                      <span style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600,
                        letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0,
                        color: status.color, background: `${status.color}14`,
                        border: `1px solid ${status.color}28`,
                        padding: '3px 9px', borderRadius: 5,
                      }}>
                        {status.label}
                      </span>

                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M5 3l4 4-4 4" stroke={C.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </Link>

                  {/* Delete button — outside the link */}
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(lead.id) }}
                    disabled={isDeleting}
                    title={isConfirming ? 'Klikk igjen for å bekrefte' : 'Slett lead'}
                    style={{
                      position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600,
                      padding: isConfirming ? '4px 8px' : '5px',
                      borderRadius: 5, cursor: isDeleting ? 'not-allowed' : 'pointer',
                      background: isConfirming ? `${C.danger}18` : 'transparent',
                      color: isConfirming ? C.danger : C.text3,
                      border: `1px solid ${isConfirming ? `${C.danger}40` : 'transparent'}`,
                      transition: 'all 0.12s',
                      opacity: isDeleting ? 0.5 : 1,
                    }}
                    onMouseEnter={e => {
                      if (!isConfirming) (e.currentTarget as HTMLButtonElement).style.color = C.danger
                    }}
                    onMouseLeave={e => {
                      if (!isConfirming) (e.currentTarget as HTMLButtonElement).style.color = C.text3
                    }}
                  >
                    {isConfirming && <span>Sikker?</span>}
                    {isDeleting
                      ? <span style={{ fontSize: '0.6rem' }}>...</span>
                      : (
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M2 3.5h10M5.5 3.5V2.5h3v1M5 3.5l.5 8M9 3.5l-.5 8" />
                        </svg>
                      )
                    }
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
