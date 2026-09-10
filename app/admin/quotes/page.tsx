'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { C } from '@/lib/admin-theme'
import { timeAgo } from '@/lib/format'
import { getQuoteAmountExclVat } from '@/lib/quote-builder-utils'
import type { QuoteBuilderData } from '@/lib/types'

type PickerProject = {
  id: string
  title: string
  client_name: string | null
  customers: { name: string | null } | null
  updated_at: string
}

type QuoteRow = {
  id: string
  project_id: string
  version: string
  label: string | null
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
  accepted_at: string | null
  pdf_path: string | null
  updated_at: string
  project_title: string | null
  customer_name: string | null
  amount: number | null
}

const STATUS_LABEL: Record<QuoteRow['status'], string> = {
  draft: 'Utkast',
  sent: 'Sendt',
  accepted: 'Godtatt',
  rejected: 'Avslått',
}

const STATUS_COLOR: Record<QuoteRow['status'], string> = {
  draft: C.text3,
  sent: C.accent,
  accepted: '#4CAF7D',
  rejected: C.danger,
}

function formatNok(amount: number): string {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(amount)
}

export default function QuotesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [filterStatus, setFilterStatus] = useState<'all' | QuoteRow['status']>('all')
  const [search, setSearch] = useState('')

  // Prosjektvelger for "+ Opprett tilbud" — et tilbud hører alltid til et prosjekt,
  // så vi lar brukeren søke opp/velge prosjektet i stedet for et frittstående skjema.
  const [showPicker, setShowPicker] = useState(false)
  const [pickerProjects, setPickerProjects] = useState<PickerProject[] | null>(null)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  useEffect(() => { fetchQuotes() }, [])

  async function openPicker() {
    setShowPicker(true)
    setPickerSearch('')
    if (pickerProjects) return
    setPickerLoading(true)
    try {
      const { data } = await supabase
        .from('projects')
        .select('id, title, client_name, customers(name), updated_at')
        .neq('status', 'archived')
        .order('updated_at', { ascending: false })
      setPickerProjects((data ?? []) as unknown as PickerProject[])
    } finally {
      setPickerLoading(false)
    }
  }

  // Kun kladder kan slettes herfra — contracts.quote_id har ON DELETE CASCADE, så å
  // slette et sendt/akseptert tilbud ville også fjernet en eventuell signert kontrakt.
  async function handleDelete(quote: QuoteRow) {
    if (quote.status !== 'draft') return
    if (!confirm(`Slette tilbudet for ${quote.project_title || 'dette prosjektet'}? Dette kan ikke angres.`)) return
    const { error } = await supabase.from('quotes').delete().eq('id', quote.id)
    if (error) {
      alert('Kunne ikke slette tilbudet: ' + error.message)
      return
    }
    setQuotes(prev => prev.filter(q => q.id !== quote.id))
  }

  const filteredPickerProjects = (pickerProjects ?? []).filter(p => {
    if (!pickerSearch.trim()) return true
    const q = pickerSearch.toLowerCase()
    const customerName = p.customers?.name ?? p.client_name ?? ''
    return p.title.toLowerCase().includes(q) || customerName.toLowerCase().includes(q)
  })

  async function fetchQuotes() {
    try {
      const { data, error } = await supabase
        .from('quotes')
        .select(`
          id, project_id, version, label, status, accepted_at, pdf_path, updated_at, quote_data, selected_addon_ids,
          projects(title, customers(name), client_name)
        `)
        .eq('is_current', true)
        .order('updated_at', { ascending: false })

      if (error) throw error

      type Row = {
        id: string; project_id: string; version: string; label: string | null
        status: QuoteRow['status']; accepted_at: string | null; pdf_path: string | null
        updated_at: string; quote_data: QuoteBuilderData | null; selected_addon_ids: string[] | null
        projects?: { title: string | null; client_name: string | null; customers?: { name: string | null } | null } | null
      }
      const mapped: QuoteRow[] = ((data || []) as unknown as Row[]).map(q => ({
        id: q.id,
        project_id: q.project_id,
        version: q.version,
        label: q.label,
        status: q.status,
        accepted_at: q.accepted_at,
        pdf_path: q.pdf_path,
        updated_at: q.updated_at,
        project_title: q.projects?.title ?? null,
        customer_name: q.projects?.customers?.name ?? q.projects?.client_name ?? null,
        amount: getQuoteAmountExclVat(q.quote_data, q.selected_addon_ids ?? undefined),
      }))
      setQuotes(mapped)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = quotes.filter(q => {
    if (filterStatus !== 'all' && q.status !== filterStatus) return false
    if (search) {
      const s = search.toLowerCase()
      const name = (q.customer_name || '').toLowerCase()
      const title = (q.project_title || '').toLowerCase()
      if (!title.includes(s) && !name.includes(s)) return false
    }
    return true
  })

  const counts = {
    all: quotes.length,
    draft: quotes.filter(q => q.status === 'draft').length,
    sent: quotes.filter(q => q.status === 'sent').length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 16px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, lineHeight: 1.2 }}>
              Tilbud
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginTop: 4 }}>
              Alle tilbud på tvers av prosjekter
            </p>
          </div>
          <button
            onClick={openPicker}
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none', flexShrink: 0 }}
          >
            + Opprett tilbud
          </button>
        </div>

        {showPicker && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', zIndex: 50 }}
            onClick={() => setShowPicker(false)}
          >
            <div
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, width: '100%', maxWidth: 440, maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text }}>
                  Velg prosjekt for tilbudet
                </p>
                <button
                  onClick={() => setShowPicker(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1.1rem', lineHeight: 1, padding: 4 }}
                >
                  ×
                </button>
              </div>
              <input
                type="text"
                autoFocus
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                placeholder="Søk på tittel eller kunde..."
                style={{
                  width: '100%', padding: '8px 12px', marginBottom: 12,
                  background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6,
                  color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', outline: 'none',
                }}
              />
              <Link
                href="/admin/projects/new"
                style={{
                  display: 'block', textAlign: 'left', padding: '10px 12px', marginBottom: 10,
                  background: C.accentBg, border: `1px dashed ${C.accent}`, borderRadius: 6,
                  textDecoration: 'none',
                }}
              >
                <span style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.accent }}>
                  + Nytt prosjekt
                </span>
                <span style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 2 }}>
                  Prosjektet trenger ikke en pitch — bare tittel og kunde, så går du rett til tilbudet
                </span>
              </Link>
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pickerLoading && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, padding: '8px 0' }}>Laster prosjekter...</p>
                )}
                {!pickerLoading && filteredPickerProjects.length === 0 && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, padding: '8px 0' }}>Fant ingen prosjekter.</p>
                )}
                {!pickerLoading && filteredPickerProjects.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => router.push(`/admin/projects/${p.id}/quote`)}
                    style={{
                      textAlign: 'left', padding: '10px 12px', background: C.surface2,
                      border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer',
                    }}
                  >
                    <span style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text }}>
                      {p.title || '(uten tittel)'}
                    </span>
                    <span style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 2 }}>
                      {p.customers?.name ?? p.client_name ?? 'Ingen kunde'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

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
                fontSize: '1rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, alignSelf: 'flex-end' }}>
            {([['all', 'Alle', counts.all], ['draft', 'Utkast', counts.draft], ['sent', 'Sendt', counts.sent], ['accepted', 'Godtatt', counts.accepted]] as const).map(([val, label, count]) => (
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
              {quotes.length === 0 ? 'Ingen tilbud ennå' : 'Ingen tilbud matcher filteret'}
            </p>
          </div>
        ) : (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {filtered.map((quote, i) => (
              <div
                key={quote.id}
                style={{
                  borderBottom: i < filtered.length - 1 ? `1px solid ${C.border}` : 'none',
                  background: C.surface,
                  transition: 'background 0.1s',
                  cursor: 'pointer',
                }}
                onClick={() => router.push(`/admin/projects/${quote.project_id}/quote`)}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = C.surface}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 16px' }}>

                  <div style={{ flex: 1, minWidth: 140 }}>
                    <p style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text,
                      marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {quote.project_title || '(uten tittel)'}
                    </p>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                      {[quote.customer_name, quote.label || quote.version].filter(Boolean).join(' · ')}
                    </p>
                  </div>

                  {quote.amount != null && (
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, color: C.text, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {formatNok(quote.amount)}
                    </span>
                  )}

                  <span style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 500,
                    color: STATUS_COLOR[quote.status], background: `${STATUS_COLOR[quote.status]}18`,
                    padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {STATUS_LABEL[quote.status]}
                  </span>

                  {quote.accepted_at && (
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Godtatt {new Date(quote.accepted_at).toLocaleDateString('nb-NO')}
                    </span>
                  )}

                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {timeAgo(quote.updated_at)}
                  </span>

                  <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {quote.pdf_path && (
                      <a
                        href={supabase.storage.from('assets').getPublicUrl(quote.pdf_path).data.publicUrl}
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
                      href={`/admin/projects/${quote.project_id}/quote`}
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
                    {quote.status === 'draft' && (
                      <button
                        onClick={() => handleDelete(quote)}
                        style={{
                          padding: '5px 10px',
                          background: 'transparent',
                          color: C.danger,
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: '0.72rem',
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        Slett
                      </button>
                    )}
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
