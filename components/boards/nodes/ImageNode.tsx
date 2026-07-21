'use client'

import { useEffect, useState } from 'react'
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

  // Escape lukker lightboxen, i tillegg til klikk — viktig for eksterne
  // seere på den offentlige delingssiden som ikke nødvendigvis klikker.
  useEffect(() => {
    if (!lightbox) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightbox])

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
      {/* padding=0 — bildet skal fylle kortet helt uten en synlig ramme rundt seg,
          samme mønster som LinkNode allerede bruker for sitt forhåndsvisningsbilde. */}
      <CardShell selected={!!selected} padding={0}>
        <img
          src={content.url}
          alt={content.caption ?? ''}
          onDoubleClick={() => setLightbox(true)}
          style={{ width: '100%', display: 'block', borderRadius: (content.caption || editingCaption || !readOnly) ? '7px 7px 0 0' : 7 }}
          draggable={false}
        />
        {(content.caption || editingCaption || !readOnly) && (
          <div style={{ padding: '6px 10px' }}>
            {editingCaption ? (
              <input
                autoFocus
                className="nodrag"
                value={caption}
                onChange={e => setCaption(e.target.value)}
                onBlur={saveCaption}
                onKeyDown={e => e.key === 'Enter' && saveCaption()}
                placeholder="Bildetekst"
                style={{ width: '100%', background: P.surface2, color: P.text, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', fontSize: '0.72rem', outline: 'none' }}
              />
            ) : (
              <div
                onDoubleClick={() => !readOnly && setEditingCaption(true)}
                style={{ fontSize: '0.72rem', color: content.caption ? P.text2 : 'transparent', minHeight: 12 }}
              >
                {content.caption || '·'}
              </div>
            )}
          </div>
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
