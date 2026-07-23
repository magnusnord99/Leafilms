'use client'

import { useState } from 'react'
import { Handle, NodeToolbar, Position } from '@xyflow/react'
import { useBoardUi } from '../boardContext'
import { useBoardComments } from '../boardCommentsContext'
import CommentThread from '../CommentThread'

export default function CardShell({ cardId, selected, dropActive, children, padding = 12 }: {
  cardId: string
  selected: boolean
  // Vises som mottaksklar under drag når et kort svever over dette kortet (kun board/storyline).
  dropActive?: boolean
  children: React.ReactNode
  padding?: number
}) {
  const { palette: P, readOnly } = useBoardUi()
  const { threadsByCard, openCardId, openThread, closeThread } = useBoardComments()
  const [hovered, setHovered] = useState(false)

  const entry = threadsByCard[cardId]
  const commentCount = entry?.comments.length ?? 0
  const resolved = entry?.thread.resolved ?? false
  const isOpen = openCardId === cardId

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        position: 'relative',
        background: P.surface,
        border: `1px solid ${dropActive || selected ? P.accent : P.border}`,
        borderRadius: 8,
        padding,
        fontFamily: 'var(--font-dm-sans)',
        color: P.text,
        boxShadow: dropActive
          ? `0 0 0 3px ${P.accent}55, 0 10px 26px rgba(0,0,0,0.45)`
          : selected ? `0 0 0 1px ${P.accent}` : '0 2px 10px rgba(0,0,0,0.3)',
        transform: dropActive ? 'scale(1.06)' : 'scale(1)',
        transition: 'transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
      }}
    >
      {!readOnly && (
        <>
          <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, background: P.border, border: 'none' }} />
          <Handle type="source" position={Position.Right} style={{ width: 8, height: 8, background: P.accent, border: 'none' }} />
        </>
      )}
      {!readOnly && (commentCount > 0 || hovered) && (
        <button
          className="nodrag"
          onClick={e => { e.stopPropagation(); isOpen ? closeThread() : openThread(cardId) }}
          title={commentCount > 0 ? `${commentCount} kommentar${commentCount === 1 ? '' : 'er'}` : 'Kommenter'}
          style={{
            position: 'absolute', top: -10, right: -10, zIndex: 5,
            display: 'flex', alignItems: 'center', gap: 3,
            background: isOpen ? P.accent : P.surface2,
            color: resolved && commentCount > 0 ? P.text2 : (isOpen ? '#fff' : P.text),
            border: `1px solid ${P.border}`, borderRadius: 12,
            padding: '2px 7px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          }}
        >
          💬{commentCount > 0 ? ` ${commentCount}` : ''}
        </button>
      )}
      {!readOnly && (
        <NodeToolbar nodeId={cardId} isVisible={isOpen} position={Position.Right} align="start" offset={14}>
          <CommentThread cardId={cardId} onClose={closeThread} />
        </NodeToolbar>
      )}
      {children}
    </div>
  )
}
