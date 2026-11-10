'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
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
  moveOfferToCustomer,
  movePackageToOffer,
  type PackageOfferWithPackages,
  type PackageListItem,
} from '@/lib/actions/package-offers'
import type { SalesFlyerPackageCategory } from '@/lib/types'

const PACKAGE_CATEGORY_LABEL: Record<SalesFlyerPackageCategory, string> = {
  foto: 'Bilder',
  film: 'Film',
  foto_film: 'Bilder og film',
}

type CustomerOption = { id: string; name: string }

type ActiveDrag =
  | { type: 'group'; offerId: string; title: string; fromCustomerId: string | null }
  | { type: 'package'; packageId: string; label: string; fromOfferId: string }

function formatNok(amount: number): string {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(amount)
}

function offerCustomerLabel(offer: Pick<PackageOfferWithPackages, 'customerId' | 'customerName'>): string {
  return offer.customerId === null ? 'Internt' : (offer.customerName ?? '(ukjent kunde)')
}

export default function PackageOffersPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [offers, setOffers] = useState<PackageOfferWithPackages[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])

  // "Ny pakke-gruppe"
  const [showNewOffer, setShowNewOffer] = useState(false)
  const [newOfferIsInternal, setNewOfferIsInternal] = useState(false)
  const [newOfferCustomerId, setNewOfferCustomerId] = useState('')
  const [newOfferTitle, setNewOfferTitle] = useState('')
  const [newOfferSaving, setNewOfferSaving] = useState(false)
  const [newOfferError, setNewOfferError] = useState<string | null>(null)

  // Inline "+ Nytt pakketilbud" pr. pakke-gruppe
  const [addingPackageToOfferId, setAddingPackageToOfferId] = useState<string | null>(null)
  const [newPackageLabel, setNewPackageLabel] = useState('')
  const [newPackageCategory, setNewPackageCategory] = useState<SalesFlyerPackageCategory>('foto')
  const [newPackageSaving, setNewPackageSaving] = useState(false)

  // Inline rename av pakke-gruppens tittel
  const [renamingOfferId, setRenamingOfferId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Slette-bekreftelse — delt for både hele pakke-grupper og enkeltpakketilbud
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'offer' | 'package'; id: string; label: string; packageIds: string[] } | null>(null)
  const [deleteFlyerSlugs, setDeleteFlyerSlugs] = useState<string[] | null>(null)
  const [deleteChecking, setDeleteChecking] = useState(false)
  const [deleteSaving, setDeleteSaving] = useState(false)

  const [actionError, setActionError] = useState<string | null>(null)

  // Dra-og-slipp: hvilket element dras akkurat nå (styrer hvilke droppable-soner som er aktive)
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)
  const [groupDropConfirm, setGroupDropConfirm] = useState<{ offerId: string; title: string; toCustomerId: string | null; toLabel: string } | null>(null)
  const [packageDropConfirm, setPackageDropConfirm] = useState<{ packageId: string; label: string; fromTitle: string; toOfferId: string; toTitle: string } | null>(null)
  const [dropMoveSaving, setDropMoveSaving] = useState(false)

  // "Flytt til kunde"-knapp pr. pakke-gruppe
  const [moveOfferModal, setMoveOfferModal] = useState<{ offerId: string; title: string; packageCount: number } | null>(null)
  const [moveOfferIsInternal, setMoveOfferIsInternal] = useState(false)
  const [moveOfferCustomerId, setMoveOfferCustomerId] = useState('')
  const [moveOfferSaving, setMoveOfferSaving] = useState(false)
  const [moveOfferError, setMoveOfferError] = useState<string | null>(null)

  // "Flytt"-knapp pr. pakketilbud (enkeltpakke)
  const [movePackageModal, setMovePackageModal] = useState<{ packageId: string; label: string; currentOfferId: string } | null>(null)
  const [movePackageMode, setMovePackageMode] = useState<'existing' | 'new'>('existing')
  const [movePackageTargetOfferId, setMovePackageTargetOfferId] = useState('')
  const [movePackageNewIsInternal, setMovePackageNewIsInternal] = useState(false)
  const [movePackageNewCustomerId, setMovePackageNewCustomerId] = useState('')
  const [movePackageNewTitle, setMovePackageNewTitle] = useState('')
  const [movePackageSaving, setMovePackageSaving] = useState(false)
  const [movePackageError, setMovePackageError] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

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

  async function ensureCustomersLoaded() {
    if (customers.length === 0) {
      const { data } = await supabase.from('customers').select('id, name').order('name')
      setCustomers((data ?? []) as CustomerOption[])
    }
  }

  async function openNewOffer() {
    setNewOfferIsInternal(false)
    setNewOfferCustomerId('')
    setNewOfferTitle('')
    setNewOfferError(null)
    setShowNewOffer(true)
    await ensureCustomersLoaded()
  }

  async function handleCreateOffer() {
    const title = newOfferTitle.trim()
    if (!title) {
      setNewOfferError('Pakke-gruppen må ha en tittel')
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

  // "Flytt til kunde"-knapp på en pakke-gruppe
  async function openMoveOfferModal(offer: PackageOfferWithPackages) {
    setMoveOfferModal({ offerId: offer.id, title: offer.title, packageCount: offer.packages.length })
    setMoveOfferIsInternal(offer.customerId === null)
    setMoveOfferCustomerId(offer.customerId ?? '')
    setMoveOfferError(null)
    await ensureCustomersLoaded()
  }

  async function submitMoveOffer() {
    if (!moveOfferModal) return
    if (!moveOfferIsInternal && !moveOfferCustomerId) {
      setMoveOfferError('Velg en kunde, eller kryss av «Internt (Leafilms)»')
      return
    }
    setMoveOfferSaving(true)
    setMoveOfferError(null)
    try {
      const result = await moveOfferToCustomer(moveOfferModal.offerId, moveOfferIsInternal ? null : moveOfferCustomerId)
      if ('error' in result) {
        setMoveOfferError(result.error)
        return
      }
      setMoveOfferModal(null)
      await fetchOffers()
    } finally {
      setMoveOfferSaving(false)
    }
  }

  // "Flytt"-knapp på et enkelt pakketilbud
  async function openMovePackageModal(offerId: string, pkg: PackageListItem) {
    setMovePackageModal({ packageId: pkg.id, label: pkg.label, currentOfferId: offerId })
    setMovePackageMode('existing')
    setMovePackageTargetOfferId('')
    setMovePackageNewIsInternal(false)
    setMovePackageNewCustomerId('')
    setMovePackageNewTitle('')
    setMovePackageError(null)
    await ensureCustomersLoaded()
  }

  async function submitMovePackage() {
    if (!movePackageModal) return
    setMovePackageSaving(true)
    setMovePackageError(null)
    try {
      let targetOfferId = movePackageTargetOfferId
      if (movePackageMode === 'new') {
        const title = movePackageNewTitle.trim()
        if (!title) { setMovePackageError('Pakke-gruppen må ha en tittel'); return }
        if (!movePackageNewIsInternal && !movePackageNewCustomerId) { setMovePackageError('Velg en kunde, eller kryss av «Internt (Leafilms)»'); return }
        const created = await createPackageOffer({ customerId: movePackageNewIsInternal ? null : movePackageNewCustomerId, title })
        if ('error' in created) { setMovePackageError(created.error); return }
        targetOfferId = created.id
      } else if (!targetOfferId) {
        setMovePackageError('Velg en pakke-gruppe å flytte til')
        return
      }
      const result = await movePackageToOffer(movePackageModal.packageId, targetOfferId)
      if ('error' in result) { setMovePackageError(result.error); return }
      setMovePackageModal(null)
      await fetchOffers()
    } finally {
      setMovePackageSaving(false)
    }
  }

  // Dra-og-slipp
  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id)
    if (id.startsWith('group:')) {
      const offerId = id.slice('group:'.length)
      const offer = offers.find(o => o.id === offerId)
      if (offer) setActiveDrag({ type: 'group', offerId, title: offer.title, fromCustomerId: offer.customerId })
    } else if (id.startsWith('pkg:')) {
      const packageId = id.slice('pkg:'.length)
      const offer = offers.find(o => o.packages.some(p => p.id === packageId))
      const pkg = offer?.packages.find(p => p.id === packageId)
      if (offer && pkg) setActiveDrag({ type: 'package', packageId, label: pkg.label, fromOfferId: offer.id })
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { over } = event
    const drag = activeDrag
    setActiveDrag(null)
    if (!over || !drag) return
    const overId = String(over.id)

    if (drag.type === 'group' && overId.startsWith('customer:')) {
      const rawTarget = overId.slice('customer:'.length)
      const toCustomerId = rawTarget === 'internal' ? null : rawTarget
      if (toCustomerId === drag.fromCustomerId) return
      const toLabel = toCustomerId === null
        ? 'Interne pakker'
        : (offers.find(o => o.customerId === toCustomerId)?.customerName ?? '(ukjent kunde)')
      setGroupDropConfirm({ offerId: drag.offerId, title: drag.title, toCustomerId, toLabel })
    }

    if (drag.type === 'package' && overId.startsWith('offer:')) {
      const toOfferId = overId.slice('offer:'.length)
      if (toOfferId === drag.fromOfferId) return
      const fromOffer = offers.find(o => o.id === drag.fromOfferId)
      const toOffer = offers.find(o => o.id === toOfferId)
      if (!toOffer) return
      setPackageDropConfirm({ packageId: drag.packageId, label: drag.label, fromTitle: fromOffer?.title ?? '', toOfferId, toTitle: toOffer.title })
    }
  }

  async function confirmGroupDrop() {
    if (!groupDropConfirm) return
    setDropMoveSaving(true)
    try {
      const result = await moveOfferToCustomer(groupDropConfirm.offerId, groupDropConfirm.toCustomerId)
      if ('error' in result) { setActionError(result.error); setGroupDropConfirm(null); return }
      setGroupDropConfirm(null)
      await fetchOffers()
    } finally {
      setDropMoveSaving(false)
    }
  }

  async function confirmPackageDrop() {
    if (!packageDropConfirm) return
    setDropMoveSaving(true)
    try {
      const result = await movePackageToOffer(packageDropConfirm.packageId, packageDropConfirm.toOfferId)
      if ('error' in result) { setActionError(result.error); setPackageDropConfirm(null); return }
      setPackageDropConfirm(null)
      await fetchOffers()
    } finally {
      setDropMoveSaving(false)
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

  const dragType = activeDrag?.type ?? null

  const sectionHandlers = {
    onRenameOffer: startRenameOffer,
    renamingOfferId,
    renameValue,
    setRenameValue,
    onSaveRename: saveRenameOffer,
    onCancelRename: cancelRenameOffer,
    onDeleteOffer: startDeleteOffer,
    onMoveOffer: openMoveOfferModal,
    onAddPackage: openAddPackage,
    addingPackageToOfferId,
    newPackageLabel,
    setNewPackageLabel,
    newPackageCategory,
    setNewPackageCategory,
    newPackageSaving,
    onSubmitNewPackage: handleAddPackage,
    onCancelNewPackage: () => setAddingPackageToOfferId(null),
    onDuplicatePackage: handleDuplicatePackage,
    onDeletePackage: startDeletePackage,
    onMovePackage: openMovePackageModal,
  }

  const moveTargetOptions = movePackageModal
    ? offers.filter(o => o.id !== movePackageModal.currentOfferId).map(o => ({ id: o.id, label: `${offerCustomerLabel(o)} — ${o.title}` }))
    : []

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 16px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, lineHeight: 1.2 }}>
              Pakketilbud
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginTop: 4 }}>
              Kunde (eller internt) → pakke-gruppe → pakketilbud side ved side. Dra kort for å flytte, eller bruk «Flytt»-knappene. Brukes på salgsflyere.
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
              + Ny pakke-gruppe
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
                Ingen pakke-grupper ennå
              </p>
            </div>
          ) : (
            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              {internalOffers.length > 0 && (
                <CustomerSection customerId={null} title="Interne pakker" offers={internalOffers} dragType={dragType} {...sectionHandlers} />
              )}
              {customerGroups.map(group => (
                <CustomerSection
                  key={group.customerId}
                  customerId={group.customerId}
                  title={group.customerName}
                  offers={group.offers}
                  dragType={dragType}
                  {...sectionHandlers}
                />
              ))}

              <DragOverlay dropAnimation={null}>
                {activeDrag?.type === 'group' ? (
                  <div style={{ padding: '10px 16px', borderRadius: 8, background: C.surface2, border: `1px solid ${C.accent}`, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 600, color: C.text, cursor: 'grabbing' }}>
                    📦 {activeDrag.title}
                  </div>
                ) : activeDrag?.type === 'package' ? (
                  <div style={{ padding: '10px 16px', borderRadius: 8, background: C.surface2, border: `1px solid ${C.accent}`, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500, color: C.text, cursor: 'grabbing' }}>
                    {activeDrag.label}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
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
                Ny pakke-gruppe
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
                Tittel på pakke-gruppen
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
              {deleteTarget.kind === 'offer' ? `Slette pakke-gruppen «${deleteTarget.label}» med alle pakketilbudene i den?` : `Slette «${deleteTarget.label}»?`}
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

      {moveOfferModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', zIndex: 50 }}
          onClick={() => !moveOfferSaving && setMoveOfferModal(null)}
        >
          <div
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text }}>
                Flytt pakke-gruppen «{moveOfferModal.title}»
              </p>
              <button onClick={() => setMoveOfferModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1.1rem', lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.warning }}>
              Flytter alle {moveOfferModal.packageCount} pakketilbud i gruppen — de blir synlige for den nye kunden (eller internt) i stedet.
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2, cursor: 'pointer' }}>
              <input type="checkbox" checked={moveOfferIsInternal} onChange={e => setMoveOfferIsInternal(e.target.checked)} />
              Internt (Leafilms) — ikke knyttet til en kunde
            </label>
            {!moveOfferIsInternal && (
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 4 }}>
                  Kunde
                </label>
                <select
                  value={moveOfferCustomerId}
                  onChange={e => setMoveOfferCustomerId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none' }}
                >
                  <option value="">— Velg kunde —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {moveOfferError && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger }}>{moveOfferError}</p>
            )}
            <button
              onClick={submitMoveOffer}
              disabled={moveOfferSaving}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '9px 18px', borderRadius: 8, cursor: moveOfferSaving ? 'default' : 'pointer', background: C.accent, color: '#fff', border: 'none', opacity: moveOfferSaving ? 0.6 : 1 }}
            >
              {moveOfferSaving ? 'Flytter...' : 'Flytt'}
            </button>
          </div>
        </div>
      )}

      {movePackageModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', zIndex: 50 }}
          onClick={() => !movePackageSaving && setMovePackageModal(null)}
        >
          <div
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text }}>
                Flytt pakketilbudet «{movePackageModal.label}»
              </p>
              <button onClick={() => setMovePackageModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1.1rem', lineHeight: 1, padding: 4 }}>×</button>
            </div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.warning }}>
              Flytter dette ene pakketilbudet til en annen pakke-gruppe — resten av gruppen det ligger i nå, blir urørt.
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setMovePackageMode('existing')}
                style={{ flex: 1, padding: '7px 0', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem', fontWeight: 600, border: `1px solid ${movePackageMode === 'existing' ? C.accent : C.border}`, background: movePackageMode === 'existing' ? C.accentBg : 'transparent', color: movePackageMode === 'existing' ? C.accent : C.text3 }}
              >
                Eksisterende gruppe
              </button>
              <button
                onClick={() => setMovePackageMode('new')}
                style={{ flex: 1, padding: '7px 0', borderRadius: 6, cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem', fontWeight: 600, border: `1px solid ${movePackageMode === 'new' ? C.accent : C.border}`, background: movePackageMode === 'new' ? C.accentBg : 'transparent', color: movePackageMode === 'new' ? C.accent : C.text3 }}
              >
                Ny gruppe
              </button>
            </div>

            {movePackageMode === 'existing' ? (
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 4 }}>
                  Pakke-gruppe
                </label>
                <select
                  value={movePackageTargetOfferId}
                  onChange={e => setMovePackageTargetOfferId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none' }}
                >
                  <option value="">— Velg pakke-gruppe —</option>
                  {moveTargetOptions.map(o => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2, cursor: 'pointer' }}>
                  <input type="checkbox" checked={movePackageNewIsInternal} onChange={e => setMovePackageNewIsInternal(e.target.checked)} />
                  Internt (Leafilms) — ikke knyttet til en kunde
                </label>
                {!movePackageNewIsInternal && (
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 4 }}>
                      Kunde
                    </label>
                    <select
                      value={movePackageNewCustomerId}
                      onChange={e => setMovePackageNewCustomerId(e.target.value)}
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
                    Tittel på den nye pakke-gruppen
                  </label>
                  <input
                    type="text"
                    value={movePackageNewTitle}
                    onChange={e => setMovePackageNewTitle(e.target.value)}
                    placeholder="F.eks. Bryllupspakker"
                    style={{ width: '100%', padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none' }}
                  />
                </div>
              </>
            )}

            {movePackageError && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger }}>{movePackageError}</p>
            )}
            <button
              onClick={submitMovePackage}
              disabled={movePackageSaving}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '9px 18px', borderRadius: 8, cursor: movePackageSaving ? 'default' : 'pointer', background: C.accent, color: '#fff', border: 'none', opacity: movePackageSaving ? 0.6 : 1 }}
            >
              {movePackageSaving ? 'Flytter...' : 'Flytt'}
            </button>
          </div>
        </div>
      )}

      {groupDropConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onClick={() => !dropMoveSaving && setGroupDropConfirm(null)}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, marginBottom: 10 }}>
              Flytte pakke-gruppen «{groupDropConfirm.title}» til {groupDropConfirm.toLabel}?
            </p>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.warning, marginBottom: 18 }}>
              Alle pakketilbudene i gruppen blir synlige der i stedet.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setGroupDropConfirm(null)} disabled={dropMoveSaving} style={{ padding: '7px 14px', background: 'transparent', color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', border: `1px solid ${C.border}`, borderRadius: 6, cursor: dropMoveSaving ? 'default' : 'pointer' }}>
                Avbryt
              </button>
              <button onClick={confirmGroupDrop} disabled={dropMoveSaving} style={{ padding: '7px 14px', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, border: 'none', borderRadius: 6, cursor: dropMoveSaving ? 'default' : 'pointer', opacity: dropMoveSaving ? 0.6 : 1 }}>
                {dropMoveSaving ? 'Flytter …' : 'Bekreft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {packageDropConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onClick={() => !dropMoveSaving && setPackageDropConfirm(null)}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, maxWidth: 420, width: '90%' }} onClick={e => e.stopPropagation()}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, marginBottom: 10 }}>
              Flytte pakketilbudet «{packageDropConfirm.label}» fra «{packageDropConfirm.fromTitle}» til «{packageDropConfirm.toTitle}»?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPackageDropConfirm(null)} disabled={dropMoveSaving} style={{ padding: '7px 14px', background: 'transparent', color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', border: `1px solid ${C.border}`, borderRadius: 6, cursor: dropMoveSaving ? 'default' : 'pointer' }}>
                Avbryt
              </button>
              <button onClick={confirmPackageDrop} disabled={dropMoveSaving} style={{ padding: '7px 14px', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, border: 'none', borderRadius: 6, cursor: dropMoveSaving ? 'default' : 'pointer', opacity: dropMoveSaving ? 0.6 : 1 }}>
                {dropMoveSaving ? 'Flytter …' : 'Bekreft'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CustomerSection(props: {
  customerId: string | null
  title: string
  offers: PackageOfferWithPackages[]
  dragType: 'group' | 'package' | null
  onRenameOffer: (offer: PackageOfferWithPackages) => void
  renamingOfferId: string | null
  renameValue: string
  setRenameValue: (v: string) => void
  onSaveRename: (offer: PackageOfferWithPackages) => void
  onCancelRename: () => void
  onDeleteOffer: (offer: PackageOfferWithPackages) => void
  onMoveOffer: (offer: PackageOfferWithPackages) => void
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
  onMovePackage: (offerId: string, pkg: PackageListItem) => void
}) {
  const { customerId, title, offers, dragType } = props
  const { setNodeRef, isOver } = useDroppable({ id: `customer:${customerId ?? 'internal'}`, disabled: dragType !== 'group' })

  return (
    <div
      ref={setNodeRef}
      style={{ marginBottom: 28, borderRadius: 10, outline: isOver ? `2px dashed ${C.accent}` : '2px dashed transparent', outlineOffset: 6, transition: 'outline-color 0.12s' }}
    >
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
        {title}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {offers.map(offer => (
          <OfferBox key={offer.id} offer={offer} {...props} />
        ))}
      </div>
    </div>
  )
}

function OfferBox(props: {
  offer: PackageOfferWithPackages
  dragType: 'group' | 'package' | null
  onRenameOffer: (offer: PackageOfferWithPackages) => void
  renamingOfferId: string | null
  renameValue: string
  setRenameValue: (v: string) => void
  onSaveRename: (offer: PackageOfferWithPackages) => void
  onCancelRename: () => void
  onDeleteOffer: (offer: PackageOfferWithPackages) => void
  onMoveOffer: (offer: PackageOfferWithPackages) => void
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
  onMovePackage: (offerId: string, pkg: PackageListItem) => void
}) {
  const {
    offer, dragType, onRenameOffer, renamingOfferId, renameValue, setRenameValue, onSaveRename, onCancelRename, onDeleteOffer, onMoveOffer,
    onAddPackage, addingPackageToOfferId, newPackageLabel, setNewPackageLabel, newPackageCategory, setNewPackageCategory,
    newPackageSaving, onSubmitNewPackage, onCancelNewPackage, onDuplicatePackage, onDeletePackage, onMovePackage,
  } = props
  const isRenaming = renamingOfferId === offer.id

  const { attributes: dragAttributes, listeners: dragListeners, setNodeRef: setDraggableRef, transform, isDragging } = useDraggable({ id: `group:${offer.id}` })
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: `offer:${offer.id}`, disabled: dragType !== 'package' })
  const setRefs = (node: HTMLElement | null) => {
    setDraggableRef(node)
    setDroppableRef(node)
  }

  return (
    <div
      ref={setRefs}
      style={{
        border: `1px solid ${isOver ? C.accent : C.border}`,
        borderRadius: 10, background: C.surface, overflow: 'hidden',
        opacity: isDragging ? 0.4 : 1,
        transform: CSS.Translate.toString(transform),
        transition: 'opacity 0.15s, border-color 0.12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span
            {...dragAttributes}
            {...dragListeners}
            title="Dra for å flytte hele pakke-gruppen"
            style={{ cursor: 'grab', color: C.text3, fontSize: '1rem', lineHeight: 1, flexShrink: 0, touchAction: 'none', userSelect: 'none', padding: 2 }}
          >
            ⠿
          </span>
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
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => onMoveOffer(offer)}
            style={{ padding: '5px 10px', background: 'transparent', color: C.accent, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, border: '1px solid rgba(124,92,252,0.3)', borderRadius: 6, cursor: 'pointer' }}
          >
            Flytt til kunde
          </button>
          <button
            onClick={() => onDeleteOffer(offer)}
            style={{ padding: '5px 10px', background: 'transparent', color: C.danger, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}
          >
            Slett pakke-gruppe
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: 16 }}>
        {offer.packages.map(pkg => (
          <PackageCard
            key={pkg.id}
            offer={offer}
            pkg={pkg}
            onDuplicate={onDuplicatePackage}
            onDelete={onDeletePackage}
            onMove={onMovePackage}
          />
        ))}

        {addingPackageToOfferId === offer.id ? (
          <div style={{ border: `1px dashed ${C.accent}`, borderRadius: 8, background: C.surface2, padding: 12, width: 220, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              type="text"
              autoFocus
              value={newPackageLabel}
              onChange={e => setNewPackageLabel(e.target.value)}
              placeholder="F.eks. Lite pakketilbud"
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
            + Nytt pakketilbud
          </button>
        )}
      </div>
    </div>
  )
}

function PackageCard({
  offer, pkg, onDuplicate, onDelete, onMove,
}: {
  offer: PackageOfferWithPackages
  pkg: PackageListItem
  onDuplicate: (offerId: string, packageId: string) => void
  onDelete: (packageId: string, label: string) => void
  onMove: (offerId: string, pkg: PackageListItem) => void
}) {
  const { attributes: dragAttributes, listeners: dragListeners, setNodeRef, transform, isDragging } = useDraggable({ id: `pkg:${pkg.id}` })

  return (
    <div
      ref={setNodeRef}
      style={{
        border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface2, padding: 12, width: 220,
        display: 'flex', flexDirection: 'column', gap: 6,
        opacity: isDragging ? 0.4 : 1,
        transform: CSS.Translate.toString(transform),
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500, color: C.text }}>{pkg.label}</p>
        <span
          {...dragAttributes}
          {...dragListeners}
          title="Dra for å flytte til en annen pakke-gruppe"
          style={{ cursor: 'grab', color: C.text3, fontSize: '0.9rem', lineHeight: 1, flexShrink: 0, touchAction: 'none', userSelect: 'none', padding: 2 }}
        >
          ⠿
        </span>
      </div>
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
          onClick={() => onDuplicate(offer.id, pkg.id)}
          style={{ padding: '5px 9px', background: 'transparent', color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}
        >
          Dupliser
        </button>
        <button
          onClick={() => onMove(offer.id, pkg)}
          style={{ padding: '5px 9px', background: 'transparent', color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}
        >
          Flytt
        </button>
        <button
          onClick={() => onDelete(pkg.id, pkg.label)}
          style={{ padding: '5px 9px', background: 'transparent', color: C.danger, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer' }}
        >
          Slett
        </button>
      </div>
    </div>
  )
}
