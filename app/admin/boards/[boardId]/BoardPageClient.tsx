'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { C } from '@/lib/admin-theme'
import { renameBoard, type BoardData } from '@/lib/actions/boards'
import BoardCanvas from '@/components/boards/BoardCanvas'

export default function BoardPageClient({ initial }: { initial: BoardData }) {
  const router = useRouter()
  const [title, setTitle] = useState(initial.board.title)

  const saveTitle = () => {
    const t = title.trim()
    if (t && t !== initial.board.title) renameBoard(initial.board.id, t)
    if (!t) setTitle(initial.board.title)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 0px)', background: C.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--font-dm-sans)' }}>
        <Link href={`/admin/preprod/${initial.projectId}`} style={{ color: C.text3, fontSize: '0.8rem', textDecoration: 'none' }}>
          {initial.projectTitle}
        </Link>
        {initial.breadcrumbs.map((b, i) => (
          <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: C.text3 }}>/</span>
            {i === initial.breadcrumbs.length - 1 ? (
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                style={{ background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: '0.85rem', fontWeight: 600, width: Math.max(60, title.length * 8) }}
              />
            ) : (
              <Link href={`/admin/boards/${b.id}`} style={{ color: C.text2, fontSize: '0.8rem', textDecoration: 'none' }}>{b.title}</Link>
            )}
          </span>
        ))}
        <div style={{ flex: 1 }} />
        {/* Del-knapp kommer i Task 13 */}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <BoardCanvas
          boardId={initial.board.id}
          initial={initial}
          onOpenBoard={id => router.push(`/admin/boards/${id}`)}
        />
      </div>
    </div>
  )
}
