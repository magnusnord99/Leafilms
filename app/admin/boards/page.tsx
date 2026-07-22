'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getAllBoards, type BoardOverviewItem } from '@/lib/actions/boards'
import { C } from '@/lib/admin-theme'
import { timeAgo } from '@/lib/format'

function BoardCard({ board }: { board: BoardOverviewItem }) {
  return (
    <Link href={`/admin/boards/${board.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '18px 20px', cursor: 'pointer', transition: 'border-color 0.12s', display: 'flex', flexDirection: 'column', gap: 10 }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.accent}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: C.accent, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {board.customerName}
            </p>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, marginBottom: board.title !== board.projectTitle ? 3 : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {board.projectTitle}
            </p>
            {board.title !== board.projectTitle && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {board.title}
              </p>
            )}
          </div>
          {board.shared && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#4CAF7D', background: 'rgba(76,175,125,0.10)', border: '1px solid rgba(76,175,125,0.30)', padding: '3px 8px', borderRadius: 4, flexShrink: 0 }}>
              Delt
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
          <span>
            {board.cardCount} kort{board.subBoardCount > 0 ? ` · ${board.subBoardCount} underboard${board.subBoardCount === 1 ? '' : 's'}` : ''}
          </span>
          <span>{timeAgo(board.updated_at)}</span>
        </div>
      </div>
    </Link>
  )
}

export default function BoardsOverviewPage() {
  const [boards, setBoards] = useState<BoardOverviewItem[] | null>(null)

  useEffect(() => {
    getAllBoards().then(setBoards)
  }, [])

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.3rem', fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Boards
        </h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>
          Moodboards, storyboards og planlegging — ett board per prosjekt
        </p>
      </div>

      {boards === null ? (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>Laster …</p>
      ) : boards.length === 0 ? (
        <div style={{ background: C.surface, border: `1px dashed ${C.border}`, borderRadius: 10, padding: '36px 24px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.text2, marginBottom: 6 }}>
            Ingen boards ennå
          </p>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>
            Åpne et prosjekt under{' '}
            <Link href="/admin/preprod" style={{ color: C.accent }}>Pre-prod</Link>
            {' '}og klikk «Åpne boards» — så dukker boardet opp her.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {boards.map(b => <BoardCard key={b.id} board={b} />)}
        </div>
      )}
    </div>
  )
}
