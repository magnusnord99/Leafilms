'use client'

import { useState } from 'react'
import {
  DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { C } from '@/lib/admin-theme'
import { WIDGET_REGISTRY } from './registry'
import type { DashboardLayoutItem } from '@/lib/types'
import { saveDashboardLayout } from '@/lib/actions/dashboard'

function SortableRow({ item, onToggle }: { item: DashboardLayoutItem; onToggle: (key: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.widgetKey })
  const def = WIDGET_REGISTRY.find((w) => w.key === item.widgetKey)
  if (!def) return null

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 8, marginBottom: 6,
      }}
    >
      <span {...attributes} {...listeners} style={{ cursor: 'grab', color: C.text3, fontSize: '0.9rem', touchAction: 'none' }}>
        ⠿
      </span>
      <input
        type="checkbox"
        checked={item.enabled}
        onChange={() => onToggle(item.widgetKey)}
        style={{ cursor: 'pointer' }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500, color: item.enabled ? C.text : C.text3 }}>{def.label}</p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{def.description}</p>
      </div>
    </div>
  )
}

export function DashboardCustomizePanel({
  items, onClose, onSaved,
}: {
  items: DashboardLayoutItem[]
  onClose: () => void
  onSaved: (items: DashboardLayoutItem[]) => void
}) {
  const [localItems, setLocalItems] = useState(items)
  const [saving, setSaving] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setLocalItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.widgetKey === active.id)
      const newIndex = prev.findIndex((i) => i.widgetKey === over.id)
      return arrayMove(prev, oldIndex, newIndex).map((item, position) => ({ ...item, position }))
    })
  }

  function toggle(key: string) {
    setLocalItems((prev) => prev.map((i) => (i.widgetKey === key ? { ...i, enabled: !i.enabled } : i)))
  }

  async function handleSave() {
    setSaving(true)
    const result = await saveDashboardLayout(localItems)
    setSaving(false)
    if (result.ok) {
      onSaved(localItems)
      onClose()
    } else {
      alert('Kunne ikke lagre dashboard-oppsettet. Prøv igjen.')
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }} onClick={onClose}>
      <div
        style={{ width: 360, maxWidth: '90vw', height: '100%', background: C.sidebar, borderLeft: `1px solid ${C.border}`, padding: 24, overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 600, color: C.text }}>Tilpass dashboard</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: '1.1rem' }}>✕</button>
        </div>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginBottom: 16 }}>
          Dra for å endre rekkefølge. Fjern haken for å skjule en widget.
        </p>

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext items={localItems.map((i) => i.widgetKey)} strategy={verticalListSortingStrategy}>
            {localItems.map((item) => (
              <SortableRow key={item.widgetKey} item={item} onToggle={toggle} />
            ))}
          </SortableContext>
        </DndContext>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            marginTop: 16, width: '100%', background: C.accent, color: '#fff', border: 'none',
            borderRadius: 6, padding: '10px 16px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
            fontWeight: 500, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Lagrer...' : 'Lagre'}
        </button>
      </div>
    </div>
  )
}
