'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  getRoomDetail, deleteRoom, addEquipmentUnits, checkOutUnits, returnUnits,
  RoomDetail, EquipmentUnitRow, CheckedOutUnitRow,
} from '@/lib/actions/equipment'
import { EQUIPMENT_CATEGORY_LABELS } from '@/lib/equipment-constants'

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

export default function RoomDetailPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const router = useRouter()

  const [detail, setDetail] = useState<RoomDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [targetProjectId, setTargetProjectId] = useState('')
  const [selectedInRoom, setSelectedInRoom] = useState<Set<string>>(new Set())
  const [selectedCheckedOut, setSelectedCheckedOut] = useState<Set<string>>(new Set())
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addCatalogId, setAddCatalogId] = useState('')
  const [addCount, setAddCount] = useState(1)
  const [addError, setAddError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    getRoomDetail(roomId).then(data => {
      setDetail(data)
      setLoading(false)
    })
  }, [roomId])

  useEffect(() => { load() }, [load])

  function toggleInRoom(id: string) {
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
    setBusy(true)
    await checkOutUnits(Array.from(selectedInRoom), targetProjectId)
    setSelectedInRoom(new Set())
    load()
    setBusy(false)
  }

  async function handleReturn() {
    if (selectedCheckedOut.size === 0) return
    setBusy(true)
    await returnUnits(Array.from(selectedCheckedOut), roomId)
    setSelectedCheckedOut(new Set())
    load()
    setBusy(false)
  }

  async function handleAdd() {
    if (!addCatalogId || addCount <= 0) return
    setAddError(null)
    setBusy(true)
    const result = await addEquipmentUnits(roomId, addCatalogId, addCount)
    setBusy(false)
    if (result.error) {
      setAddError(result.error)
      return
    }
    setShowAdd(false)
    setAddCatalogId('')
    setAddCount(1)
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

  const catalogByCategory = detail.catalog.reduce<Record<string, RoomDetail['catalog']>>((acc, item) => {
    (acc[item.category] ??= []).push(item)
    return acc
  }, {})

  const targetProjectTitle = detail.preprodProjects.find(p => p.id === targetProjectId)?.title ?? ''

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '28px 28px 64px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 22 }}>
          <Link href="/admin/utstyr" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textDecoration: 'none' }}>Utstyr</Link>
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
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
          <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, display: 'block', marginBottom: 8 }}>
            Mål-shoot
          </label>
          <select
            value={targetProjectId}
            onChange={e => setTargetProjectId(e.target.value)}
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

          {showAdd && (
            <div style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, marginBottom: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={addCatalogId}
                onChange={e => setAddCatalogId(e.target.value)}
                style={{
                  flex: 1, minWidth: 180, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                  color: C.text, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: '7px 10px', outline: 'none', cursor: 'pointer',
                }}
              >
                <option value="">Velg type...</option>
                {Object.entries(catalogByCategory).map(([category, items]) => (
                  <optgroup key={category} label={EQUIPMENT_CATEGORY_LABELS[category] ?? category}>
                    {items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={addCount}
                onChange={e => setAddCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{
                  width: 64, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                  color: C.text, background: C.surface, border: `1px solid ${C.border}`,
                  borderRadius: 6, padding: '7px 10px', outline: 'none',
                }}
              />
              <button
                onClick={handleAdd}
                disabled={!addCatalogId || busy}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                  padding: '7px 12px', borderRadius: 6, cursor: addCatalogId ? 'pointer' : 'not-allowed',
                  background: addCatalogId ? C.accentBg : 'transparent',
                  color: addCatalogId ? C.accent : C.text3,
                  border: `1px solid ${addCatalogId ? 'rgba(124,92,252,0.25)' : C.border}`,
                }}
              >
                Legg til
              </button>
              {addError && (
                <p style={{ width: '100%', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger, margin: 0 }}>
                  {addError}
                </p>
              )}
            </div>
          )}

          {detail.unitsInRoom.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>
              Ingen utstyr i dette rommet
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {detail.unitsInRoom.map((u: EquipmentUnitRow) => (
                <UnitRow
                  key={u.id}
                  label={u.catalog_name}
                  sub={u.unit_label}
                  selected={selectedInRoom.has(u.id)}
                  onToggle={() => toggleInRoom(u.id)}
                />
              ))}
            </div>
          )}

          {selectedInRoom.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
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
                {targetProjectId ? `Flytt ${selectedInRoom.size} til «${targetProjectTitle}»` : 'Velg mål-shoot først'}
              </button>
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
    </div>
  )
}
