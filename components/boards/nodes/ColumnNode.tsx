'use client'

import { useState } from 'react'
import { useReactFlow, type NodeProps } from '@xyflow/react'
import type { ColumnContent } from '@/lib/types'
import { updateCardContent } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import type { CardNode } from '../toFlow'

export default function ColumnNode({ id, data, selected }: NodeProps<CardNode>) {
  const rf = useReactFlow()
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const content = data.card.content as ColumnContent
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content.title)

  const save = () => {
    setEditing(false)
    const t = draft.trim() || 'Kolonne'
    if (t !== content.title) {
      markLocalOp(id)
      // Oppdater node-data immutabelt så visningen reflekterer lagringen umiddelbart,
      // samtidig som eksterne oppdateringer (realtime, Task 12) fortsatt slår gjennom.
      rf.updateNodeData(id, { card: { ...data.card, content: { title: t } } })
      updateCardContent(id, { title: t })
    }
  }

  const titleStyle: React.CSSProperties = {
    width: '100%', background: 'transparent', border: 'none', outline: 'none',
    color: P.text, fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.04em',
    textTransform: 'uppercase', padding: '12px 12px 4px', textAlign: 'center',
  }

  return (
    <div style={{
      width: '100%', height: '100%', minHeight: 140,
      background: `${P.surface}99`,
      border: `1px ${selected ? 'solid' : 'dashed'} ${selected ? P.accent : P.border}`,
      borderRadius: 10, fontFamily: 'var(--font-dm-sans)',
    }}>
      {editing ? (
        <input
          autoFocus
          className="nodrag"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={titleStyle}
        />
      ) : (
        <input
          value={content.title}
          readOnly
          onDoubleClick={() => { if (!readOnly) { setDraft(content.title); setEditing(true) } }}
          style={{ ...titleStyle, cursor: readOnly ? 'default' : 'text' }}
        />
      )}
    </div>
  )
}
