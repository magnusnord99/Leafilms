'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { C } from '@/lib/admin-theme'
import {
  listPackageOffers,
  createPackageOffer,
  renamePackageOffer,
  deletePackageOffer,
  createPackage,
  duplicatePackage,
  deletePackage,
  checkPackagesUsedOnPublishedFlyers,
  type PackageOfferWithPackages,
} from '@/lib/actions/package-offers'
import type { SalesFlyerPackageCategory } from '@/lib/types'

const PACKAGE_CATEGORY_LABEL: Record<SalesFlyerPackageCategory, string> = {
  foto: 'Bilder',
  film: 'Film',
  foto_film: 'Bilder og film',
}

type CustomerOption = { id: string; name: string }

function formatNok(amount: number): string {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(amount)
}

export default function PackageOffersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState<PackageOfferWithPackages[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])

  // "Nytt pakketilbud"
  const [showNewOffer, setShowNewOffer] = useState(false)
  const [newOfferIsInternal, setNewOfferIsInternal] = useState(false)
  const [newOfferCustomerId, setNewOfferCustomerId] = useState('')
  const [newOfferTitle, setNewOfferTitle] = useState('')
  const [newOfferSaving, setNewOfferSaving] = useState(false)
  const [newOfferError, setNewOfferError] = useState<string | null>(null)

  // Inline "+ Ny pakke" pr. pakketilbud
  const [addingPackageToOfferId, setAddingPackageToOfferId] = useState<string | null>(null)
  const [newPackageLabel, setNewPackageLabel] = useState('')
  const [newPackageCategory, setNewPackageCategory] = useState<SalesFlyerPackageCategory>('foto')
  const [newPackageSaving, setNewPackageSaving] = useState(false)

  // Inline rename av pakketilbudets tittel
  const [renamingOfferId, setRenamingOfferId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Slette-bekreftelse — delt for både hele pakketilbud og enkeltpakker
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'offer' | 'package'; id: string; label: string; packageIds: string[] } | null>(null)
  const [deleteFlyerSlugs, setDeleteFlyerSlugs] = useState<string[] | null>(null)
  const [deleteChecking, setDeleteChecking] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)

  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => { fetchOffers() }, [])

  async function fetchOffers() {
    setLoading(true)
    try {
      const data = await listPackageOffers()
      setOffers(data)
    } finally {
      setLoading(false)
    }
  }

  async function openNewOffer() {
    setNewOfferIsInternal(false)
    setNewOfferCustomerId('')
    setNewOfferTitle('')
    setNewOfferError(null)
    setShowNewOffer(true)
    if (customers.length === 0) {
      const { data } = await supabase.from('customers').select('id, name').order('name')
      setCustomers((data ?? []) as CustomerOption[])
    }
  }

  async function handleCreateOffer() {
    const title = newOfferTitle.trim()
    if (!title) {
      setNewOfferError('Pakketilbudet må ha en tittel')
      return
    }
    if (!newOfferIsInternal && !newOfferCustomerId) {
      setNewOfferError('Velg en kunde, eller kryss av «Internt (Leafilms)»')
      return
    }
    setNewOfferSaving(true)
    setNewOfferError(null)
    try {
      const result = await createPackageOffer({ customerId: newOfferIsInternal ? null : newOfferCustomerId, title })
      if ('error' in result) {
        setNewOfferError(result.error)
        return
      }
      setShowNewOffer(false)
      await fetchOffers()
    } finally {
      setNewOfferSaving(false)
    }
  }

  function startRenameOffer(offer: PackageOfferWithPackages) {
    setRenamingOfferId(offer.id)
    setRenameValue(offer.title)
  }

  async function saveRenameOffer(offer: PackageOfferWithPackages) {
    const title = renameValue.trim()
    setRenamingOfferId(null)
    if (!title || title === offer.title) return
    const result = await renamePackageOffer(offer.id, title)
    if ('error' in result) {
      setActionError(result.error)
      return
    }
    setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, title } : o))
  }

  function cancelRenameOffer() {
    setRenamingOfferId(null)
  }

  function openAddPackage(offerId: string) {
    setAddingPackageToOfferId(offerId)
    setNewPackageLabel('')
    setNewPackageCategory('foto')
  }

  async function handleAddPackage() {
    if (!addingPackageToOfferId) return
    const label = newPackageLabel.trim()
    if (!label) return
    setNewPackageSaving(true)
    try {
      const result = await createPackage(addingPackageToOfferId, { label, category: newPackageCategory })
      if ('error' in result) {
        setActionError(result.error)
        return
      }
      setAddingPackageToOfferId(null)
      router.push(`/admin/package-offers/${addingPackageToOfferId}/${result.id}`)
    } finally {
      setNewPackageSaving(false)
    }
  }

  async function handleDuplicatePackage(offerId: string, packageId: string) {
    const result = await duplicatePackage(packageId)
    if ('error' in result) {
      setActionError(result.error)
      return
    }
    await fetchOffers()
  }

  async function startDeleteOffer(offer: PackageOfferWithPackages) {
    setDeleteTarget({ kind: 'offer', id: offer.id, label: offer.title, packageIds: offer.packages.map(p => p.id) })
    setDeleteFlyerSlugs(null)
    setDeleteChecking(true)
    try {
      const { flyerSlugs } = await checkPackagesUsedOnPublishedFlyers(offer.packages.map(p => p.id))
      setDeleteFlyerSlugs(flyerSlugs)
    } finally {
      setDeleteChecking(false)
    }
  }

  async function startDeletePackage(packageId: string, label: string) {
    setDeleteTarget({ kind: 'package', id: packageId, label, packageIds: [packageId] })
    setDeleteFlyerSlugs(null)
    setDeleteChecking(true)
    try {
      const { flyerSlugs } = await checkPackagesUsedOnPublishedFlyers([packageId])
      setDeleteFlyerSlugs(flyerSlugs)
    } finally {
      setDeleteChecking(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleteSaving(true)
    try {
      const result = deleteTarget.kind === 'offer'
        ? await deletePackageOffer(deleteTarget.id)
        : await deletePackage(deleteTarget.id)
      if ('error' in result) {
        setActionError(result.error)
        return
      }
      setDeleteTarget(null)
      setDeleteFlyerSlugs(null)
      await fetchOffers()
    } finally {
      setDeleteSaving(false)
    }
  }

  // Gruppert pr. kunde — "Interne pakker" (customerId null) alltid først, deretter
  // kundene i den rekkefølgen listPackageOffers allerede sorterte dem (nyest redigert).
  const internalOffers = offers.filter(o => o.customerId === null)
  const customerGroups: { customerId: string; customerName: string; offers: PackageOfferWithPackages[] }[] = []
  for (const offer of offers) {
    if (offer.customerId === null) continue
    let group = customerGroups.find(g => g.customerId === offer.customerId)
    if (!group) {
      group = { customerId: offer.customerId, customerName: offer.customerName ?? '(ukjent kunde)', offers: [] }
      customerGroups.push(group)
    }
    group.offers.push(offer)
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 16px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, lineHeight: 1.2 }}>
              Pakketilbud
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginTop: 4 }}>
              Kunde (eller internt) → pakketilbud → pakker side ved side. Brukes på salgsflyere.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Link
              href="/admin/quotes"
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '8px 18px',
                borderRadius: 8, cursor: 'pointer', background: 'transparent', color: C.text2,
                border: `1px solid ${C.border}`, textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
              }}
            >
              ← Tilbud
            </Link>
            <button
              onClick={openNewOffer}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '8px 18px', borderRadius: 8, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none', flexShrink: 0 }}
            >
              + Nytt pakketilbud
            </button>
          </div>
        </div>

        {actionError && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger, marginBottom: 12 }}>
            {actionError}
          </p>
        )}

        <div style={{ marginTop: 24 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
              <div style={{ width: 20, height: 20, border: `1.5px solid ${C.border}`, borderTop: `1.5px solid ${C.accent}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
          ) : offers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '56px 24px', border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>
                Ingen pakketilbud ennå
              </p>
            </div>
          ) : (
            <>
              {internalOffers.length > 0 && (
                <CustomerGroup
                  title="Interne pakker"
                  offers={internalOffers}
                  onRenameOffer={startRenameOffer}
                  renamingOfferId={renamingOfferId}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  onSaveRename={saveRenameOffer}
                  onCancelRename={cancelRenameOffer}
                  onDeleteOffer={startDeleteOffer}
                  onAddPackage={openAddPackage}
                  addingPackageToOfferId={addingPackageToOfferId}
                  newPackageLabel={newPackageLabel}
                  setNewPackageLabel={setNewPackageLabel}
                  newPackageCategory={newPackageCategory}
                  setNewPackageCategory={setNewPackageCategory}
                  newPackageSaving={newPackageSaving}
                  onSubmitNewPackage={handleAddPackage}
                  onCancelNewPackage={() => setAddingPackageToOfferId(null)}
                  onDuplicatePackage={handleDuplicatePackage}
                  onDeletePackage={startDeletePackage}
                />
              )}
              {customerGroups.map(group => (
                <CustomerGroup
                  key={group.customerId}
                  title={group.customerName}
                  offers={group.offers}
                  onRenameOffer={startRenameOffer}
                  renamingOfferId={renamingOfferId}
                  renameValue={renameValue}
                  setRenameValue={setRenameValue}
                  onSaveRename={saveRenameOffer}
                  onCancelRename={cancelRenameOffer}
                  onDeleteOffer={startDeleteOffer}
                  onAddPackage={openAddPackage}
                  addingPackageToOfferId={addingPackageToOfferId}
                  newPackageLabel={newPackageLabel}
                  setNewPackageLabel={setNewPackageLabel}
                  newPackageCategory={newPackageCategory}
                  setNewPackageCategory={setNewPackageCategory}
                  newPackageSaving={newPackageSaving}
                  onSubmitNewPackage={handleAddPackage}
                  onCancelNewPackage={() => setAddingPackageToOfferId(null)}
                  onDuplicatePackage={handleDuplicatePackage}
                  onDeletePackage={startDeletePackage}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {showNewOffer && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', zIndex: 50 }}
          onClick={() => !newOfferSaving && setShowNewOffer(false)}
        >
          <div
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text }}>
                Nytt pakketilbud
              </p>
              <button onClick={() => setShowNewOffer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1.1rem', lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2, cursor: 'pointer' }}>
              <input type="checkbox" checked={newOfferIsInternal} onChange={e => setNewOfferIsInternal(e.target.checked)} />
              Internt (Leafilms) — ikke knyttet til en kunde
            </label>
            {!newOfferIsInternal && (
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 4 }}>
                  Kunde
                </label>
                <select
                  value={newOfferCustomerId}
                  onChange={e => setNewOfferCustomerId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none' }}
                >
                  <option value="">— Velg kunde —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 4 }}>
                Tittel på pakketilbudet
              </label>
              <input
                type="text"
                autoFocus
                value={newOfferTitle}
                onChange={e => setNewOfferTitle(e.target.value)}
                placeholder="F.eks. Bryllupspakker"
                style={{ width: '100%', padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none' }}
              />
            </div>
            {newOfferError && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger }}>{newOfferError}</p>
            )}
            <button
              onClick={handleCreateOffer}
              disabled={newOfferSaving}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '9px 18px', borderRadius: 8, cursor: newOfferSaving ? 'default' : 'pointer', background: C.accent, color: '#fff', border: 'none', opacity: newOfferSaving ? 0.6 : 1 }}
            >
              {newOfferSaving ? 'Oppretter...' : 'Opprett'}
            </button>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}
          onClick={() => !deleteSaving && (setDeleteTarget(null), setDeleteFlyerSlugs(null))}
        >
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, marginBottom: 10 }}>
              {deleteTarget.kind === 'offer' ? `Slette pakketilbudet «${deleteTarget.label}» med alle pakkene i det?` : `Slette «${deleteTarget.label}»?`}
            </p>
            {deleteChecking ? (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 18 }}>
                Sjekker om pakken(e) brukes på publiserte flyere …
              </p>
            ) : deleteFlyerSlugs && deleteFlyerSlugs.length > 0 ? (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.danger, marginBottom: 18 }}>
                Vises på {deleteFlyerSlugs.length > 1 ? 'publiserte flyere' : 'en publisert flyer'}: {deleteFlyerSlugs.join(', ')}.
                Sletter du likevel, forsvinner den/de fra flyeren også. Dette kan ikke angres.
              </p>
            ) : (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 18 }}>
                Dette kan ikke angres.
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setDeleteTarget(null); setDeleteFlyerSlugs(null) }}
                disabled={deleteSaving}
                style={{ padding: '7px 14px', background: 'transparent', color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', border: `1px solid ${C.border}`, borderRadius: 6, cursor: deleteSaving ? 'default' : 'pointer' }}
              >
                Avbryt
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteChecking || deleteSaving}
                style={{ padding: '7px 14px', background: C.danger, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, border: 'none', borderRadius: 6, cursor: deleteChecking || deleteSaving ? 'default' : 'pointer', opacity: deleteChecking || deleteSaving ? 0.6 : 1 }}
              >
                {deleteSaving ? 'Sletter …' : 'Slett'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CustomerGroup(props: {
  title: string
  offers: PackageOfferWithPackages[]
  onRenameOffer: (offer: PackageOfferWithPackages) => void
  renamingOfferId: string | null
  renameValue: string
  setRenameValue: (v: string) => void
  onSaveRename: (offer: PackageOfferWithPackages) => void
  onCancelRename: () => void
  onDeleteOffer: (offer: PackageOfferWithPackages) => void
  onAddPackage: (offerId: string) => void
  addingPackageToOfferId: string | null
  newPackageLabel: string
  setNewPackageLabel: (v: string) => void
  newPackageCategory: SalesFlyerPackageCategory
  setNewPackageCategory: (v: SalesFlyerPackageCategory) => void
  newPackageSaving: boolean
  onSubmitNewPackage: () => void
  onCancelNewPackage: () => void
  onDuplicatePackage: (offerId: string, packageId: string) => void
  onDeletePackage: (packageId: string, label: string) => void
}) {
  const {
    title, offers, onRenameOffer, renamingOfferId, renameValue, setRenameValue, onSaveRename, onCancelRename, onDeleteOffer,
    onAddPackage, addingPackageToOfferId, newPackageLabel, setNewPackageLabel, newPackageCategory, setNewPackageCategory,
    newPackageSaving, onSubmitNewPackage, onCancelNewPackage, onDuplicatePackage, onDeletePackage,
  } = props

  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {offers.map(offer => {
          const isRenaming = renamingOfferId === offer.id
          return (
            <div key={offer.id} style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') onSaveRename(offer); if (e.key === 'Escape') onCancelRename() }}
                    onBlur={() => onSaveRename(offer)}
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text, background: C.surface2, border: `1px solid ${C.accent}`, borderRadius: 6, padding: '4px 8px', flex: 1 }}
                  />
                ) : (
                  <p
                    onClick={() => onRenameOffer(offer)}
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text, cursor: 'pointer' }}
                    title="Klikk for å endre tittel"
                  >
                    {offer.title}
                  </p>
                )}
                <button
                  onClick={() => onDeleteOffer(offer)}
                  style={{ padding: '5px 10px', background: 'transparent', color: C.danger, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', flexShrink: 0 }}
                >
                  Slett pakketilbud
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 16 }}>
                {offer.packages.map(pkg => (
                  <div key={pkg.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface2, padding: 12, width: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500, color: C.text }}>{pkg.label}</p>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                      {pkg.category ? PACKAGE_CATEGORY_LABEL[pkg.category] : 'Ingen kategori'} · {formatNok(pkg.amount)}
                    </p>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <Link
                        href={`/admin/package-offers/${offer.id}/${pkg.id}`}
                        style={{ padding: '5px 9px', background: C.accentBg, color: C.accent, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, border: '1px solid rgba(124,92,252,0.25)', borderRadius: 6, textDecoration: 'none' }}
                      >
                        Rediger
                      </Link>
                      <button
                        onClick={() => onDuplicatePackage(offer.id, pkg.id)}
                        style={{ padding: '5px 9px', background: 'transparent', color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}
                      >
                        Dupliser
                      </button>
                      <button
                        onClick={() => onDeletePackage(pkg.id, pkg.label)}
                        style={{ padding: '5px 9px', background: 'transparent', color: C.danger, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}
                      >
                        Slett
                      </button>
                    </div>
                  </div>
                ))}

                {addingPackageToOfferId === offer.id ? (
                  <div style={{ border: `1px dashed ${C.accent}`, borderRadius: 8, background: C.surface2, padding: 12, width: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      type="text"
                      autoFocus
                      value={newPackageLabel}
                      onChange={e => setNewPackageLabel(e.target.value)}
                      placeholder="F.eks. Liten pakke"
                      style={{ padding: '6px 8px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', outline: 'none' }}
                    />
                    <select
                      value={newPackageCategory}
                      onChange={e => setNewPackageCategory(e.target.value as SalesFlyerPackageCategory)}
                      style={{ padding: '6px 8px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', outline: 'none' }}
                    >
                      <option value="foto">Bilder</option>
                      <option value="film">Film</option>
                      <option value="foto_film">Bilder og film</option>
                    </select>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={onSubmitNewPackage}
                        disabled={newPackageSaving || !newPackageLabel.trim()}
                        style={{ flex: 1, padding: '6px 0', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', opacity: newPackageSaving ? 0.6 : 1 }}
                      >
                        {newPackageSaving ? 'Lagrer…' : 'Opprett'}
                      </button>
                      <button
                        onClick={onCancelNewPackage}
                        style={{ padding: '6px 10px', background: 'transparent', color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}
                      >
                        Avbryt
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => onAddPackage(offer.id)}
                    style={{
                      width: 220, borderRadius: 8, border: `1px dashed ${C.border}`, background: 'transparent', color: C.text3,
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', cursor: 'pointer', minHeight: 72,
                    }}
                  >
                    + Ny pakke
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
