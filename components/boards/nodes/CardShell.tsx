'use client'

import { Handle, Position } from '@xyflow/react'
import { useBoardUi } from '../boardContext'

export default function CardShell({ selected, dropActive, children, padding = 12 }: {
  selected: boolean
  // Vises som mottaksklar under drag når et kort svever over dette kortet (kun board/storyline).
  dropActive?: boolean
  children: React.ReactNode
  padding?: number
}) {
  const { palette: P, readOnly } = useBoardUi()
  return (
    <div style={{
      width: '100%',
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
    }}>
      {!readOnly && (
        <>
          <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, background: P.border, border: 'none' }} />
          <Handle type="source" position={Position.Right} style={{ width: 8, height: 8, background: P.accent, border: 'none' }} />
        </>
      )}
      {children}
    </div>
  )
}
