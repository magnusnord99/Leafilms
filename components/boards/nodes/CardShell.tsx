'use client'

import { Handle, Position } from '@xyflow/react'
import { useBoardUi } from '../boardContext'

export default function CardShell({ selected, children, padding = 12 }: {
  selected: boolean
  children: React.ReactNode
  padding?: number
}) {
  const { palette: P, readOnly } = useBoardUi()
  return (
    <div style={{
      width: '100%',
      background: P.surface,
      border: `1px solid ${selected ? P.accent : P.border}`,
      borderRadius: 8,
      padding,
      fontFamily: 'var(--font-dm-sans)',
      color: P.text,
      boxShadow: selected ? `0 0 0 1px ${P.accent}` : '0 2px 10px rgba(0,0,0,0.3)',
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
