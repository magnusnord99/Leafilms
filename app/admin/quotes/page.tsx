'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { C } from '@/lib/admin-theme'
import { timeAgo } from '@/lib/format'
import { getQuoteAmountExclVat } from '@/lib/quote-builder-utils'
import {
  listPackageTemplateQuotes,
  createPackageTemplateQuote,
  markQuoteAsPackage,
  checkQuoteUsedOnPublishedFlyers,
  deletePackageTemplateQuote,
  type PackageTemplateQuote,
} from '@/lib/actions/quote-packages'
import type { QuoteBuilderData, SalesFlyerPackageCategory } from '@/lib/types'

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

const PACKAGE_CATEGORY_LABEL: Record<SalesFlyerPackageCategory, string> = {
  foto: 'Bilder',
  film: 'Film',
  foto_film: 'Bilder og film',
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

  // "Aktive tilbud" (dagens visning) vs. "Pakkemaler" (pakke-tilbud for flyer-editoren,
  // skjult fra pipeline/Kanban via is_package_template — se Task 5/6 i sales-flyers-planen).
  const [tab, setTab] = useState<'aktive' | 'pakker'>('aktive')

  // Prosjektvelger for "+ Opprett tilbud" — et tilbud hører alltid til et prosjekt,
  // så vi lar brukeren søke opp/velge prosjektet i stedet for et frittstående skjema.
  const [showPicker, setShowPicker] = useState(false)
  const [pickerProjects, setPickerProjects] = useState<PickerProject[] | null>(null)
  const [pickerLoading, setPickerLoading] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  // Pakkemaler-fanen
  const [packageQuotes, setPackageQuotes] = useState<PackageTemplateQuote[] | null>(null)
  // listPackageTemplateQuotes() returnerer ikke project_id (kun det quote-byggeren
  // trenger), så vi slår opp prosjekt-id per quote-id separat for lenkene i listen.
  const [packageProjectIds, setPackageProjectIds] = useState<Record<string, string>>({})
  const [packagesLoading, setPackagesLoading] = useState(false)
  const [showPackageForm, setShowPackageForm] = useState(false)
  const [packageLabel, setPackageLabel] = useState('')
  const [packageCategory, setPackageCategory] = useState<SalesFlyerPackageCategory>('foto')
  const [packageSaving, setPackageSaving] = useState(false)
  const [packageError, setPackageError] = useState<string | null>(null)

  // Inline rename rett i oversikten
  const [renamingPackageId, setRenamingPackageId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  // Sletting krever samme bekreftelse-ved-flyer-bruk som "Fjern pakke"-knappen i
  // tilbudsbyggeren (checkQuoteUsedOnPublishedFlyers) — vist som en liten dialog
  // med listen over berørte flyer-slugs, i stedet for en enkel confirm().
  const [deletingPackage, setDeletingPackage] = useState<PackageTemplateQuote | null>(null)
  const [deleteFlyerSlugs, setDeleteFlyerSlugs] = useState<string[] | null>(null)
  const [deleteChecking, setDeleteChecking] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)

  useEffect(() => { fetchQuotes() }, [])

  useEffect(() => {
    if (tab === 'pakker' && packageQuotes === null) {
      fetchPackageQuotes()
    }
  }, [tab, packageQuotes])

  async function fetchPackageQuotes() {
    setPackagesLoading(true)
    try {
      const data = await listPackageTemplateQuotes()
      setPackageQuotes(data)
      if (data.length > 0) {
        const { data: rows } = await supabase
          .from('quotes')
          .select('id, project_id')
          .in('id', data.map(q => q.id))
        const map: Record<string, string> = {}
        for (const row of (rows ?? []) as { id: string; project_id: string }[]) {
          map[row.id] = row.project_id
        }
        setPackageProjectIds(map)
      }
    } finally {
      setPackagesLoading(false)
    }
  }

  function openPackageForm() {
    setPackageLabel('')
    setPackageCategory('foto')
    setPackageError(null)
    setShowPackageForm(true)
  }

  async function handleCreatePackage() {
    const label = packageLabel.trim()
    if (!label) {
      setPackageError('Pakken må ha et navn')
      return
    }
    setPackageSaving(true)
    setPackageError(null)
    try {
      const result = await createPackageTemplateQuote({ package_label: label, package_category: packageCategory })
      if ('error' in result) {
        setPackageError(result.error)
        return
      }
      setPackageQuotes(prev => [
        ...(prev ?? []),
        { id: result.quoteId, package_label: label, package_category: packageCategory, package_order: 0, amount: 0 },
      ])
      setPackageProjectIds(prev => ({ ...prev, [result.quoteId]: result.projectId }))
      setShowPackageForm(false)
      router.push(`/admin/projects/${result.projectId}/quote?quote=${result.quoteId}`)
    } finally {
      setPackageSaving(false)
    }
  }

  function startRenamePackage(pkg: PackageTemplateQuote) {
    setRenamingPackageId(pkg.id)
    setRenameValue(pkg.package_label)
  }

  async function saveRenamePackage(pkg: PackageTemplateQuote) {
    const label = renameValue.trim()
    if (!label || label === pkg.package_label) {
      setRenamingPackageId(null)
      return
    }
    setRenameSaving(true)
    try {
      const result = await markQuoteAsPackage(pkg.id, {
        package_label: label,
        package_category: pkg.package_category,
        package_order: pkg.package_order,
      })
      if ('error' in result) {
        alert(result.error)
        return
      }
      setPackageQuotes(prev => (prev ?? []).map(p => p.id === pkg.id ? { ...p, package_label: label } : p))
      setRenamingPackageId(null)
    } finally {
      setRenameSaving(false)
    }
  }

  async function startDeletePackage(pkg: PackageTemplateQuote) {
    setDeletingPackage(pkg)
    setDeleteFlyerSlugs(null)
    setDeleteChecking(true)
    try {
      const { flyerSlugs } = await checkQuoteUsedOnPublishedFlyers(pkg.id)
      setDeleteFlyerSlugs(flyerSlugs)
    } finally {
      setDeleteChecking(false)
    }
  }

  async function confirmDeletePackage() {
    if (!deletingPackage) return
    setDeleteSaving(true)
    try {
      const result = await deletePackageTemplateQuote(deletingPackage.id)
      if ('error' in result) {
        alert(result.error)
        return
      }
      setPackageQuotes(prev => (prev ?? []).filter(p => p.id !== deletingPackage.id))
      setDeletingPackage(null)
      setDeleteFlyerSlugs(null)
    } finally {
      setDeleteSaving(false)
    }
  }

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
        .eq('is_package_template', false)
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
          projects(title, customers(name), client_name, is_package_template)
        `)
        .eq('is_current', true)
        .order('updated_at', { ascending: false })

      if (error) throw error

      type Row = {
        id: string; project_id: string; version: string; label: string | null
        status: QuoteRow['status']; accepted_at: string | null; pdf_path: string | null
        updated_at: string; quote_data: QuoteBuilderData | null; selected_addon_ids: string[] | null
        projects?: { title: string | null; client_name: string | null; customers?: { name: string | null } | null; is_package_template?: boolean | null } | null
      }
      // Filtrer bort pakkemal-prosjektet i JS i stedet for embedded-filter PostgREST-syntaks
      // (den er upålitelig for innebygde relasjoner) — se Task 5 i sales-flyers-planen.
      const rows = ((data || []) as unknown as Row[]).filter(q => !q.projects?.is_package_template)
      const mapped: QuoteRow[] = rows.map(q => ({
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
          {tab === 'aktive' ? (
            <button
              onClick={openPicker}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none', flexShrink: 0 }}
            >
              + Opprett tilbud
            </button>
          ) : (
            <button
              onClick={openPackageForm}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none', flexShrink: 0 }}
            >
              + Ny pakke-mal
            </button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 20 }}>
          {([['aktive', 'Aktive tilbud'], ['pakker', 'Pakkemaler']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setTab(val)}
              style={{
                padding: '8px 12px',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.8rem',
                fontWeight: tab === val ? 600 : 400,
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${tab === val ? C.accent : 'transparent'}`,
                color: tab === val ? C.text : C.text3,
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'color 0.1s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {showPackageForm && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', zIndex: 50 }}
            onClick={() => !packageSaving && setShowPackageForm(false)}
          >
            <div
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 12 }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text }}>
                  Ny pakke-mal
                </p>
                <button
                  onClick={() => setShowPackageForm(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1.1rem', lineHeight: 1, padding: 4 }}
                >
                  ×
                </button>
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 4 }}>
                  Navn på pakken
                </label>
                <input
                  type="text"
                  autoFocus
                  value={packageLabel}
                  onChange={e => setPackageLabel(e.target.value)}
                  placeholder="F.eks. Liten pakke"
                  style={{
                    width: '100%', padding: '8px 12px',
                    background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6,
                    color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 4 }}>
                  Kategori
                </label>
                <select
                  value={packageCategory}
                  onChange={e => setPackageCategory(e.target.value as SalesFlyerPackageCategory)}
                  style={{
                    width: '100%', padding: '8px 12px',
                    background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6,
                    color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none',
                  }}
                >
                  <option value="foto">Bilder</option>
                  <option value="film">Film</option>
                  <option value="foto_film">Bilder og film</option>
                </select>
              </div>
              {packageError && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger }}>
                  {packageError}
                </p>
              )}
              <button
                onClick={handleCreatePackage}
                disabled={packageSaving}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                  padding: '9px 18px', borderRadius: 8, cursor: packageSaving ? 'default' : 'pointer',
                  background: C.accent, color: '#fff', border: 'none', opacity: packageSaving ? 0.6 : 1,
                }}
              >
                {packageSaving ? 'Oppretter...' : 'Opprett pakke'}
              </button>
            </div>
          </div>
        )}

        {tab === 'aktive' && showPicker && (
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
                  color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none',
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

        {tab === 'aktive' && (
        <>
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
        </>
        )}

        {tab === 'pakker' && (
          packagesLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
              <div style={{ width: 20, height: 20, border: `1.5px solid ${C.border}`, borderTop: `1.5px solid ${C.accent}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
          ) : !packageQuotes || packageQuotes.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '56px 24px',
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              background: C.surface,
            }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>
                Ingen pakke-maler ennå
              </p>
            </div>
          ) : (
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
              {packageQuotes.map((pkg, i) => {
                const projectId = packageProjectIds[pkg.id]
                const isRenaming = renamingPackageId === pkg.id

                const labelBlock = isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveRenamePackage(pkg)
                      if (e.key === 'Escape') setRenamingPackageId(null)
                    }}
                    onBlur={() => saveRenamePackage(pkg)}
                    disabled={renameSaving}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text,
                      background: C.surface2, border: `1px solid ${C.accent}`, borderRadius: 6,
                      padding: '4px 8px', width: '100%', maxWidth: 260,
                    }}
                  />
                ) : (
                  <>
                    <p style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text,
                      marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {pkg.package_label}
                    </p>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                      {PACKAGE_CATEGORY_LABEL[pkg.package_category]}
                    </p>
                  </>
                )

                return (
                  <div
                    key={pkg.id}
                    style={{
                      borderBottom: i < packageQuotes.length - 1 ? `1px solid ${C.border}` : 'none',
                      background: C.surface,
                      transition: 'background 0.1s',
                      cursor: isRenaming ? 'default' : 'pointer',
                    }}
                    onClick={() => { if (!isRenaming && projectId) router.push(`/admin/projects/${projectId}/quote?quote=${pkg.id}`) }}
                    onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                    onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = C.surface}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
                      <div style={{ flex: 1, minWidth: 140 }}>{labelBlock}</div>
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, color: C.text, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {formatNok(pkg.amount)} eks. mva
                      </span>
                      {!isRenaming && (
                        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => startRenamePackage(pkg)}
                            aria-label="Endre navn"
                            style={{
                              padding: '5px 10px', background: 'transparent', color: C.text3,
                              fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
                              border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer',
                            }}
                          >
                            Endre navn
                          </button>
                          <button
                            onClick={() => startDeletePackage(pkg)}
                            aria-label="Slett pakke"
                            style={{
                              padding: '5px 10px', background: 'transparent', color: C.danger,
                              fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
                              border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer',
                            }}
                          >
                            Slett
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {deletingPackage && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
          onClick={() => !deleteSaving && (setDeletingPackage(null), setDeleteFlyerSlugs(null))}
        >
          <div
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 420, width: '90%' }}
            onClick={e => e.stopPropagation()}
          >
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, marginBottom: 10 }}>
              Slette «{deletingPackage.package_label}»?
            </p>
            {deleteChecking ? (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 18 }}>
                Sjekker om pakken brukes på publiserte flyere …
              </p>
            ) : deleteFlyerSlugs && deleteFlyerSlugs.length > 0 ? (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.danger, marginBottom: 18 }}>
                Denne pakken vises på {deleteFlyerSlugs.length > 1 ? 'publiserte flyere' : 'en publisert flyer'}: {deleteFlyerSlugs.join(', ')}.
                Sletter du likevel, forsvinner den fra flyeren også. Dette kan ikke angres.
              </p>
            ) : (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 18 }}>
                Dette kan ikke angres.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setDeletingPackage(null); setDeleteFlyerSlugs(null) }}
                disabled={deleteSaving}
                style={{
                  padding: '7px 14px', background: 'transparent', color: C.text3,
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                  border: `1px solid ${C.border}`, borderRadius: 6, cursor: deleteSaving ? 'default' : 'pointer',
                }}
              >
                Avbryt
              </button>
              <button
                onClick={confirmDeletePackage}
                disabled={deleteChecking || deleteSaving}
                style={{
                  padding: '7px 14px', background: C.danger, color: '#fff',
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500,
                  border: 'none', borderRadius: 6, cursor: deleteChecking || deleteSaving ? 'default' : 'pointer',
                  opacity: deleteChecking || deleteSaving ? 0.6 : 1,
                }}
              >
                {deleteSaving ? 'Sletter …' : 'Slett pakke'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
