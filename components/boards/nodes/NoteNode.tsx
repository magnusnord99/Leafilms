'use client'

import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { NoteContent } from '@/lib/types'
import { updateCardContent } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

function renderInline(text: string, key: number) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </span>
  )
}

export default function NoteNode({ id, data, selected }: NodeProps<CardNode>) {
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const content = data.card.content as NoteContent
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content.text)
  // Lokal kopi av lagret tekst — unngår å mutere `content` (prop) direkte;
  // holder visningen i sync med siste lagring uten en tur via foreldrens node-state.
  const [savedText, setSavedText] = useState(content.text)

  const save = () => {
    setEditing(false)
    if (draft !== savedText) {
      setSavedText(draft)
      markLocalOp(id)
      updateCardContent(id, { text: draft })
    }
  }

  const lines = (editing ? draft : savedText || 'Dobbeltklikk for å skrive …').split('\n')

  return (
    <CardShell selected={!!selected}>
      {editing ? (
        <textarea
          autoFocus
          className="nodrag"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          rows={Math.max(4, draft.split('\n').length)}
          style={{ width: '100%', background: P.surface2, color: P.text, border: `1px solid ${P.border}`, borderRadius: 6, padding: 8, fontSize: '0.82rem', fontFamily: 'var(--font-dm-sans)', resize: 'vertical', outline: 'none' }}
        />
      ) : (
        <div
          onDoubleClick={() => { if (!readOnly) { setDraft(savedText); setEditing(true) } }}
          style={{ fontSize: '0.82rem', lineHeight: 1.55, color: savedText ? P.text : P.text2, minHeight: 20, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {lines.map((line, i) => {
            if (line.startsWith('# ')) return <div key={i} style={{ fontSize: '1rem', fontWeight: 700, margin: '2px 0 4px' }}>{renderInline(line.slice(2), i)}</div>
            if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 14, position: 'relative' }}><span style={{ position: 'absolute', left: 2 }}>•</span>{renderInline(line.slice(2), i)}</div>
            return <div key={i}>{line ? renderInline(line, i) : <br />}</div>
          })}
        </div>
      )}
    </CardShell>
  )
}
