'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useReactFlow, type NodeProps } from '@xyflow/react'
import type { BoardScheduleContent, BoardScheduleItem } from '@/lib/types'
import { updateCardContent } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import { ClockIcon } from '../icons'
import type { CardNode } from '../toFlow'

const sortByTime = (items: BoardScheduleItem[]) => [...items].sort((a, b) => a.time.localeCompare(b.time))

const mapsUrl = (item: BoardScheduleItem): string | null => {
  if (item.locationLink) return item.locationLink
  if (item.location) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`
  return null
}

export default function ScheduleNode({ id, data, selected }: NodeProps<CardNode>) {
  const rf = useReactFlow()
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const content = data.card.content as BoardScheduleContent
  const items = sortByTime(content.items)

  const [open, setOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(content.title ?? '')
  const [newTime, setNewTime] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const persist = (nextItems: BoardScheduleItem[], nextTitle?: string) => {
    const finalTitle = nextTitle !== undefined ? nextTitle : content.title
    const next: BoardScheduleContent = { title: finalTitle || undefined, items: nextItems }
    markLocalOp(id)
    rf.updateNodeData(id, { card: { ...data.card, content: next } })
    updateCardContent(id, next)
  }

  const updateItem = (itemId: string, patch: Partial<BoardScheduleItem>) => {
    persist(content.items.map(i => i.id === itemId ? { ...i, ...patch } : i))
  }

  const saveTitle = () => {
    setEditingTitle(false)
    if (titleDraft !== (content.title ?? '')) persist(content.items, titleDraft)
  }

  const addItem = () => {
    if (!newTime || !newLabel.trim()) return
    persist([...content.items, { id: crypto.randomUUID(), time: newTime, label: newLabel.trim() }])
    setNewTime('')
    setNewLabel('')
  }

  // Escape lukker modalen — samme mønster som bilde-lightboxen (ImageNode).
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <CardShell selected={!!selected}>
        <div onDoubleClick={() => setOpen(true)} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: P.accent + '22', border: `1px solid ${P.accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.accent, flexShrink: 0 }}>
              <ClockIcon size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: P.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {content.title || 'Timeplan'}
              </div>
              <div style={{ fontSize: '0.68rem', color: P.text2 }}>
                {items.length > 0 ? `${items.length} programpunkter` : 'Ingen punkter ennå'} · dobbeltklikk for å åpne
              </div>
            </div>
          </div>
          {items.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {items.slice(0, 4).map(item => (
                <div key={item.id} style={{ display: 'flex', gap: 8, fontSize: '0.74rem', color: P.text2 }}>
                  <span style={{ fontWeight: 600, color: P.text, flexShrink: 0 }}>{item.time}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.label}{item.location ? ` · ${item.location}` : ''}
                  </span>
                </div>
              ))}
              {items.length > 4 && (
                <div style={{ fontSize: '0.7rem', color: P.text2 }}>+ {items.length - 4} til</div>
              )}
            </div>
          )}
        </div>
      </CardShell>

      {open && createPortal(
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div
            className="nodrag"
            onClick={e => e.stopPropagation()}
            style={{ width: 480, maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto', background: P.surface, border: `1px solid ${P.border}`, borderRadius: 12, padding: 20, fontFamily: 'var(--font-dm-sans)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 }}>
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={e => e.key === 'Enter' && saveTitle()}
                  placeholder="Timeplan"
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '1.05rem', fontWeight: 700 }}
                />
              ) : (
                <h3
                  onDoubleClick={() => { if (!readOnly) { setTitleDraft(content.title ?? ''); setEditingTitle(true) } }}
                  style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: P.text, cursor: readOnly ? 'default' : 'pointer' }}
                >
                  {content.title || 'Timeplan'}
                </h3>
              )}
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: P.text2, cursor: 'pointer', fontSize: '1rem', flexShrink: 0 }}>✕</button>
            </div>

            {items.length === 0 && (
              <p style={{ fontSize: '0.8rem', color: P.text2, fontStyle: 'italic', margin: '0 0 12px' }}>Ingen programpunkter ennå.</p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(item => {
                const link = mapsUrl(item)
                return (
                  <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 8px', background: P.surface2, borderRadius: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="time"
                        value={item.time}
                        disabled={readOnly}
                        onChange={e => updateItem(item.id, { time: e.target.value })}
                        style={{ background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '0.8rem', fontWeight: 600, width: 84, flexShrink: 0 }}
                      />
                      <input
                        value={item.label}
                        readOnly={readOnly}
                        onChange={e => updateItem(item.id, { label: e.target.value })}
                        placeholder="Programpunkt"
                        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '0.8rem' }}
                      />
                      {!readOnly && (
                        <button
                          onClick={() => persist(content.items.filter(i => i.id !== item.id))}
                          style={{ background: 'none', border: 'none', color: P.text2, cursor: 'pointer', fontSize: '0.75rem', flexShrink: 0 }}
                        >✕</button>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        value={item.location ?? ''}
                        readOnly={readOnly}
                        onChange={e => updateItem(item.id, { location: e.target.value || undefined })}
                        placeholder="Lokasjon"
                        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: P.text2, fontSize: '0.72rem' }}
                      />
                      {!readOnly && (
                        <input
                          value={item.locationLink ?? ''}
                          onChange={e => updateItem(item.id, { locationLink: e.target.value || undefined })}
                          placeholder="Maps-lenke (valgfritt)"
                          style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: P.text2, fontSize: '0.68rem' }}
                        />
                      )}
                      {link && (
                        <a
                          href={link} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ color: P.accent, fontSize: '0.7rem', textDecoration: 'none', flexShrink: 0 }}
                        >📍 Maps</a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {!readOnly && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${P.border}` }}>
                <input
                  type="time"
                  value={newTime}
                  onChange={e => setNewTime(e.target.value)}
                  style={{ background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 5, padding: '5px 8px', color: P.text, fontSize: '0.78rem', outline: 'none', width: 100, flexShrink: 0 }}
                />
                <input
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addItem()}
                  placeholder="+ Legg til programpunkt"
                  style={{ flex: 1, minWidth: 0, background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 5, padding: '5px 8px', color: P.text, fontSize: '0.78rem', outline: 'none' }}
                />
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
