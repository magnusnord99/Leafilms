'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReactFlow, type NodeProps } from '@xyflow/react'
import type { ColumnContent } from '@/lib/types'
import { updateCardContent } from '@/lib/actions/boards'
import { AVATAR_COLORS } from '@/lib/avatar-colors'
import { useBoardUi } from '../boardContext'
import type { CardNode } from '../toFlow'

const STRIP_HEIGHT = 6
const MENU_WIDTH = 172

export default function ColumnNode({ id, data, selected }: NodeProps<CardNode>) {
  const rf = useReactFlow()
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const content = data.card.content as ColumnContent
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content.title)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const swatchRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (swatchRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const save = () => {
    setEditing(false)
    const t = draft.trim() || 'Kolonne'
    if (t !== content.title) {
      markLocalOp(id)
      // Oppdater node-data immutabelt så visningen reflekterer lagringen umiddelbart,
      // samtidig som eksterne oppdateringer (realtime, Task 12) fortsatt slår gjennom.
      rf.updateNodeData(id, { card: { ...data.card, content: { ...content, title: t } } })
      updateCardContent(id, { ...content, title: t })
    }
  }

  const applyContent = (next: ColumnContent) => {
    markLocalOp(id)
    rf.updateNodeData(id, { card: { ...data.card, content: next } })
    updateCardContent(id, next)
  }

  const pickColor = (hex: string) => {
    if (hex === content.color) return
    // Første gang en farge settes: standard til stripe (Milanote-stil) slik at
    // valget faktisk gir et synlig resultat med én gang.
    const firstTime = !content.color
    applyContent({ ...content, color: hex, colorStrip: firstTime ? true : content.colorStrip })
  }

  const toggleFill = () => applyContent({ ...content, colorFill: !content.colorFill })
  const toggleStrip = () => applyContent({ ...content, colorStrip: !content.colorStrip })
  const clearColor = () => {
    applyContent({ title: content.title })
    setMenuOpen(false)
  }

  const toggleMenu = () => {
    if (menuOpen) { setMenuOpen(false); return }
    const rect = swatchRef.current?.getBoundingClientRect()
    if (rect) setMenuPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - MENU_WIDTH) })
    setMenuOpen(true)
  }

  const stripColor = content.colorStrip ? content.color : undefined
  const fillColor = content.colorFill ? content.color : undefined

  const titleStyle: React.CSSProperties = {
    width: '100%', background: 'transparent', border: 'none', outline: 'none',
    color: P.text, fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.04em',
    textTransform: 'uppercase', padding: `${12 + (stripColor ? STRIP_HEIGHT : 0)}px 12px 4px`, textAlign: 'center',
  }

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%', minHeight: 140,
      background: fillColor ? `${fillColor}1c` : `${P.surface}99`,
      border: `1px ${selected ? 'solid' : 'dashed'} ${selected ? P.accent : P.border}`,
      borderRadius: 10, fontFamily: 'var(--font-dm-sans)',
    }}>
      {stripColor && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: STRIP_HEIGHT, background: stripColor, borderRadius: '9px 9px 0 0' }} />
      )}

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

      {!readOnly && (
        <button
          ref={swatchRef}
          className="nodrag"
          onClick={toggleMenu}
          title="Farge på kolonne"
          style={{
            position: 'absolute', top: STRIP_HEIGHT + 6, right: 6, zIndex: 1,
            width: 16, height: 16, borderRadius: '50%', cursor: 'pointer', padding: 0,
            background: content.color ?? 'transparent',
            border: `1.5px ${content.color ? 'solid' : 'dashed'} ${content.color ?? P.text2}`,
          }}
        />
      )}

      {menuOpen && menuPos && createPortal(
        <div
          ref={menuRef}
          className="nodrag"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: menuPos.top, left: menuPos.left, zIndex: 1000,
            background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)', padding: 10, width: MENU_WIDTH,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 10 }}>
            {AVATAR_COLORS.map(hex => (
              <button
                key={hex}
                onClick={() => pickColor(hex)}
                title={hex}
                style={{
                  width: 22, height: 22, borderRadius: '50%', cursor: 'pointer', padding: 0,
                  background: hex,
                  border: hex === content.color ? `2px solid ${P.text}` : '2px solid transparent',
                  boxShadow: hex === content.color ? `0 0 0 1px ${P.surface2}` : 'none',
                }}
              />
            ))}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: P.text, cursor: 'pointer', padding: '3px 0' }}>
            <input type="checkbox" checked={!!content.colorFill} onChange={toggleFill} disabled={!content.color} style={{ accentColor: P.accent, cursor: 'pointer' }} />
            Bakgrunn
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: P.text, cursor: 'pointer', padding: '3px 0' }}>
            <input type="checkbox" checked={!!content.colorStrip} onChange={toggleStrip} disabled={!content.color} style={{ accentColor: P.accent, cursor: 'pointer' }} />
            Topp-stripe
          </label>

          {content.color && (
            <button
              onClick={clearColor}
              style={{ width: '100%', marginTop: 6, padding: '5px 0', background: 'none', border: `1px solid ${P.border}`, borderRadius: 5, color: P.text2, fontSize: '0.68rem', cursor: 'pointer' }}
            >
              Fjern farge
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
