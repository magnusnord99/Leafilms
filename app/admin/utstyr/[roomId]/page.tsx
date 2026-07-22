'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  getRoomDetail, deleteRoom, addEquipmentUnits, checkOutUnits, returnUnits, setRoomOwner, cancelReservation,
  RoomDetail, EquipmentUnitRow, CheckedOutUnitRow, BookingConflict,
} from '@/lib/actions/equipment'
import { EQUIPMENT_CATEGORY_LABELS } from '@/lib/equipment-constants'
import EquipmentPickerPanel from '@/components/admin/EquipmentPickerPanel'

function formatDate(isoDate: string) {
  const [y, m, d] = isoDate.split('-')
  return `${d}.${m}.${y}`
}

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
  success:  '#4CAF7D',
  danger:   '#E05555',
}

function UnitRow({
  label, sub, selected, onToggle,
}: {
  label: string; sub: string; selected: boolean; onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 6,
        background: selected ? C.accentBg : C.surface2,
        border: `1px solid ${selected ? 'rgba(124,92,252,0.4)' : C.border}`,
        cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        background: selected ? C.accent : 'transparent',
        border: `1.5px solid ${selected ? C.accent : C.text3}`,
      }} />
      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, flex: 1 }}>
        {label} <span style={{ color: C.text3 }}>{sub}</span>
      </span>
    </div>
  )
}

function InRoomUnitRow({
  unit, selected, onToggle, onCancelReservation,
}: {
  unit: EquipmentUnitRow
  selected: boolean
  onToggle: () => void
  onCancelReservation: (projectId: string) => void
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 6,
        background: selected ? C.accentBg : C.surface2,
        border: `1px solid ${selected ? 'rgba(124,92,252,0.4)' : C.border}`,
        cursor: 'pointer', transition: 'all 0.12s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 16, height: 16, borderRadius: 4, flexShrink: 0,
          background: selected ? C.accent : 'transparent',
          border: `1.5px solid ${selected ? C.accent : C.text3}`,
        }} />
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, flex: 1 }}>
          {unit.catalog_name} <span style={{ color: C.text3 }}>{unit.unit_label}</span>
        </span>
      </div>
      {unit.reservations.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 26 }}>
          {unit.reservations.map(r => (
            <div key={r.project_id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
                reservert til {r.project_title}{r.shoot_start ? ` · ute fra ${formatDate(r.shoot_start)}` : ''}
              </span>
              <button
                onClick={e => { e.stopPropagation(); onCancelReservation(r.project_id) }}
                title="Avreserver"
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', lineHeight: 1,
                  padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
                  background: 'transparent', color: C.danger, border: '1px solid rgba(224,85,85,0.3)',
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RoomDetailPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const lockedProjectId = searchParams.get('project') ?? ''

  const [detail, setDetail] = useState<RoomDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [targetProjectId, setTargetProjectId] = useState(lockedProjectId)
  const [selectedInRoom, setSelectedInRoom] = useState<Set<string>>(new Set())
  const [selectedCheckedOut, setSelectedCheckedOut] = useState<Set<string>>(new Set())
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [checkoutConflicts, setCheckoutConflicts] = useState<BookingConflict[] | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addFilter, setAddFilter] = useState<'all' | 'free' | 'elsewhere'>('all')
  const [addSelection, setAddSelection] = useState<Record<string, number>>({})
  const [addError, setAddError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [panelRefreshTick, setPanelRefreshTick] = useState(0)
  const [ownerEditOpen, setOwnerEditOpen] = useState(false)

  const load = useCallback(() => {
    getRoomDetail(roomId).then(data => {
      setDetail(data)
      setLoading(false)
    })
  }, [roomId])

  useEffect(() => { load() }, [load])

  function toggleInRoom(id: string) {
    setCheckoutConflicts(null)
    setSelectedInRoom(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleCheckedOut(id: string) {
    setSelectedCheckedOut(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleCheckOut() {
    if (selectedInRoom.size === 0 || !targetProjectId) return
    setCheckoutConflicts(null)
    setBusy(true)
    const result = await checkOutUnits(Array.from(selectedInRoom), targetProjectId)
    setBusy(false)
    if (result.conflicts) {
      setCheckoutConflicts(result.conflicts)
      return
    }
    setSelectedInRoom(new Set())
    load()
    setPanelRefreshTick(t => t + 1)
  }

  async function handleCancelReservation(unitId: string, projectId: string) {
    setBusy(true)
    await cancelReservation([{ unitId, projectId }])
    load()
    setPanelRefreshTick(t => t + 1)
    setBusy(false)
  }

  async function handleReturn() {
    if (selectedCheckedOut.size === 0) return
    setBusy(true)
    await returnUnits(Array.from(selectedCheckedOut), roomId)
    setSelectedCheckedOut(new Set())
    load()
    setPanelRefreshTick(t => t + 1)
    setBusy(false)
  }

  function toggleCatalogSelection(catalogId: string) {
    setAddSelection(prev => {
      const next = { ...prev }
      if (catalogId in next) delete next[catalogId]
      else next[catalogId] = 1
      return next
    })
  }

  function setCatalogCount(catalogId: string, count: number) {
    setAddSelection(prev => ({ ...prev, [catalogId]: count }))
  }

  async function handleAdd() {
    const entries = Object.entries(addSelection).filter(([, count]) => count > 0)
    if (entries.length === 0) return
    setAddError(null)
    setBusy(true)
    const results = await Promise.all(
      entries.map(([catalogId, count]) => addEquipmentUnits(roomId, catalogId, count))
    )
    setBusy(false)
    const firstError = results.find(r => r.error)?.error
    if (firstError) {
      setAddError(firstError)
      return
    }
    setShowAdd(false)
    setAddSelection({})
    load()
  }

  async function handleSetOwner(ownerId: string) {
    await setRoomOwner(roomId, ownerId || null)
    load()
  }

  async function handleDelete() {
    setDeleteError(null)
    const result = await deleteRoom(roomId)
    if (result.error) {
      setDeleteError(result.error)
      return
    }
    router.push('/admin/utstyr')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>Fant ikke rommet.</p>
      </div>
    )
  }

  // Produkter som allerede har en enhet liggende i DETTE rommet skal ikke dukke
  // opp i "+ Legg til utstyr" i det hele tatt — de ligger jo her allerede.
  const inRoomCatalogIds = new Set(detail.unitsInRoom.map(u => u.catalog_id))

  const filteredCatalog = detail.catalog
    .filter(item => !inRoomCatalogIds.has(item.id))
    .filter(item => {
      if (addFilter === 'free') return item.existingElsewhere.length === 0
      if (addFilter === 'elsewhere') return item.existingElsewhere.length > 0
      return true
    })

  const catalogByCategory = filteredCatalog.reduce<Record<string, RoomDetail['catalog']>>((acc, item) => {
    (acc[item.category] ??= []).push(item)
    return acc
  }, {})

  const targetProjectTitle = detail.preprodProjects.find(p => p.id === targetProjectId)?.title ?? ''

  // Enheter allerede hentet til prosjektet du plukker til nå vises i sidepanelet i
  // stedet — å vise dem her også ville gjort det uklart hva som fortsatt er ledig.
  const visibleUnitsInRoom = targetProjectId
    ? detail.unitsInRoom.filter(u => !u.reservations.some(r => r.project_id === targetProjectId))
    : detail.unitsInRoom

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '28px 28px 64px' }}>
      <div style={{ maxWidth: lockedProjectId ? 1004 : 720, margin: '0 auto', display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ flex: 1, minWidth: 0, maxWidth: 720 }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 22 }}>
          <Link href={lockedProjectId ? `/admin/utstyr?project=${lockedProjectId}` : '/admin/utstyr'} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textDecoration: 'none' }}>Utstyr</Link>
          <span style={{ color: C.text3, fontSize: '0.72rem' }}>›</span>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>{detail.room.name}</span>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 600, color: C.text }}>
            {detail.room.name}
          </h1>
          <button
            onClick={handleDelete}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500,
              padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
              background: 'transparent', color: C.text3, border: `1px solid ${C.border}`,
            }}
          >
            Slett rom
          </button>
        </div>
        {deleteError && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger, marginBottom: 16 }}>
            {deleteError}
          </p>
        )}

        {/* Mål-shoot */}
        {lockedProjectId ? (
          <div style={{ background: C.accentBg, border: '1px solid rgba(124,92,252,0.25)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text }}>
              Henter til: <strong>{targetProjectTitle}</strong>
            </span>
            <Link href="/admin/utstyr" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.accent, textDecoration: 'none', flexShrink: 0 }}>
              Bytt prosjekt
            </Link>
          </div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
            <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, display: 'block', marginBottom: 8 }}>
              Mål-shoot
            </label>
            <select
              value={targetProjectId}
              onChange={e => { setTargetProjectId(e.target.value); setCheckoutConflicts(null) }}
              style={{
                width: '100%', boxSizing: 'border-box',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
                color: C.text, background: C.surface2, border: `1px solid ${C.border}`,
                borderRadius: 6, padding: '8px 10px', outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="">Velg prosjekt...</option>
              {detail.preprodProjects.map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </div>
        )}

        {/* Rom-eier */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
            Rom-eier: <span style={{ color: C.text2 }}>{detail.staff.find(s => s.id === detail.room.owner_id)?.name ?? 'Ingen'}</span>
          </span>
          <button
            onClick={() => setOwnerEditOpen(v => !v)}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500,
              padding: '2px 7px', borderRadius: 5, cursor: 'pointer',
              background: 'transparent', color: C.accent, border: '1px solid rgba(124,92,252,0.25)',
            }}
          >
            {ownerEditOpen ? 'Skjul' : 'Endre'}
          </button>
        </div>

        {ownerEditOpen && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
            <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, display: 'block', marginBottom: 8 }}>
              Rom-eier
            </label>
            <select
              value={detail.room.owner_id ?? ''}
              onChange={e => handleSetOwner(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
                color: C.text, background: C.surface2, border: `1px solid ${C.border}`,
                borderRadius: 6, padding: '8px 10px', outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="">Ingen eier</option>
              {detail.staff.map(s => (
                <option key={s.id} value={s.id}>{s.name ?? 'Uten navn'}</option>
              ))}
            </select>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, margin: '8px 0 0' }}>
              Utstyr som hentes fra dette rommet tildeles automatisk rom-eieren som pakke-ansvarlig.
            </p>
          </div>
        )}

        {/* I dette rommet */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
              I dette rommet
            </p>
            <button
              onClick={() => setShowAdd(v => !v)}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500,
                padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
                background: 'transparent', color: C.accent, border: '1px solid rgba(124,92,252,0.25)',
              }}
            >
              + Legg til utstyr
            </button>
          </div>

          {showAdd && (() => {
            const selectedCount = Object.keys(addSelection).length
            return (
              <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  {([
                    ['all', 'Alle'],
                    ['free', 'Ledige'],
                    ['elsewhere', 'I andre rom'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setAddFilter(value)}
                      style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500,
                        padding: '4px 9px', borderRadius: 5, cursor: 'pointer',
                        background: addFilter === value ? C.accentBg : 'transparent',
                        color: addFilter === value ? C.accent : C.text3,
                        border: `1px solid ${addFilter === value ? 'rgba(124,92,252,0.4)' : C.border}`,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
                  {filteredCatalog.length === 0 && (
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, fontStyle: 'italic' }}>
                      Ingen produkter matcher filteret
                    </p>
                  )}
                  {Object.entries(catalogByCategory).map(([category, items]) => (
                    <div key={category}>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.text3, margin: '0 0 6px' }}>
                        {EQUIPMENT_CATEGORY_LABELS[category] ?? category}
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {items.map(item => {
                          const selected = item.id in addSelection
                          return (
                            <div
                              key={item.id}
                              onClick={() => toggleCatalogSelection(item.id)}
                              style={{
                                display: 'flex', flexDirection: 'column', gap: 4, padding: '7px 10px', borderRadius: 6,
                                background: selected ? C.accentBg : C.surface,
                                border: `1px solid ${selected ? 'rgba(124,92,252,0.4)' : C.border}`,
                                cursor: 'pointer', transition: 'all 0.12s',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{
                                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                                  background: selected ? C.accent : 'transparent',
                                  border: `1.5px solid ${selected ? C.accent : C.text3}`,
                                }} />
                                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, flex: 1 }}>
                                  {item.name}
                                </span>
                                {selected && (
                                  <input
                                    type="number"
                                    min={1}
                                    value={addSelection[item.id]}
                                    onClick={e => e.stopPropagation()}
                                    onChange={e => setCatalogCount(item.id, Math.max(1, parseInt(e.target.value, 10) || 1))}
                                    style={{
                                      width: 52, flexShrink: 0, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem',
                                      color: C.text, background: C.surface2, border: `1px solid ${C.border}`,
                                      borderRadius: 5, padding: '4px 6px', outline: 'none',
                                    }}
                                  />
                                )}
                              </div>
                              {item.existingElsewhere.length > 0 && (
                                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: '#D9A441', margin: 0, paddingLeft: 26 }}>
                                  Finnes allerede: {item.existingElsewhere.map((loc, i) => (
                                    loc.kind === 'room'
                                      ? loc.room_name
                                      : `ute til ${loc.project_title}${loc.shoot_start ? ` (${formatDate(loc.shoot_start)})` : ''}`
                                  )).join(', ')}
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                    {selectedCount > 0 ? `${selectedCount} valgt` : 'Huk av det du vil legge til'}
                  </span>
                  <button
                    onClick={handleAdd}
                    disabled={selectedCount === 0 || busy}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                      padding: '7px 12px', borderRadius: 6, cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
                      background: selectedCount > 0 ? C.accentBg : 'transparent',
                      color: selectedCount > 0 ? C.accent : C.text3,
                      border: `1px solid ${selectedCount > 0 ? 'rgba(124,92,252,0.25)' : C.border}`,
                    }}
                  >
                    Legg til
                  </button>
                </div>

                {addError && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger, margin: '10px 0 0' }}>
                    {addError}
                  </p>
                )}
              </div>
            )
          })()}

          {visibleUnitsInRoom.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>
              {detail.unitsInRoom.length === 0 ? 'Ingen utstyr i dette rommet' : 'Alt utstyr her er allerede hentet til dette prosjektet'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {visibleUnitsInRoom.map((u: EquipmentUnitRow) => (
                <InRoomUnitRow
                  key={u.id}
                  unit={u}
                  selected={selectedInRoom.has(u.id)}
                  onToggle={() => toggleInRoom(u.id)}
                  onCancelReservation={projectId => handleCancelReservation(u.id, projectId)}
                />
              ))}
            </div>
          )}

          {selectedInRoom.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
                {selectedInRoom.size} valgt
              </span>
              <button
                onClick={handleCheckOut}
                disabled={!targetProjectId || busy}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                  padding: '7px 12px', borderRadius: 6,
                  cursor: targetProjectId ? 'pointer' : 'not-allowed',
                  background: targetProjectId ? C.accentBg : 'transparent',
                  color: targetProjectId ? C.accent : C.text3,
                  border: `1px solid ${targetProjectId ? 'rgba(124,92,252,0.25)' : C.border}`,
                }}
              >
                {targetProjectId ? `Reserver ${selectedInRoom.size} til «${targetProjectTitle}»` : 'Velg mål-shoot først'}
              </button>
            </div>
          )}

          {checkoutConflicts && checkoutConflicts.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.3)' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, color: C.danger, margin: '0 0 6px' }}>
                Dobbeltbooking — allerede reservert til et annet prosjekt:
              </p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {checkoutConflicts.map((c, i) => (
                  <li key={i} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
                    {c.catalog_name} {c.unit_label} · reservert til {c.project_title}
                    {c.shoot_start ? ` (${formatDate(c.shoot_start)})` : ''}
                  </li>
                ))}
              </ul>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, margin: '6px 0 0' }}>
                Fjern disse fra valget, eller avreserver dem fra det andre prosjektet først.
              </p>
            </div>
          )}
        </div>

        {/* Ute til shoot */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
            Ute til shoot
          </p>

          {detail.unitsCheckedOut.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>
              Ingenting er ute akkurat nå
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {detail.unitsCheckedOut.map((u: CheckedOutUnitRow) => (
                <UnitRow
                  key={u.id}
                  label={u.catalog_name}
                  sub={`${u.unit_label} · ute til ${u.project_title}`}
                  selected={selectedCheckedOut.has(u.id)}
                  onToggle={() => toggleCheckedOut(u.id)}
                />
              ))}
            </div>
          )}

          {selectedCheckedOut.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
                {selectedCheckedOut.size} valgt
              </span>
              <button
                onClick={handleReturn}
                disabled={busy}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                  padding: '7px 12px', borderRadius: 6, cursor: 'pointer',
                  background: 'rgba(76,175,125,0.12)', color: C.success, border: '1px solid rgba(76,175,125,0.3)',
                }}
              >
                Lever inn her ({selectedCheckedOut.size})
              </button>
            </div>
          )}
        </div>

      </div>
      {targetProjectId && (
        <EquipmentPickerPanel projectId={targetProjectId} onChange={load} refreshSignal={panelRefreshTick} />
      )}
      </div>
    </div>
  )
}
