'use client'

import { useState } from 'react'
import { useReactFlow, type NodeProps } from '@xyflow/react'
import type { ColorContent } from '@/lib/types'
import { updateCardContent } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function ColorNode({ id, data, selected }: NodeProps<CardNode>) {
  const rf = useReactFlow()
  const { palette: P, readOnly, markLocalOp, recordContentEdit } = useBoardUi()
  const content = data.card.content as ColorContent
  // Transient buffer mens fargevelgeren er åpen — onChange fyrer kontinuerlig under
  // dragging, så vi previewer kun lokalt og committer ÉN skriving ved blur.
  const [previewHex, setPreviewHex] = useState<string | null>(null)
  const shownHex = previewHex ?? content.hex

  const commit = (value: string) => {
    if (value !== content.hex) {
      markLocalOp(id)
      recordContentEdit(id, content, { hex: value })
      // Oppdater node-data immutabelt så visningen reflekterer lagringen umiddelbart,
      // samtidig som eksterne oppdateringer (realtime, Task 12) fortsatt slår gjennom.
      rf.updateNodeData(id, { card: { ...data.card, content: { hex: value } } })
      updateCardContent(id, { hex: value })
    }
    setPreviewHex(null)
  }

  return (
    <CardShell cardId={id} selected={!!selected} padding={6}>
      <div style={{ position: 'relative', width: '100%', height: 90, borderRadius: 5, background: shownHex, border: `1px solid ${P.border}` }}>
        {!readOnly && (
          <input
            type="color"
            className="nodrag"
            value={shownHex}
            onChange={e => setPreviewHex(e.target.value)}
            onBlur={e => commit(e.target.value)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
          />
        )}
      </div>
      <div style={{ marginTop: 6, fontSize: '0.72rem', color: P.text2, textAlign: 'center', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{shownHex}</div>
    </CardShell>
  )
}
