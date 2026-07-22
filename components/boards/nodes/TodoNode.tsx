'use client'

import { useState } from 'react'
import { useReactFlow, type NodeProps } from '@xyflow/react'
import type { TodoContent, TodoItem } from '@/lib/types'
import { updateCardContent } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function TodoNode({ id, data, selected }: NodeProps<CardNode>) {
  const rf = useReactFlow()
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const content = data.card.content as TodoContent
  const [newText, setNewText] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(content.title ?? '')

  const persist = (nextItems: TodoItem[], nextTitle?: string) => {
    const finalTitle = nextTitle !== undefined ? nextTitle : content.title
    const newContent: TodoContent = { title: finalTitle || undefined, items: nextItems }
    markLocalOp(id)
    // Oppdater node-data immutabelt så visningen reflekterer lagringen umiddelbart,
    // samtidig som eksterne oppdateringer (realtime, Task 12) fortsatt slår gjennom.
    rf.updateNodeData(id, { card: { ...data.card, content: newContent } })
    updateCardContent(id, newContent)
  }

  const saveTitle = () => {
    setEditingTitle(false)
    if (titleDraft !== (content.title ?? '')) {
      persist(content.items, titleDraft)
    }
  }

  return (
    <CardShell cardId={id} selected={!!selected}>
      {editingTitle ? (
        <input
          autoFocus
          className="nodrag"
          value={titleDraft}
          onChange={e => setTitleDraft(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={e => e.key === 'Enter' && saveTitle()}
          placeholder="To-do"
          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '0.82rem', fontWeight: 700, marginBottom: 6 }}
        />
      ) : (
        <input
          className="nodrag"
          value={content.title ?? ''}
          readOnly={readOnly}
          placeholder="To-do"
          onDoubleClick={() => { if (!readOnly) { setTitleDraft(content.title ?? ''); setEditingTitle(true) } }}
          onChange={() => {}} // Readonly unless in edit mode
          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '0.82rem', fontWeight: 700, marginBottom: 6, cursor: readOnly ? 'default' : 'pointer' }}
        />
      )}
      {content.items.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0' }}>
          <input
            type="checkbox"
            className="nodrag"
            checked={item.checked}
            disabled={readOnly}
            onChange={() => persist(content.items.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))}
            style={{ accentColor: P.accent, cursor: 'pointer' }}
          />
          <span style={{ flex: 1, fontSize: '0.78rem', color: item.checked ? P.text2 : P.text, textDecoration: item.checked ? 'line-through' : 'none' }}>
            {item.text}
          </span>
          {!readOnly && (
            <button
              className="nodrag"
              onClick={() => persist(content.items.filter(i => i.id !== item.id))}
              style={{ background: 'none', border: 'none', color: P.text2, cursor: 'pointer', fontSize: '0.7rem' }}
            >✕</button>
          )}
        </div>
      ))}
      {!readOnly && (
        <input
          className="nodrag"
          value={newText}
          placeholder="+ Legg til punkt"
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newText.trim()) {
              persist([...content.items, { id: crypto.randomUUID(), text: newText.trim(), checked: false }])
              setNewText('')
            }
          }}
          style={{ width: '100%', marginTop: 6, background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 5, padding: '5px 8px', color: P.text, fontSize: '0.75rem', outline: 'none' }}
        />
      )}
    </CardShell>
  )
}
