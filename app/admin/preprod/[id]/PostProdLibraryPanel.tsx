// app/admin/preprod/[id]/PostProdLibraryPanel.tsx
'use client'

import { useEffect, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { getTaskLibrary, type PostProdLibraryItem } from '@/lib/actions/pipeline'

const C = {
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text3:    '#8484A0',
}

/** Bibliotekselementers dra-id-er er prefikset "lib:" slik at onDragEnd i
 *  PostProdBoard kan skille dem fra ekte task-id-er. */
export function libraryDragId(item: PostProdLibraryItem): string {
  return `lib:${item.id}`
}

function LibraryCard({ item }: { item: PostProdLibraryItem }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: libraryDragId(item) })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6,
        background: C.surface2, border: `1px solid ${item.color ?? C.border}`, cursor: 'grab', touchAction: 'none',
      }}
    >
      {item.icon && <span style={{ fontSize: '0.8rem' }}>{item.icon}</span>}
      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text }}>{item.title}</span>
    </div>
  )
}

export function PostProdLibraryPanel({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<PostProdLibraryItem[]>([])

  useEffect(() => {
    getTaskLibrary().then(setItems)
  }, [refreshKey])

  if (items.length === 0) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.text3 }}>
        Bibliotek — dra inn i en lane
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {items.map(item => <LibraryCard key={item.id} item={item} />)}
      </div>
    </div>
  )
}
