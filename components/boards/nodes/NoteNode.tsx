'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react'
import type { NoteContent } from '@/lib/types'
import { updateCardContent, saveCardPositions } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

// Renderer: støtter **fet**, *kursiv*, # overskrift og - punktliste
function renderInline(text: string, key: number) {
  // Bold (\*\*) must come before italic (\*) to avoid partial match
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return (
    <span key={key}>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
        if (p.startsWith('*') && p.endsWith('*')) return <em key={i}>{p.slice(1, -1)}</em>
        return <span key={i}>{p}</span>
      })}
    </span>
  )
}

type FormatAction = 'bold' | 'italic' | 'list'

export default function NoteNode({ id, data, selected }: NodeProps<CardNode>) {
  const rf = useReactFlow()
  const { palette: P, readOnly, markLocalOp, recordContentEdit } = useBoardUi()
  const content = data.card.content as NoteContent
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Autovoks etter innhold i stedet for radtelling, som ikke fanger opp
  // tekst som brytes over flere visuelle linjer uten linjeskift.
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!editing || !el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editing, draft])

  const save = () => {
    setEditing(false)
    if (draft !== content.text) {
      markLocalOp(id)
      recordContentEdit(id, content, { text: draft })
      // Oppdater node-data immutabelt så visningen reflekterer lagringen umiddelbart,
      // samtidig som eksterne oppdateringer (realtime, Task 12) fortsatt slår gjennom.
      rf.updateNodeData(id, { card: { ...data.card, content: { text: draft } } })
      updateCardContent(id, { text: draft })
    }
  }

  // Setter inn formatering på markert tekst i textarea-en.
  // onMouseDown + e.preventDefault() hindrer at textarea mister fokus ved klikk på knapp.
  const applyFormat = (format: FormatAction) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const before = draft.slice(0, start)
    const selection = draft.slice(start, end)
    const after = draft.slice(end)

    let newText: string
    let newStart: number
    let newEnd: number

    if (format === 'bold') {
      newText = `${before}**${selection}**${after}`
      newStart = start + 2
      newEnd = end + 2
    } else if (format === 'italic') {
      newText = `${before}*${selection}*${after}`
      newStart = start + 1
      newEnd = end + 1
    } else {
      // list: add "- " to each selected line
      const lines = selection.split('\n')
      const formatted = lines.map(l => (l.startsWith('- ') ? l : `- ${l}`)).join('\n')
      newText = `${before}${formatted}${after}`
      newStart = start
      newEnd = start + formatted.length
    }

    setDraft(newText)
    // Restore selection after React re-render
    setTimeout(() => {
      el.setSelectionRange(newStart, newEnd)
      el.focus()
    }, 0)
  }

  const lines = (editing ? draft : content.text || 'Dobbeltklikk for å skrive …').split('\n')

  return (
    <>
      {!readOnly && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={160}
          minHeight={60}
          keepAspectRatio={false}
          onResizeEnd={(_e, params) => {
            markLocalOp(id)
            saveCardPositions([{ id, x: params.x, y: params.y, width: params.width }])
          }}
        />
      )}
      <CardShell cardId={id} selected={!!selected}>
        {editing ? (
          <>
            {/* Formateringsverktøylinje — vises kun under redigering */}
            <div
              className="nodrag"
              style={{ display: 'flex', gap: 2, marginBottom: 5 }}
            >
              {([
                { format: 'bold' as FormatAction, label: 'B', title: 'Fet (** tekst **)', style: { fontWeight: 700 as const } },
                { format: 'italic' as FormatAction, label: 'I', title: 'Kursiv (* tekst *)', style: { fontStyle: 'italic' as const } },
                { format: 'list' as FormatAction, label: '•', title: 'Punktliste (- tekst)', style: {} },
              ] as const).map(btn => (
                <button
                  key={btn.format}
                  type="button"
                  title={btn.title}
                  onMouseDown={e => { e.preventDefault(); applyFormat(btn.format) }}
                  style={{
                    width: 24, height: 24, borderRadius: 4, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', color: P.text2,
                    border: `1px solid ${P.border}`,
                    fontSize: '0.76rem', fontFamily: 'var(--font-dm-sans)',
                    ...btn.style,
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              autoFocus
              className="nodrag"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={save}
              rows={4}
              style={{ width: '100%', background: P.surface2, color: P.text, border: `1px solid ${P.border}`, borderRadius: 6, padding: 8, fontSize: '0.82rem', fontFamily: 'var(--font-dm-sans)', resize: 'none', outline: 'none', overflow: 'hidden' }}
            />
          </>
        ) : (
          <div
            onDoubleClick={() => { if (!readOnly) { setDraft(content.text); setEditing(true) } }}
            style={{ fontSize: '0.82rem', lineHeight: 1.55, color: content.text ? P.text : P.text2, minHeight: 20, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {lines.map((line, i) => {
              if (line.startsWith('# ')) return <div key={i} style={{ fontSize: '1rem', fontWeight: 700, margin: '2px 0 4px' }}>{renderInline(line.slice(2), i)}</div>
              if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 14, position: 'relative' }}><span style={{ position: 'absolute', left: 2 }}>•</span>{renderInline(line.slice(2), i)}</div>
              return <div key={i}>{line ? renderInline(line, i) : <br />}</div>
            })}
          </div>
        )}
      </CardShell>
    </>
  )
}
