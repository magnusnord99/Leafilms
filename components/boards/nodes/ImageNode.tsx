'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import type { ImageContent } from '@/lib/types'
import { updateCardContent, saveCardPositions } from '@/lib/actions/boards'
import { uploadBoardFile } from '../upload'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function ImageNode({ id, data, selected }: NodeProps<CardNode>) {
  const rf = useReactFlow()
  const { palette: P, readOnly, markLocalOp, onCardResize, recordContentEdit } = useBoardUi()
  const content = data.card.content as ImageContent
  const [lightbox, setLightbox] = useState(false)
  const [editingCaption, setEditingCaption] = useState(false)
  const [caption, setCaption] = useState(content.caption ?? '')
  const [replacing, setReplacing] = useState(false)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  const replaceImage = async (file: File) => {
    setReplacing(true)
    const res = await uploadBoardFile(data.card.board_id, file)
    setReplacing(false)
    if ('error' in res) { window.alert(res.error); return }
    markLocalOp(id)
    const next = { ...content, url: res.url }
    recordContentEdit(id, content, next)
    rf.updateNodeData(id, { card: { ...data.card, content: next } })
    updateCardContent(id, next)
  }

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
      recordContentEdit(id, content, { url: content.url, caption })
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
      <CardShell cardId={id} selected={!!selected} padding={0}>
        <div style={{ position: 'relative' }}>
          {content.url ? (
            <img
              src={content.url}
              alt={content.caption ?? ''}
              onDoubleClick={() => setLightbox(true)}
              // Bildet har ingen reservert høyde, så den reelle høyden er ukjent inntil lastet —
              // trigger en ny kolonne-restack med korrekt høyde når den blir kjent.
              onLoad={onCardResize}
              style={{ width: '100%', display: 'block', borderRadius: (content.caption || editingCaption || !readOnly) ? '7px 7px 0 0' : 7, opacity: replacing ? 0.5 : 1 }}
              draggable={false}
            />
          ) : (
            // Tom bildeplass — sådd inn av f.eks. storyline-blueprinten. Klikk for å laste opp.
            <div
              className="nodrag"
              onClick={() => !readOnly && replaceInputRef.current?.click()}
              style={{
                width: '100%', aspectRatio: '16 / 9', background: P.surface2,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: (content.caption || editingCaption || !readOnly) ? '7px 7px 0 0' : 7,
                cursor: readOnly ? 'default' : 'pointer', opacity: replacing ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: '0.72rem', color: P.text2 }}>{replacing ? '…' : readOnly ? 'Ingen bilde' : '+ Last opp bilde'}</span>
            </div>
          )}
          {!readOnly && content.url && (
            <>
              <button
                type="button"
                className="nodrag"
                title="Bytt bilde"
                disabled={replacing}
                onClick={() => replaceInputRef.current?.click()}
                style={{
                  position: 'absolute', top: 6, right: 6, width: 26, height: 26,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', borderRadius: 6,
                  fontSize: '0.85rem', cursor: replacing ? 'default' : 'pointer',
                }}
              >
                {replacing ? '…' : '⟳'}
              </button>
            </>
          )}
          {!readOnly && (
            <input
              ref={replaceInputRef}
              type="file"
              accept="image/*"
              className="nodrag"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) replaceImage(f) }}
            />
          )}
        </div>
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
