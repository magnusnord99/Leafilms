'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { C } from '@/lib/admin-theme'
import { timeAgo } from '@/lib/format'

type ContractRow = {
  id: string
  project_id: string
  status: 'pending' | 'sent' | 'signed' | 'cancelled'
  signed_at: string | null
  pdf_url: string | null
  updated_at: string
  project_title: string | null
  customer_name: string | null
}

const STATUS_LABEL: Record<ContractRow['status'], string> = {
  pending: 'Ventende',
  sent: 'Sendt',
  signed: 'Signert',
  cancelled: 'Kansellert',
}

const STATUS_COLOR: Record<ContractRow['status'], string> = {
  pending: C.text3,
  sent: C.accent,
  signed: '#4CAF7D',
  cancelled: C.danger,
}

export default function ContractsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [contracts, setContracts] = useState<ContractRow[]>([])
  const [filterStatus, setFilterStatus] = useState<'all' | ContractRow['status']>('all')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchContracts() }, [])

  async function fetchContracts() {
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select(`
          id, project_id, status, signed_at, pdf_url, updated_at,
          projects(title, customers(name), client_name)
        `)
        .eq('is_current', true)
        .order('updated_at', { ascending: false })

      if (error) throw error

      type Row = {
        id: string; project_id: string; status: ContractRow['status']; signed_at: string | null
        pdf_url: string | null; updated_at: string
        projects?: { title: string | null; client_name: string | null; customers?: { name: string | null } | null } | null
      }
      const mapped: ContractRow[] = ((data || []) as unknown as Row[]).map(c => ({
        id: c.id,
        project_id: c.project_id,
        status: c.status,
        signed_at: c.signed_at,
        pdf_url: c.pdf_url,
        updated_at: c.updated_at,
        project_title: c.projects?.title ?? null,
        customer_name: c.projects?.customers?.name ?? c.projects?.client_name ?? null,
      }))
      setContracts(mapped)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = contracts.filter(c => {
    if (filterStatus !== 'all' && c.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      const name = (c.customer_name || '').toLowerCase()
      const title = (c.project_title || '').toLowerCase()
      if (!title.includes(q) && !name.includes(q)) return false
    }
    return true
  })

  const counts = {
    all: contracts.length,
    pending: contracts.filter(c => c.status === 'pending').length,
    sent: contracts.filter(c => c.status === 'sent').length,
    signed: contracts.filter(c => c.status === 'signed').length,
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 16px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, lineHeight: 1.2 }}>
            Kontrakter
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginTop: 4 }}>
            Alle kontrakter på tvers av prosjekter
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 260 }}>
            <svg
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              width="13" height="13" fill="none" stroke={C.text3} viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Søk på prosjekt eller kunde..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: C.text,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.78rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, alignSelf: 'flex-end' }}>
            {([['all', 'Alle', counts.all], ['pending', 'Ventende', counts.pending], ['sent', 'Sendt', counts.sent], ['signed', 'Signert', counts.signed]] as const).map(([val, label, count]) => (
              <button
                key={val}
                onClick={() => setFilterStatus(val)}
                style={{
                  padding: '8px 12px',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.78rem',
                  fontWeight: filterStatus === val ? 600 : 400,
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${filterStatus === val ? C.accent : 'transparent'}`,
                  color: filterStatus === val ? C.text : C.text3,
                  cursor: 'pointer',
                  marginBottom: -1,
                  transition: 'color 0.1s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {label}
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: 500,
                  color: filterStatus === val ? C.accent : C.text3,
                  background: filterStatus === val ? C.accentBg : C.surface2,
                  padding: '1px 5px',
                  borderRadius: 4,
                  minWidth: 18,
                  textAlign: 'center',
                }}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 20, height: 20, border: `1.5px solid ${C.border}`, borderTop: `1.5px solid ${C.accent}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '56px 24px',
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            background: C.surface,
          }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>
              {contracts.length === 0 ? 'Ingen kontrakter ennå' : 'Ingen kontrakter matcher filteret'}
            </p>
          </div>
        ) : (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {filtered.map((contract, i) => (
              <div
                key={contract.id}
                style={{
                  borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
                  background: C.surface,
                  transition: 'background 0.1s',
                  cursor: 'pointer',
                }}
                onClick={() => router.push(`/admin/projects/${contract.project_id}?tab=kontrakt`)}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = C.surface}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 16px' }}>

                  <div style={{ flex: 1, minWidth: 140 }}>
                    <p style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text,
                      marginBottom: contract.customer_name ? 2 : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {contract.project_title || '(uten tittel)'}
                    </p>
                    {contract.customer_name && (
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                        {contract.customer_name}
                      </p>
                    )}
                  </div>

                  <span style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 500,
                    color: STATUS_COLOR[contract.status], background: `${STATUS_COLOR[contract.status]}18`,
                    padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {STATUS_LABEL[contract.status]}
                  </span>

                  {contract.signed_at && (
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Signert {new Date(contract.signed_at).toLocaleDateString('nb-NO')}
                    </span>
                  )}

                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {timeAgo(contract.updated_at)}
                  </span>

                  <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {contract.pdf_url && (
                      <a
                        href={contract.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '5px 10px',
                          background: 'transparent',
                          color: C.text3,
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: '0.72rem',
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          textDecoration: 'none',
                          transition: 'color 0.12s, border-color 0.12s',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLAnchorElement).style.color = C.text
                          ;(e.currentTarget as HTMLAnchorElement).style.borderColor = C.text2
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLAnchorElement).style.color = C.text3
                          ;(e.currentTarget as HTMLAnchorElement).style.borderColor = C.border
                        }}
                      >
                        Se PDF
                      </a>
                    )}
                    <Link
                      href={`/admin/projects/${contract.project_id}?tab=kontrakt`}
                      style={{ textDecoration: 'none' }}
                      onClick={e => e.stopPropagation()}
                    >
                      <button style={{
                        padding: '5px 10px',
                        background: 'transparent',
                        color: C.text3,
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.72rem',
                        border: `1px solid ${C.border}`,
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}>
                        Åpne
                      </button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
