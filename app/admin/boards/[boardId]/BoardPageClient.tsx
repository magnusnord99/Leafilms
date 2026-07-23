'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { C } from '@/lib/admin-theme'
import { renameBoard, type BoardData } from '@/lib/actions/boards'
import BoardCanvas from '@/components/boards/BoardCanvas'
import BoardInfoPanel from '@/components/boards/BoardInfoPanel'
import ShareDialog from '@/components/boards/ShareDialog'

export default function BoardPageClient({ initial }: { initial: BoardData }) {
  const router = useRouter()
  const [title, setTitle] = useState(initial.board.title)
  const [shareOpen, setShareOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(true)

  const saveTitle = () => {
    const t = title.trim()
    if (t && t !== initial.board.title) renameBoard(initial.board.id, t)
    if (!t) setTitle(initial.board.title)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 0px)', background: C.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--font-dm-sans)' }}>
        <Link href={`/admin/preprod/${initial.projectId}`} style={{ display: 'flex', flexDirection: 'column', gap: 1, textDecoration: 'none' }}>
          <span style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: C.accent }}>
            {initial.customerName}
          </span>
          <span style={{ color: C.text3, fontSize: '0.8rem' }}>
            {initial.projectTitle}
          </span>
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
        <button
          onClick={() => setInfoOpen(v => !v)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '9px 16px',
            fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--font-dm-sans)', cursor: 'pointer',
            background: infoOpen ? C.accentBg : 'none', color: infoOpen ? C.accent : C.text2,
            border: `1px solid ${infoOpen ? C.accent + '40' : C.border}`,
          }}
        >
          ⓘ Info
        </button>
        <button
          onClick={() => setShareOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.accentBg, color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 8, padding: '9px 16px', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--font-dm-sans)', cursor: 'pointer' }}
        >
          ⇪ Del
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <BoardCanvas
            boardId={initial.board.id}
            initial={initial}
            onOpenBoard={id => router.push(`/admin/boards/${id}`)}
            onOpenSchedule={(cardId, boardId) => router.push(`/admin/boards/${boardId}/schedule/${cardId}`)}
          />
        </div>
        {infoOpen && <BoardInfoPanel data={initial} />}
      </div>
      {shareOpen && (
        <ShareDialog boardId={initial.board.id} initialToken={initial.board.share_token} onClose={() => setShareOpen(false)} />
      )}
    </div>
  )
}
