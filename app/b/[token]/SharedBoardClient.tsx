'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { S } from '@/lib/client-theme'
import type { SharedBoardData } from '@/lib/actions/boards'
import BoardCanvas from '@/components/boards/BoardCanvas'
import PublicBoardInfoPanel from '@/components/boards/PublicBoardInfoPanel'
import type { BoardPalette } from '@/components/boards/boardContext'

export const CINEMATIC_PALETTE: BoardPalette = {
  surface: S.surface2, surface2: S.surface3, border: S.border,
  text: S.text, text2: S.text2, accent: S.gold, canvasBg: S.bg,
}

export default function SharedBoardClient({ token, data }: { token: string; data: SharedBoardData }) {
  const router = useRouter()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: S.bg }}>
      {/* Under 768px: infopanelet blir en dropdown øverst (se PublicBoardInfoPanel),
          så raden må bli en kolonne med panelet først i stedet for til høyre. */}
      <style>{`
        .lf-shared-board-body { display: flex; flex: 1; min-height: 0; }
        @media (max-width: 768px) {
          .lf-shared-board-body { flex-direction: column; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: `1px solid ${S.border}` }}>
        <span style={{ fontFamily: 'var(--font-cormorant)', color: S.gold, fontSize: '1.05rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Leafilms</span>
        <span style={{ color: S.text3 }}>·</span>
        {data.breadcrumbs.map((b, i) => (
          <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem' }}>
            {i > 0 && <span style={{ color: S.text3 }}>/</span>}
            {i === data.breadcrumbs.length - 1
              ? <span style={{ color: S.text, fontWeight: 600 }}>{b.title}</span>
              : <Link href={b.id === data.rootBoardId ? `/b/${token}` : `/b/${token}?board=${b.id}`} style={{ color: S.text2, textDecoration: 'none' }}>{b.title}</Link>}
          </span>
        ))}
      </div>
      <div className="lf-shared-board-body">
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <BoardCanvas
            key={data.board.id}
            boardId={data.board.id}
            initial={{ ...data, projectId: '' }}
            readOnly
            palette={CINEMATIC_PALETTE}
            onOpenBoard={id => router.push(`/b/${token}?board=${id}`)}
            onOpenSchedule={cardId => router.push(`/b/${token}/schedule/${cardId}`)}
          />
        </div>
        <PublicBoardInfoPanel data={data} />
      </div>
    </div>
  )
}
