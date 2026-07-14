'use client'

import { useReactFlow, type NodeProps } from '@xyflow/react'
import type { ColorContent } from '@/lib/types'
import { updateCardContent } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function ColorNode({ id, data, selected }: NodeProps<CardNode>) {
  const rf = useReactFlow()
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const content = data.card.content as ColorContent

  const save = (value: string) => {
    if (value !== content.hex) {
      markLocalOp(id)
      // Oppdater node-data immutabelt så visningen reflekterer lagringen umiddelbart,
      // samtidig som eksterne oppdateringer (realtime, Task 12) fortsatt slår gjennom.
      rf.updateNodeData(id, { card: { ...data.card, content: { hex: value } } })
      updateCardContent(id, { hex: value })
    }
  }

  return (
    <CardShell selected={!!selected} padding={6}>
      <div style={{ position: 'relative', width: '100%', height: 90, borderRadius: 5, background: content.hex, border: `1px solid ${P.border}` }}>
        {!readOnly && (
          <input
            type="color"
            className="nodrag"
            defaultValue={content.hex}
            onChange={e => save(e.target.value)}
            onBlur={e => save(e.target.value)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
          />
        )}
      </div>
      <div style={{ marginTop: 6, fontSize: '0.72rem', color: P.text2, textAlign: 'center', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{content.hex}</div>
    </CardShell>
  )
}
