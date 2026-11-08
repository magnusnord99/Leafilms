'use client'

import { useState } from 'react'
import {
  DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { C } from '@/lib/admin-theme'
import { WIDGET_REGISTRY } from './registry'
import type { DashboardLayoutItem, DashboardWidgetKey } from '@/lib/types'
import { saveDashboardLayout } from '@/lib/actions/dashboard'

const COLUMN_COUNT = 2

function groupByColumn(items: DashboardLayoutItem[]): DashboardLayoutItem[][] {
  const columns: DashboardLayoutItem[][] = Array.from({ length: COLUMN_COUNT }, () => [])
  for (const item of items) {
    const col = columns[item.column] ?? columns[0]
    col.push(item)
  }
  for (const col of columns) col.sort((a, b) => a.position - b.position)
  return columns
}

function flattenColumns(columns: DashboardLayoutItem[][]): DashboardLayoutItem[] {
  return columns.flatMap((col, column) => col.map((item, position) => ({ widgetKey: item.widgetKey, column, position })))
}

function SortableWidget({
  widgetKey, editing, onDelete, children,
}: {
  widgetKey: DashboardWidgetKey
  editing: boolean
  onDelete: () => void
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widgetKey, disabled: !editing })

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, position: 'relative' }}>
      {editing && (
        <button
          onClick={onDelete}
          title="Fjern widget"
          style={{
            position: 'absolute', top: -10, right: -10, zIndex: 2,
            width: 22, height: 22, borderRadius: '50%', border: `1px solid ${C.border}`,
            background: C.surface2, color: C.text2, cursor: 'pointer', fontSize: '0.7rem', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          ✕
        </button>
      )}
      <div
        {...(editing ? { ...attributes, ...listeners } : {})}
        style={{
          cursor: editing ? 'grab' : 'default',
          borderRadius: 10,
          ...(editing && { outline: `1px dashed ${C.border}`, outlineOffset: 6 }),
        }}
      >
        <div style={{ pointerEvents: editing ? 'none' : 'auto' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function DroppableColumn({
  columnIndex, items, editing, hiddenWidgets, onAdd, children,
}: {
  columnIndex: number
  items: DashboardLayoutItem[]
  editing: boolean
  hiddenWidgets: typeof WIDGET_REGISTRY
  onAdd: (key: DashboardWidgetKey, column: number) => void
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id: `column-${columnIndex}` })
  return (
    <SortableContext items={items.map((i) => i.widgetKey)} strategy={verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        style={{
          display: 'flex', flexDirection: 'column', gap: 40, minHeight: editing ? 80 : undefined,
          ...(editing && { background: C.surface2, border: `1px dashed ${C.border}`, borderRadius: 12, padding: 16 }),
        }}
      >
        {children}
        {editing && <AddWidgetTile columnIndex={columnIndex} hiddenWidgets={hiddenWidgets} onAdd={onAdd} />}
      </div>
    </SortableContext>
  )
}

function AddWidgetTile({ columnIndex, hiddenWidgets, onAdd }: {
  columnIndex: number
  hiddenWidgets: typeof WIDGET_REGISTRY
  onAdd: (key: DashboardWidgetKey, column: number) => void
}) {
  const [open, setOpen] = useState(false)
  if (hiddenWidgets.length === 0) return null

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', padding: '14px 16px', borderRadius: 8, border: `1px dashed ${C.border}`,
          background: 'transparent', color: C.text3, cursor: 'pointer', fontFamily: 'var(--font-dm-sans)',
          fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        + Legg til widget
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 10,
          background: C.sidebar, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}>
          {hiddenWidgets.map((w) => (
            <button
              key={w.key}
              onClick={() => { onAdd(w.key, columnIndex); setOpen(false) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none',
                border: 'none', borderBottom: `1px solid ${C.border}`, color: C.text, cursor: 'pointer',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
              }}
            >
              <div style={{ fontWeight: 500 }}>{w.label}</div>
              <div style={{ fontSize: '0.68rem', color: C.text3 }}>{w.description}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DashboardGrid({
  items, editing, onChange,
}: {
  items: DashboardLayoutItem[]
  editing: boolean
  onChange: (items: DashboardLayoutItem[]) => void
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))
  const columns = groupByColumn(items)
  const placedKeys = new Set(items.map((i) => i.widgetKey))
  const hiddenWidgets = WIDGET_REGISTRY.filter((w) => !placedKeys.has(w.key))

  function persist(next: DashboardLayoutItem[]) {
    onChange(next)
    saveDashboardLayout(next)
  }

  function handleDelete(widgetKey: DashboardWidgetKey) {
    persist(flattenColumns(groupByColumn(items.filter((i) => i.widgetKey !== widgetKey))))
  }

  function handleAdd(widgetKey: DashboardWidgetKey, column: number) {
    const working = groupByColumn(items)
    working[column] = [...working[column], { widgetKey, column, position: working[column].length }]
    persist(flattenColumns(working))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const activeKey = active.id as DashboardWidgetKey
    const overId = over.id as string

    const sourceColumn = items.find((i) => i.widgetKey === activeKey)?.column
    if (sourceColumn === undefined) return

    const working = groupByColumn(items)
    const sourceArr = working[sourceColumn]
    const activeIdx = sourceArr.findIndex((i) => i.widgetKey === activeKey)
    if (activeIdx === -1) return
    const [moved] = sourceArr.splice(activeIdx, 1)

    let destColumn: number
    let destIndexHint: DashboardWidgetKey | null = null
    if (overId.startsWith('column-')) {
      destColumn = Number(overId.replace('column-', ''))
    } else {
      const overItem = items.find((i) => i.widgetKey === overId)
      destColumn = overItem ? overItem.column : sourceColumn
      destIndexHint = overId as DashboardWidgetKey
    }

    const destArr = working[destColumn]
    let insertAt = destArr.length
    if (destIndexHint) {
      const idx = destArr.findIndex((i) => i.widgetKey === destIndexHint)
      if (idx !== -1) insertAt = idx
    }
    destArr.splice(insertAt, 0, moved)

    persist(flattenColumns(working))
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {/* Fast 2-kolonners grid uten responsiv fallback gjorde at mobil måtte scrolle
          sidelengs (feedback 6291bae8) — én kolonne under md-breakpointet, som resten
          av adminflatens 2-kolonners seksjoner allerede gjør (se GalleryReviewClient.tsx). */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 32, alignItems: 'start' }}>
        {columns.map((colItems, columnIndex) => (
          <DroppableColumn
            key={columnIndex}
            columnIndex={columnIndex}
            items={colItems}
            editing={editing}
            hiddenWidgets={hiddenWidgets}
            onAdd={handleAdd}
          >
            {colItems.map((item) => {
              const def = WIDGET_REGISTRY.find((w) => w.key === item.widgetKey)
              if (!def) return null
              const Widget = def.component
              return (
                <SortableWidget key={item.widgetKey} widgetKey={item.widgetKey} editing={editing} onDelete={() => handleDelete(item.widgetKey)}>
                  <Widget />
                </SortableWidget>
              )
            })}
          </DroppableColumn>
        ))}
      </div>
    </DndContext>
  )
}
