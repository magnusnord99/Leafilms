'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import type { ImageContent } from '@/lib/types'
import { updateCardContent, saveCardPositions } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function ImageNode({ id, data, selected }: NodeProps<CardNode>) {
  const rf = useReactFlow()
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const content = data.card.content as ImageContent
  const [lightbox, setLightbox] = useState(false)
  const [editingCaption, setEditingCaption] = useState(false)
  const [caption, setCaption] = useState(content.caption ?? '')

  const saveCaption = () => {
    setEditingCaption(false)
    if (caption !== (content.caption ?? '')) {
      markLocalOp(id)
      // Oppdater node-data immutabelt så visningen reflekterer lagringen umiddelbart,
      // samtidig som eksterne oppdateringer (realtime, Task 12) fortsatt slår gjennom.
      rf.updateNodeData(id, { card: { ...data.card, content: { url: content.url, caption } } })
      updateCardContent(id, { url: content.url, caption })
    }
  }

  return (
    <>
      {!readOnly && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={120}
          keepAspectRatio={false}
          onResizeEnd={(_e, params) => {
            markLocalOp(id)
            saveCardPositions([{ id, x: params.x, y: params.y, width: params.width }])
          }}
        />
      )}
      <CardShell selected={!!selected} padding={6}>
        <img
          src={content.url}
          alt={content.caption ?? ''}
          onDoubleClick={() => setLightbox(true)}
          style={{ width: '100%', display: 'block', borderRadius: 4 }}
          draggable={false}
        />
        {(content.caption || editingCaption || !readOnly) && (
          editingCaption ? (
            <input
              autoFocus
              className="nodrag"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              onBlur={saveCaption}
              onKeyDown={e => e.key === 'Enter' && saveCaption()}
              placeholder="Bildetekst"
              style={{ width: '100%', marginTop: 6, background: P.surface2, color: P.text, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', fontSize: '0.72rem', outline: 'none' }}
            />
          ) : (
            <div
              onDoubleClick={() => !readOnly && setEditingCaption(true)}
              style={{ marginTop: content.caption ? 6 : 2, fontSize: '0.72rem', color: content.caption ? P.text2 : 'transparent', minHeight: 12 }}
            >
              {content.caption || '·'}
            </div>
          )
        )}
      </CardShell>
      {lightbox && createPortal(
        <div
          onClick={() => setLightbox(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img src={content.url} alt="" style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 6 }} />
        </div>,
        document.body
      )}
    </>
  )
}
