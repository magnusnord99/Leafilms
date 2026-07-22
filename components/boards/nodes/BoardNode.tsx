'use client'

import { useState } from 'react'
import { useReactFlow, type NodeProps } from '@xyflow/react'
import type { BoardRefContent } from '@/lib/types'
import { updateCardContent } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import { BoardRefIcon } from '../icons'
import type { CardNode } from '../toFlow'

export default function BoardNode({ id, data, selected }: NodeProps<CardNode>) {
  const rf = useReactFlow()
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const content = data.card.content as BoardRefContent
  const count = data.meta?.cardCount
  // Transient buffer mens fargevelgeren er åpen — samme mønster som ColorNode.
  const [previewHex, setPreviewHex] = useState<string | null>(null)
  const color = previewHex ?? content.color ?? P.accent

  const commit = (value: string) => {
    if (value !== content.color) {
      markLocalOp(id)
      const next = { ...content, color: value }
      rf.updateNodeData(id, { card: { ...data.card, content: next } })
      updateCardContent(id, next)
    }
    setPreviewHex(null)
  }

  return (
    <CardShell cardId={id} selected={!!selected} dropActive={!!data.dropTarget}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 34, height: 34, borderRadius: 8, background: color + '22', border: `1px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
          <BoardRefIcon size={18} />
          {!readOnly && (
            <input
              type="color"
              className="nodrag"
              value={content.color ?? P.accent}
              onChange={e => setPreviewHex(e.target.value)}
              onBlur={e => commit(e.target.value)}
              title="Bytt farge på board"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
            />
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: P.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.meta?.title ?? content.title}
          </div>
          <div style={{ fontSize: '0.68rem', color: data.dropTarget ? P.accent : P.text2, fontWeight: data.dropTarget ? 600 : 400 }}>
            {data.dropTarget ? 'Slipp for å flytte inn' : (count !== undefined ? `${count} kort` : 'Underboard') + ' · dobbeltklikk for å åpne'}
          </div>
        </div>
      </div>
    </CardShell>
  )
}
