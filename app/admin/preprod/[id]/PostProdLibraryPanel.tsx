// app/admin/preprod/[id]/PostProdLibraryPanel.tsx
'use client'

import { useEffect, useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { getTaskLibrary, deleteTaskLibraryItem, type PostProdLibraryItem } from '@/lib/actions/pipeline'

const C = {
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text3:    '#8484A0',
  danger:   '#E05555',
}

/** Bibliotekselementers dra-id-er er prefikset "lib:" slik at onDragEnd i
 *  PostProdBoard kan skille dem fra ekte task-id-er. */
export function libraryDragId(item: PostProdLibraryItem): string {
  return `lib:${item.id}`
}

function LibraryCard({ item, onDelete }: { item: PostProdLibraryItem; onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: libraryDragId(item) })
  const [deleting, setDeleting] = useState(false)

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(true)
    const result = await deleteTaskLibraryItem(item.id)
    if (result.ok) onDelete(item.id)
    else setDeleting(false)
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 6,
        background: C.surface2, border: `1px solid ${item.color ?? C.border}`, cursor: 'grab', touchAction: 'none',
        opacity: deleting ? 0.5 : 1,
      }}
    >
      {item.icon && <span style={{ fontSize: '0.8rem' }}>{item.icon}</span>}
      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text }}>{item.title}</span>
      <button
        onClick={handleDelete}
        onPointerDown={e => e.stopPropagation()}
        disabled={deleting}
        title="Slett fra biblioteket"
        style={{ background: 'none', border: 'none', cursor: deleting ? 'wait' : 'pointer', color: C.text3, padding: 0, lineHeight: 0, marginLeft: 2 }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 2l8 8M10 2L2 10" />
        </svg>
      </button>
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
        {items.map(item => (
          <LibraryCard key={item.id} item={item} onDelete={id => setItems(prev => prev.filter(i => i.id !== id))} />
        ))}
      </div>
    </div>
  )
}
