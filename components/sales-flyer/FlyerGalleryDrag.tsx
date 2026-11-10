'use client'

import { useState, type ReactNode } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin,
  useSensor, useSensors, type CollisionDetection,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'

const collisionDetection: CollisionDetection = args => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)

export function FlyerGalleryDragArea({ images, onSwap, children }: {
  images: { id: string; path: string | null }[]
  onSwap: (source: string, target: string) => void
  children: ReactNode
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const active = images.find(image => image.id === activeId)
  return <DndContext sensors={sensors} collisionDetection={collisionDetection}
    onDragStart={({ active }) => setActiveId(String(active.id))}
    onDragCancel={() => setActiveId(null)}
    onDragEnd={({ active, over }) => {
      setActiveId(null)
      if (over && active.id !== over.id) onSwap(String(active.id), String(over.id))
    }}>
    <SortableContext items={images.map(image => image.id)}>
      {children}
    </SortableContext>
    <DragOverlay dropAnimation={null}>
      {active?.path && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={active.path} alt="Bildet som flyttes" className="h-32 w-44 rounded border-2 border-[#C49434] object-cover shadow-xl" draggable={false} />
      )}
    </DragOverlay>
  </DndContext>
}

export function FlyerGalleryImage({ id, editing, disabled, className, children }: {
  id: string; editing: boolean; disabled: boolean; className: string; children: ReactNode
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging, isOver } = useSortable({ id, disabled: !editing || disabled })
  return <div ref={setNodeRef} className={`relative overflow-hidden ${className}`}
    style={{ background: '#161410', opacity: isDragging ? 0.4 : 1,
      outline: isOver && !isDragging ? '3px solid #C49434' : undefined, outlineOffset: -3 }}>
    {children}
    {editing && (
      <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} disabled={disabled}
        aria-label={`Flytt bilde ${id.replace('example_image_', '')}. Slipp på et annet bilde for å bytte plass.`}
        className="absolute bottom-3 right-3 z-10 rounded border border-white/30 bg-black/75 px-3 py-2 text-xs text-white shadow transition hover:bg-black focus-visible:outline-2 focus-visible:outline-[#C49434] disabled:opacity-40"
        style={{ touchAction: 'none', cursor: disabled ? 'wait' : isDragging ? 'grabbing' : 'grab' }}>
        <span aria-hidden="true">↔ </span>Dra for å bytte plass
      </button>
    )}
  </div>
}
