'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ScheduleCardPageData } from '@/lib/actions/boards'
import { updateCardContent } from '@/lib/actions/boards'
import type { BoardScheduleContent, BoardScheduleItem, ResolvedSchedulePerson, SchedulePersonRef } from '@/lib/types'
import { BoardUiProvider, ADMIN_BOARD_PALETTE, useBoardUi, type BoardPalette } from '@/components/boards/boardContext'
import { useResolvedPeople, refKey } from './useResolvedPeople'
import PersonChip from './PersonChip'
import PersonPicker from './PersonPicker'

const sortByTime = (items: BoardScheduleItem[]) => [...items].sort((a, b) => a.time.localeCompare(b.time))

const mapsUrl = (item: BoardScheduleItem): string | null => {
  if (item.locationLink) return item.locationLink
  if (item.location) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`
  return null
}

type Props = {
  initial: ScheduleCardPageData
  readOnly?: boolean
  backHref: string
  palette?: BoardPalette
}

export default function ScheduleCardPage({ initial, readOnly = false, backHref, palette = ADMIN_BOARD_PALETTE }: Props) {
  return (
    <BoardUiProvider value={{ palette, readOnly, markLocalOp: () => {}, onCardResize: () => {}, recordContentEdit: () => {} }}>
      <ScheduleCardPageContent initial={initial} readOnly={readOnly} backHref={backHref} />
    </BoardUiProvider>
  )
}

function ScheduleCardPageContent({ initial, readOnly, backHref }: { initial: ScheduleCardPageData; readOnly: boolean; backHref: string }) {
  const { palette: P } = useBoardUi()
  const [content, setContent] = useState(initial.card.content as BoardScheduleContent)
  const [titleDraft, setTitleDraft] = useState(content.title ?? '')
  const [newTime, setNewTime] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [openPickerFor, setOpenPickerFor] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const items = sortByTime(content.items)
  const allPeopleRefs = items.flatMap(i => i.people ?? [])
  const { directory, upsert } = useResolvedPeople(allPeopleRefs)

  const persist = (nextItems: BoardScheduleItem[], nextTitle?: string) => {
    if (readOnly) return
    const finalTitle = nextTitle !== undefined ? nextTitle : content.title
    const next: BoardScheduleContent = { title: finalTitle || undefined, items: nextItems }
    setContent(next)
    updateCardContent(initial.card.id, next)
  }

  const updateItem = (itemId: string, patch: Partial<BoardScheduleItem>) => {
    persist(content.items.map(i => i.id === itemId ? { ...i, ...patch } : i))
  }

  const addPersonToItem = (itemId: string, ref: SchedulePersonRef, resolved: ResolvedSchedulePerson) => {
    const item = content.items.find(i => i.id === itemId)
    if (!item) return
    const alreadyAdded = (item.people ?? []).some(p => p.type === ref.type && p.id === ref.id)
    if (!alreadyAdded) {
      updateItem(itemId, { people: [...(item.people ?? []), ref] })
    }
    upsert(resolved)
    setOpenPickerFor(null)
  }

  const removePersonFromItem = (itemId: string, ref: SchedulePersonRef) => {
    const item = content.items.find(i => i.id === itemId)
    if (!item) return
    updateItem(itemId, { people: (item.people ?? []).filter(p => !(p.type === ref.type && p.id === ref.id)) })
  }

  const saveTitle = () => {
    if (titleDraft !== (content.title ?? '')) persist(content.items, titleDraft)
  }

  const addItem = () => {
    if (!newTime || !newLabel.trim()) return
    persist([...content.items, { id: crypto.randomUUID(), time: newTime, label: newLabel.trim() }])
    setNewTime('')
    setNewLabel('')
  }

  const downloadPdf = async () => {
    setDownloading(true)
    try {
      const response = await fetch('/api/generate-timeplan-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: initial.card.id }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Kunne ikke laste ned PDF')
      }
      const blob = await response.blob()
      const cd = response.headers.get('Content-Disposition') || ''
      const filename = cd.match(/filename="([^"]+)"/)?.[1] || 'timeplan.pdf'
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kunne ikke laste ned PDF')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: P.canvasBg, fontFamily: 'var(--font-dm-sans)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 28px', borderBottom: `1px solid ${P.border}` }}>
        <Link
          href={backHref}
          style={{ display: 'flex', flexDirection: 'column', gap: 1, textDecoration: 'none', flexShrink: 0 }}
        >
          <span style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase', color: P.accent }}>
            ← {initial.customerName}
          </span>
          <span style={{ color: P.text2, fontSize: '0.8rem' }}>{initial.projectTitle}</span>
        </Link>
        <span style={{ color: P.text2 }}>/</span>
        {readOnly ? (
          <span style={{ flex: 1, minWidth: 0, color: P.text, fontSize: '1.05rem', fontWeight: 700 }}>
            {content.title || 'Timeplan'}
          </span>
        ) : (
          <input
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            placeholder="Timeplan"
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '1.05rem', fontWeight: 700 }}
          />
        )}
        {!readOnly && (
          <button
            onClick={downloadPdf}
            disabled={downloading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: P.surface2, color: P.text, border: `1px solid ${P.border}`, borderRadius: 8,
              padding: '9px 16px', fontSize: '0.82rem', fontWeight: 600, cursor: downloading ? 'default' : 'pointer', flexShrink: 0,
            }}
          >
            ⬇ {downloading ? 'Genererer...' : 'Last ned PDF'}
          </button>
        )}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px' }}>
        {items.length === 0 && (
          <p style={{ fontSize: '0.85rem', color: P.text2, fontStyle: 'italic' }}>Ingen programpunkter ennå.</p>
        )}

        {items.length > 0 && (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                {(readOnly ? ['Tid', 'Programpunkt', 'Lokasjon', 'Folk'] : ['Tid', 'Programpunkt', 'Lokasjon', 'Folk', '']).map((h, i) => (
                  <th
                    key={i}
                    style={{ textAlign: 'left', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: P.text2, padding: '0 12px 10px', borderBottom: `1px solid ${P.border}` }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const link = mapsUrl(item)
                return (
                  <tr key={item.id} style={{ borderBottom: `1px solid ${P.border}` }}>
                    <td style={{ padding: '14px 12px', verticalAlign: 'top', width: 90 }}>
                      {readOnly ? (
                        <span style={{ color: P.text, fontSize: '0.92rem', fontWeight: 700 }}>{item.time}</span>
                      ) : (
                        <input
                          type="time"
                          value={item.time}
                          onChange={e => updateItem(item.id, { time: e.target.value })}
                          style={{ background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '0.92rem', fontWeight: 700, width: '100%' }}
                        />
                      )}
                    </td>
                    <td style={{ padding: '14px 12px', verticalAlign: 'top', minWidth: 220 }}>
                      {readOnly ? (
                        <span style={{ color: P.text, fontSize: '0.92rem' }}>{item.label}</span>
                      ) : (
                        <input
                          value={item.label}
                          onChange={e => updateItem(item.id, { label: e.target.value })}
                          placeholder="Programpunkt"
                          style={{ background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '0.92rem', width: '100%' }}
                        />
                      )}
                    </td>
                    <td style={{ padding: '14px 12px', verticalAlign: 'top', minWidth: 200 }}>
                      {readOnly ? (
                        <span style={{ display: 'block', color: P.text, fontSize: '0.85rem', marginBottom: 4 }}>{item.location}</span>
                      ) : (
                        <>
                          <input
                            value={item.location ?? ''}
                            onChange={e => updateItem(item.id, { location: e.target.value || undefined })}
                            placeholder="Lokasjon"
                            style={{ background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '0.85rem', width: '100%', marginBottom: 4 }}
                          />
                          <input
                            value={item.locationLink ?? ''}
                            onChange={e => updateItem(item.id, { locationLink: e.target.value || undefined })}
                            placeholder="Maps-lenke (valgfritt)"
                            style={{ background: 'transparent', border: 'none', outline: 'none', color: P.text2, fontSize: '0.72rem', width: '100%' }}
                          />
                        </>
                      )}
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: P.accent, fontSize: '0.75rem', textDecoration: 'none' }}>
                          📍 Åpne i Maps
                        </a>
                      )}
                    </td>
                    <td style={{ padding: '14px 12px', verticalAlign: 'top', minWidth: 220, position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {(item.people ?? []).map(ref => (
                          <PersonChip
                            key={refKey(ref)}
                            person={directory[refKey(ref)]}
                            readOnly={!!readOnly}
                            onRemove={() => removePersonFromItem(item.id, ref)}
                            onUpdated={upsert}
                          />
                        ))}
                        {!readOnly && (
                          <span
                            onClick={() => setOpenPickerFor(openPickerFor === item.id ? null : item.id)}
                            style={{ fontSize: '0.75rem', color: P.accent, cursor: 'pointer' }}
                          >+ person</span>
                        )}
                        {openPickerFor === item.id && (
                          <PersonPicker
                            onSelect={(ref, resolved) => addPersonToItem(item.id, ref, resolved)}
                            onClose={() => setOpenPickerFor(null)}
                          />
                        )}
                      </div>
                    </td>
                    {!readOnly && (
                      <td style={{ padding: '14px 12px', verticalAlign: 'top', width: 30 }}>
                        <button
                          onClick={() => persist(content.items.filter(i => i.id !== item.id))}
                          style={{ background: 'none', border: 'none', color: P.text2, cursor: 'pointer', fontSize: '0.85rem' }}
                        >✕</button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}

        {!readOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20, paddingTop: 20, borderTop: items.length > 0 ? `1px solid ${P.border}` : 'none' }}>
            <input
              type="time"
              value={newTime}
              onChange={e => setNewTime(e.target.value)}
              style={{ background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 6, padding: '8px 12px', color: P.text, fontSize: '0.85rem', outline: 'none', width: 120 }}
            />
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="+ Legg til programpunkt"
              style={{ flex: 1, background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 6, padding: '8px 12px', color: P.text, fontSize: '0.85rem', outline: 'none' }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
