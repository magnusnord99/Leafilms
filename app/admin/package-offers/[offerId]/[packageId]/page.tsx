'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Customer, TeamMember, PriceCatalogItem, DiscountFactor, EquipmentGroupWithItems, QuoteBuilderData, SalesFlyerPackageCategory } from '@/lib/types'
import { QuoteBuilder } from '@/components/quote/QuoteBuilder'
import { C } from '@/lib/admin-theme'
import {
  getPackageForEditor,
  savePackageQuoteData,
  renamePackage,
  setPackageCategory,
  duplicatePackage,
  createProjectQuoteFromPackage,
  type PackageForEditor,
} from '@/lib/actions/package-offers'

const PACKAGE_CATEGORY_LABEL: Record<SalesFlyerPackageCategory, string> = {
  foto: 'Bilder',
  film: 'Film',
  foto_film: 'Bilder og film',
}

type Props = {
  params: Promise<{ offerId: string; packageId: string }>
}

export default function PackageEditorPage({ params }: Props) {
  const { offerId, packageId } = use(params)
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [notFoundError, setNotFoundError] = useState<string | null>(null)
  const [pkg, setPkg] = useState<PackageForEditor | null>(null)
  const [builderData, setBuilderData] = useState<QuoteBuilderData | null>(null)

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [priceCatalog, setPriceCatalog] = useState<PriceCatalogItem[]>([])
  const [equipmentGroups, setEquipmentGroups] = useState<EquipmentGroupWithItems[]>([])
  const [discountFactors, setDiscountFactors] = useState<DiscountFactor[]>([])

  const [saving, setSaving] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [renamingLabel, setRenamingLabel] = useState(false)
  const [labelValue, setLabelValue] = useState('')

  const [showDuplicateToCustomer, setShowDuplicateToCustomer] = useState(false)
  const [duplicateCustomerId, setDuplicateCustomerId] = useState('')
  const [duplicateNewName, setDuplicateNewName] = useState('')
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)

  useEffect(() => { loadAll() }, [packageId])

  async function loadAll() {
    setLoading(true)
    try {
      const [result, teamRes, customersRes, catalogRes, equipmentGroupsRes, discountFactorsRes] = await Promise.all([
        getPackageForEditor(packageId),
        supabase.from('team_members').select('*').order('order_index'),
        supabase.from('customers').select('*').order('name'),
        supabase.from('price_catalog').select('*').order('category').order('name'),
        supabase.from('equipment_groups').select('*, items:equipment_group_items(*, catalog_item:price_catalog(*))').order('name'),
        supabase.from('discount_factors').select('*').order('shoot_day'),
      ])

      if ('error' in result) {
        setNotFoundError(result.error)
        return
      }
      setPkg(result)
      setBuilderData(result.quoteData)
      setTeamMembers((teamRes.data || []) as TeamMember[])
      setCustomers((customersRes.data || []) as Customer[])
      setPriceCatalog((catalogRes.data || []) as PriceCatalogItem[])
      setEquipmentGroups((equipmentGroupsRes.data || []) as EquipmentGroupWithItems[])
      setDiscountFactors((discountFactorsRes.data || []) as DiscountFactor[])
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(data: QuoteBuilderData) {
    setSaving(true)
    setSaveMessage(null)
    try {
      const result = await savePackageQuoteData(packageId, data)
      if ('error' in result) {
        setSaveMessage(result.error)
        return
      }
      setBuilderData(data)
      setSaveMessage('Lagret!')
      setTimeout(() => setSaveMessage(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  async function handleGeneratePDF(data: QuoteBuilderData) {
    setGeneratingPDF(true)
    try {
      await handleSave(data)
      const response = await fetch('/api/generate-quote-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          builderData: data,
          language: data.language,
          mva: data.includeVat ? 'y' : 'n',
          saveToStorage: false,
        }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Kunne ikke generere PDF')
      }
      const blob = await response.blob()
      const xFilename = response.headers.get('X-Filename')
      const filename = xFilename || `Pakke_${pkg?.label || 'pakke'}.pdf`
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kunne ikke generere PDF')
    } finally {
      setGeneratingPDF(false)
    }
  }

  function startRenameLabel() {
    if (!pkg) return
    setLabelValue(pkg.label)
    setRenamingLabel(true)
  }

  async function saveRenameLabel() {
    setRenamingLabel(false)
    if (!pkg) return
    const label = labelValue.trim()
    if (!label || label === pkg.label) return
    const result = await renamePackage(pkg.id, label)
    if ('error' in result) {
      alert(result.error)
      return
    }
    setPkg({ ...pkg, label })
  }

  async function handleCategoryChange(category: SalesFlyerPackageCategory) {
    if (!pkg) return
    const result = await setPackageCategory(pkg.id, category)
    if ('error' in result) {
      alert(result.error)
      return
    }
    setPkg({ ...pkg, category })
  }

  async function handleDuplicate() {
    const result = await duplicatePackage(packageId)
    if ('error' in result) {
      alert(result.error)
      return
    }
    router.push(`/admin/package-offers/${offerId}/${result.id}`)
  }

  async function handleDuplicateToCustomerSubmit() {
    const customer = duplicateCustomerId
      ? { existingCustomerId: duplicateCustomerId }
      : { newCustomerName: duplicateNewName.trim() }
    if (!duplicateCustomerId && !('newCustomerName' in customer && customer.newCustomerName)) {
      setDuplicateError('Velg en eksisterende kunde, eller skriv inn navn på en ny kunde')
      return
    }
    setDuplicating(true)
    setDuplicateError(null)
    try {
      const result = await createProjectQuoteFromPackage(packageId, customer)
      if ('error' in result) {
        setDuplicateError(result.error)
        return
      }
      setShowDuplicateToCustomer(false)
      router.push(`/admin/projects/${result.projectId}/quote?quote=${result.quoteId}`)
    } finally {
      setDuplicating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Laster...
        </p>
      </div>
    )
  }

  if (notFoundError || !pkg || !builderData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.text3 }}>{notFoundError || 'Fant ikke pakken'}</p>
        <Link href="/admin/package-offers" style={{ color: C.accent, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem' }}>← Tilbake til pakketilbud</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: C.bg, color: C.text }}>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6 pb-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div>
            <Link href="/admin/package-offers" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, textDecoration: 'none' }}>
              ← Pakketilbud
            </Link>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.95rem', fontWeight: 600, color: C.text, marginTop: 4 }}>
              {pkg.offer.title}
            </p>
          </div>
          {saveMessage && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: saveMessage === 'Lagret!' ? C.success : C.danger }}>
              {saveMessage}
            </p>
          )}
        </div>

        {/* Søster-pakker i samme pakketilbud — flat fane-bytter, ikke en versjons-/
            historikk-UI, siden disse er sideordnede pakker, ikke revisjoner av hverandre. */}
        {pkg.siblings.length > 1 && (
          <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}`, marginBottom: 20, flexWrap: 'wrap' }}>
            {pkg.siblings.map(s => (
              <Link
                key={s.id}
                href={`/admin/package-offers/${offerId}/${s.id}`}
                style={{
                  padding: '8px 12px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
                  fontWeight: s.id === pkg.id ? 600 : 400,
                  borderBottom: `2px solid ${s.id === pkg.id ? C.accent : 'transparent'}`,
                  color: s.id === pkg.id ? C.text : C.text3, textDecoration: 'none', marginBottom: -1,
                }}
              >
                {s.label}
              </Link>
            ))}
          </div>
        )}

        <div className="mb-6" style={{ padding: '14px 18px', borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 200 }}>
              {renamingLabel ? (
                <input
                  autoFocus
                  value={labelValue}
                  onChange={e => setLabelValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveRenameLabel(); if (e.key === 'Escape') setRenamingLabel(false) }}
                  onBlur={saveRenameLabel}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text, background: C.surface2, border: `1px solid ${C.accent}`, borderRadius: 6, padding: '4px 8px', maxWidth: 260 }}
                />
              ) : (
                <p onClick={startRenameLabel} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text, cursor: 'pointer' }} title="Klikk for å endre navn">
                  {pkg.label}
                </p>
              )}
              <select
                value={pkg.category ?? ''}
                onChange={e => handleCategoryChange(e.target.value as SalesFlyerPackageCategory)}
                style={{ padding: '5px 8px', borderRadius: 6, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', outline: 'none' }}
              >
                <option value="" disabled>Velg kategori</option>
                <option value="foto">{PACKAGE_CATEGORY_LABEL.foto}</option>
                <option value="film">{PACKAGE_CATEGORY_LABEL.film}</option>
                <option value="foto_film">{PACKAGE_CATEGORY_LABEL.foto_film}</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDuplicate}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: C.accentBg, color: C.accent, border: '1px solid rgba(124,92,252,0.25)' }}
              >
                Dupliser denne pakken
              </button>
              <button
                type="button"
                onClick={() => { setDuplicateCustomerId(''); setDuplicateNewName(''); setDuplicateError(null); setShowDuplicateToCustomer(true) }}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: C.text2, border: `1px solid ${C.border}` }}
              >
                Opprett tilbud til kunde
              </button>
            </div>
          </div>
        </div>

        <QuoteBuilder
          key={pkg.id}
          initialData={builderData}
          teamMembers={teamMembers}
          customers={customers}
          priceCatalog={priceCatalog}
          equipmentGroups={equipmentGroups}
          discountFactors={discountFactors}
          onSave={handleSave}
          onGeneratePDF={handleGeneratePDF}
          saving={saving}
          generatingPDF={generatingPDF}
        />
      </div>

      {showDuplicateToCustomer && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', zIndex: 50 }}
          onClick={() => !duplicating && setShowDuplicateToCustomer(false)}
        >
          <div
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text }}>
                Opprett tilbud til kunde
              </p>
              <button onClick={() => setShowDuplicateToCustomer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1.1rem', lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>
              Oppretter et helt nytt prosjekt og tilbud, basert på &quot;{pkg.label}&quot;. Pakken selv endres ikke.
            </p>
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 4 }}>
                Kunde
              </label>
              <select
                value={duplicateCustomerId}
                onChange={e => setDuplicateCustomerId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none' }}
              >
                <option value="">— Ny kunde —</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.customer_number ? ` — #${c.customer_number}` : ''}
                  </option>
                ))}
              </select>
            </div>
            {!duplicateCustomerId && (
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 4 }}>
                  Navn på ny kunde
                </label>
                <input
                  type="text"
                  autoFocus
                  value={duplicateNewName}
                  onChange={e => setDuplicateNewName(e.target.value)}
                  placeholder="Kundenavn"
                  style={{ width: '100%', padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none' }}
                />
              </div>
            )}
            {duplicateError && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger }}>{duplicateError}</p>
            )}
            <button
              type="button"
              onClick={handleDuplicateToCustomerSubmit}
              disabled={duplicating}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '9px 18px', borderRadius: 8, cursor: duplicating ? 'default' : 'pointer', background: C.accent, color: '#fff', border: 'none', opacity: duplicating ? 0.6 : 1 }}
            >
              {duplicating ? 'Opprettter…' : 'Opprett'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
