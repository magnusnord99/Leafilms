'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { updateProjectDeliverables } from '@/lib/actions/pipeline'
import type { DeliverableItem } from '@/lib/types'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
}

// En video kan leveres i flere formater samtidig (f.eks. reel til Instagram
// i 9:16 og samme klipp i 16:9 til YouTube) — lagres som kommaseparert
// tekst i DeliverableItem.format for bakoverkompatibilitet med andre steder
// som viser feltet som fritekst (tilbud, PDF, AI-import).
const VIDEO_FORMATS = ['4:5', '9:16', '16:9'] as const

function parseFormats(format?: string): string[] {
  return (format ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

function toggleFormat(current: string[], value: string): string[] {
  return current.includes(value) ? current.filter(f => f !== value) : [...current, value]
}

function durationLabel(item: DeliverableItem): string | null {
  if (item.durationValue == null) return null
  return `${item.durationValue} ${item.durationUnit ?? 'sek'}`
}

// Kort oppsummering for steder som vil vise "4 videoer, 20 bilder" uten å
// måtte åpne Leveranser-modalen — se DeliverablesButton/prosjektoversikten.
export function summarizeDeliverables(items: DeliverableItem[]): string | null {
  if (items.length === 0) return null
  const videoCount = items.filter(i => i.type === 'video').length
  const photoCount = items.filter(i => i.type === 'photo').reduce((sum, i) => sum + (i.quantity ?? 1), 0)
  const otherCount = items.filter(i => i.type === 'annet').reduce((sum, i) => sum + (i.quantity ?? 1), 0)
  const parts: string[] = []
  if (videoCount > 0) parts.push(`${videoCount} ${videoCount === 1 ? 'video' : 'videoer'}`)
  if (photoCount > 0) parts.push(`${photoCount} ${photoCount === 1 ? 'bilde' : 'bilder'}`)
  if (otherCount > 0) parts.push(`${otherCount} annet`)
  return parts.length > 0 ? parts.join(', ') : null
}

// Delt mellom postprod-brettet og prosjektoversikten — begge viser/redigerer
// samme projects.deliverables-data og skal derfor se identiske ut.
export function DeliverablesButton({
  projectId, items, onSaved, variant = 'block', readOnly = false,
}: {
  projectId: string
  items: DeliverableItem[]
  onSaved: (items: DeliverableItem[]) => void
  variant?: 'block' | 'toolbar'
  readOnly?: boolean
}) {
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DeliverableItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openModal() { setShowModal(true) }
  function closeModal() { setShowModal(false); setEditing(false) }
  function startEditing() {
    setDraft(items.map((it, i) => ({ ...it, id: it.id ?? String(i) })))
    setEditing(true)
    setError(null)
  }

  async function save() {
    setSaving(true)
    setError(null)
    const next: DeliverableItem[] = draft.map(it => ({
      id: it.id ?? String(Date.now()),
      type: it.type,
      name: it.name,
      quantity: it.type === 'video' ? undefined : it.quantity,
      format: it.format,
      description: it.description,
      durationValue: it.type === 'video' ? it.durationValue : undefined,
      durationUnit: it.type === 'video' && it.durationValue != null ? (it.durationUnit ?? 'sek') : undefined,
    }))
    const res = await updateProjectDeliverables(projectId, next)
    setSaving(false)
    if (!res.error) {
      onSaved(draft)
      setEditing(false)
    } else {
      setError(res.error)
    }
  }

  const buttonStyle = variant === 'toolbar'
    ? {
        marginLeft: 'auto' as const, marginRight: 12,
        fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 5,
        color: items.length > 0 ? C.text2 : C.text3,
        background: 'none', border: `1px solid ${C.border}`, padding: '3px 9px',
        borderRadius: 5, cursor: 'pointer', flexShrink: 0,
      }
    : {
        fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 6,
        color: items.length > 0 ? C.text2 : C.text3,
        background: 'none', border: `1px solid ${C.border}`, padding: '4px 10px',
        borderRadius: 6, cursor: 'pointer',
      }

  const trigger = (
    <button onClick={openModal} style={buttonStyle}>
      <svg width={variant === 'toolbar' ? 10 : 12} height={variant === 'toolbar' ? 10 : 12} viewBox="0 0 12 12" fill="none">
        <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
        <path d="M3.5 4.5h5M3.5 6h5M3.5 7.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
      Info om levering
      {items.length > 0 && (
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, display: 'inline-block', marginLeft: 2 }} />
      )}
    </button>
  )

  return (
    <>
      {variant === 'toolbar' ? trigger : (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          {trigger}
        </div>
      )}

      {/* Rendert via portal til document.body: en forelder med backdrop-filter
          (eller transform/filter) lager ellers en ny "containing block" for
          position:fixed-etterkommere, som klemmer modalen inn i forelderens
          egen boks i stedet for å dekke hele skjermen. */}
      {showModal && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
          onClick={e => { if (e.target === e.currentTarget && !editing) closeModal() }}
        >
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: 460, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Leveranser
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {!editing ? (
                  <button onClick={startEditing} disabled={readOnly} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500, color: C.accent, background: 'none', border: `1px solid ${C.accent}`, borderRadius: 5, padding: '3px 10px', cursor: readOnly ? 'not-allowed' : 'pointer', opacity: readOnly ? 0.5 : 1 }}>
                    Rediger
                  </button>
                ) : (
                  <>
                    <button onClick={() => { setEditing(false); setError(null) }} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}>
                      Avbryt
                    </button>
                    <button onClick={save} disabled={saving || readOnly} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, color: '#fff', background: C.accent, border: 'none', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                      {saving ? 'Lagrer...' : 'Lagre'}
                    </button>
                  </>
                )}
                <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1.1rem', lineHeight: 1, padding: '2px 6px' }}>×</button>
              </div>
            </div>

            {error && (
              <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: '#f0b0b0', background: '#3a1d1d', border: '1px solid #E05555', borderRadius: 6, padding: '6px 10px', marginBottom: 12, flexShrink: 0 }}>
                Kunne ikke lagre: {error}
              </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {draft.map((item, i) => (
                    <div key={item.id ?? i} style={{ background: C.surface2, borderRadius: 8, padding: '12px 14px', position: 'relative' }}>
                      <button
                        onClick={() => {
                          if (!confirm(`Slette leveransen${item.name ? ` «${item.name}»` : ''}? Dette kan ikke angres.`)) return
                          setDraft(prev => prev.filter((_, idx) => idx !== i))
                        }}
                        style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1rem', lineHeight: 1, padding: '2px 5px' }}
                        title="Fjern"
                      >×</button>
                      <div style={{ display: 'grid', gridTemplateColumns: item.type === 'video' ? '90px 1fr' : '90px 1fr 56px 80px', gap: 8, marginBottom: 8 }}>
                        <select
                          value={item.type}
                          onChange={e => setDraft(prev => prev.map((it, idx) => idx === i ? { ...it, type: e.target.value as DeliverableItem['type'] } : it))}
                          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 6px', color: C.text, outline: 'none' }}
                        >
                          <option value="video">Video</option>
                          <option value="photo">Foto</option>
                          <option value="annet">Annet</option>
                        </select>
                        <input
                          value={item.name ?? ''}
                          onChange={e => setDraft(prev => prev.map((it, idx) => idx === i ? { ...it, name: e.target.value } : it))}
                          placeholder="Navn"
                          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none' }}
                        />
                        {item.type !== 'video' && (
                          <input
                            type="number"
                            min={1}
                            value={item.quantity ?? ''}
                            onChange={e => setDraft(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: parseInt(e.target.value, 10) || undefined } : it))}
                            placeholder="Ant."
                            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none', textAlign: 'center' }}
                          />
                        )}
                        {item.type !== 'video' && (
                          <input
                            value={item.format ?? ''}
                            onChange={e => setDraft(prev => prev.map((it, idx) => idx === i ? { ...it, format: e.target.value } : it))}
                            placeholder="Format"
                            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none' }}
                          />
                        )}
                      </div>
                      {item.type === 'video' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.66rem', color: C.text3, marginRight: 2 }}>Format:</span>
                          {VIDEO_FORMATS.map(f => {
                            const selected = parseFormats(item.format).includes(f)
                            return (
                              <button
                                key={f}
                                type="button"
                                onClick={() => setDraft(prev => prev.map((it, idx) => idx === i ? { ...it, format: toggleFormat(parseFormats(it.format), f).join(', ') } : it))}
                                style={{
                                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500,
                                  padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                                  border: `1px solid ${selected ? C.accent : C.border}`,
                                  background: selected ? C.accent : 'transparent',
                                  color: selected ? '#fff' : C.text2,
                                }}
                              >
                                {f}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {item.type === 'video' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.66rem', color: C.text3, marginRight: 2 }}>Lengde:</span>
                          <input
                            type="number"
                            min={0}
                            value={item.durationValue ?? ''}
                            onChange={e => setDraft(prev => prev.map((it, idx) => idx === i ? { ...it, durationValue: e.target.value === '' ? undefined : parseInt(e.target.value, 10) } : it))}
                            placeholder="0"
                            style={{ width: 56, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none', textAlign: 'center' }}
                          />
                          <div style={{ display: 'flex', gap: 4 }}>
                            {(['sek', 'min'] as const).map(u => {
                              const selected = (item.durationUnit ?? 'sek') === u
                              return (
                                <button
                                  key={u}
                                  type="button"
                                  onClick={() => setDraft(prev => prev.map((it, idx) => idx === i ? { ...it, durationUnit: u } : it))}
                                  style={{
                                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500,
                                    padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                                    border: `1px solid ${selected ? C.accent : C.border}`,
                                    background: selected ? C.accent : 'transparent',
                                    color: selected ? '#fff' : C.text2,
                                  }}
                                >
                                  {u}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      <textarea
                        value={item.description ?? ''}
                        onChange={e => setDraft(prev => prev.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))}
                        placeholder="Beskrivelse (valgfri)"
                        rows={2}
                        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', width: '100%', resize: 'vertical', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text3, outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button
                      onClick={() => setDraft(prev => [...prev, { id: String(Date.now()), type: 'annet', name: '', quantity: 1, format: '', description: '' }])}
                      style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.accent, background: 'none', border: `1px dashed ${C.accent}`, borderRadius: 6, padding: '8px', cursor: 'pointer' }}
                    >
                      + Legg til leveranse
                    </button>
                    <button
                      onClick={() => {
                        const count = parseInt(prompt('Hvor mange videoer?') ?? '', 10)
                        if (!count || count < 1) return
                        const existingVideoCount = draft.filter(d => d.type === 'video').length
                        const newRows: DeliverableItem[] = Array.from({ length: count }, (_, idx) => ({
                          id: `${Date.now()}-${idx}`, type: 'video', name: `Reel ${existingVideoCount + idx + 1}`,
                        }))
                        setDraft(prev => [...prev, ...newRows])
                      }}
                      style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.accent, background: 'none', border: `1px dashed ${C.accent}`, borderRadius: 6, padding: '8px', cursor: 'pointer' }}
                    >
                      + Legg til flere videoer
                    </button>
                  </div>
                </div>
              ) : items.length === 0 ? (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>
                  Ingen leveranser er lagt til ennå. Trykk «Rediger» for å legge til.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {items.map((item, i) => {
                    const qty = item.type === 'video' ? null : (item.quantity ?? null)
                    const duration = durationLabel(item)
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        {qty != null && (
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 700, color: C.accent, minWidth: 24, textAlign: 'right', flexShrink: 0, paddingTop: 1 }}>
                            {qty}
                          </span>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text, display: 'block', wordBreak: 'break-word' }}>
                            {item.name || '—'}
                          </span>
                          {item.description && (
                            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, display: 'block', marginTop: 2, lineHeight: 1.45, wordBreak: 'break-word' }}>
                              {item.description}
                            </span>
                          )}
                        </div>
                        {(item.format || duration) && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0, marginTop: 2 }}>
                            {item.format && (
                              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, background: C.surface2, padding: '2px 6px', borderRadius: 4 }}>
                                {item.format}
                              </span>
                            )}
                            {duration && (
                              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, background: C.surface2, padding: '2px 6px', borderRadius: 4 }}>
                                {duration}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
