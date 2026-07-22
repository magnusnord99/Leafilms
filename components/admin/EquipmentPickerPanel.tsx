'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getProjectMeta, getProjectEquipment, cancelReservation, returnUnits,
  ProjectEquipmentUnit,
} from '@/lib/actions/equipment'
import { EQUIPMENT_CATEGORY_LABELS } from '@/lib/equipment-constants'

const C = {
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  danger:   '#E05555',
}

export default function EquipmentPickerPanel({
  projectId, onChange, refreshSignal,
}: {
  projectId: string
  onChange?: () => void
  refreshSignal?: number
}) {
  const [title, setTitle] = useState('')
  const [physicallyOut, setPhysicallyOut] = useState(false)
  const [units, setUnits] = useState<ProjectEquipmentUnit[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(() => {
    Promise.all([getProjectMeta(projectId), getProjectEquipment(projectId)]).then(([meta, list]) => {
      setTitle(meta?.title ?? '')
      setPhysicallyOut(meta?.physicallyOut ?? false)
      setUnits(list)
      setLoading(false)
    })
  }, [projectId])

  useEffect(() => { setLoading(true); load() }, [load, refreshSignal])

  async function handleRemove(unit: ProjectEquipmentUnit) {
    setBusyId(unit.id)
    if (physicallyOut) {
      await returnUnits([unit.id], unit.room_id ?? '')
    } else {
      await cancelReservation([{ unitId: unit.id, projectId }])
    }
    setBusyId(null)
    load()
    onChange?.()
  }

  const byCategory = units.reduce<Record<string, ProjectEquipmentUnit[]>>((acc, u) => {
    (acc[u.catalog_category] ??= []).push(u)
    return acc
  }, {})

  return (
    <div style={{
      width: 260, flexShrink: 0, position: 'sticky', top: 24,
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '16px 16px', maxHeight: 'calc(100vh - 48px)', overflowY: 'auto',
    }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, margin: '0 0 2px' }}>
        Valgt utstyr
      </p>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, margin: '0 0 14px', fontWeight: 600 }}>
        {title || '…'}
      </p>

      {loading ? (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
      ) : units.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, fontStyle: 'italic' }}>
          Ingenting hentet ennå
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {Object.entries(byCategory).map(([category, items]) => (
            <div key={category}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.text3, margin: '0 0 6px' }}>
                {EQUIPMENT_CATEGORY_LABELS[category] ?? category}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {items.map(u => (
                  <div key={u.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                    borderRadius: 6, background: C.surface2, border: `1px solid ${C.border}`,
                  }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, flex: 1 }}>
                      {u.catalog_name} <span style={{ color: C.text3 }}>{u.unit_label}</span>
                    </span>
                    <button
                      onClick={() => handleRemove(u)}
                      disabled={busyId === u.id}
                      title={physicallyOut ? 'Lever tilbake til hjemme-rom' : 'Avreserver'}
                      style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', lineHeight: 1,
                        padding: '3px 7px', borderRadius: 4, cursor: 'pointer', flexShrink: 0,
                        background: 'transparent', color: C.danger, border: '1px solid rgba(224,85,85,0.3)',
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, margin: '14px 0 0' }}>
        {units.length} enhet{units.length !== 1 ? 'er' : ''} totalt
      </p>
    </div>
  )
}
