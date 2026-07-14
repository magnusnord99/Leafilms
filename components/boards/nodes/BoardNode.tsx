'use client'

import type { NodeProps } from '@xyflow/react'
import type { BoardRefContent } from '@/lib/types'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function BoardNode({ data, selected }: NodeProps<CardNode>) {
  const { palette: P } = useBoardUi()
  const content = data.card.content as BoardRefContent
  const count = data.meta?.cardCount
  return (
    <CardShell selected={!!selected}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: P.accent + '22', border: `1px solid ${P.accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.accent, fontSize: '1rem', flexShrink: 0 }}>▦</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: P.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.meta?.title ?? content.title}
          </div>
          <div style={{ fontSize: '0.68rem', color: P.text2 }}>
            {count !== undefined ? `${count} kort` : 'Underboard'} · dobbeltklikk for å åpne
          </div>
        </div>
      </div>
    </CardShell>
  )
}
