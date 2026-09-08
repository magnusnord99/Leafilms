'use client'

import { useEffect, useRef, useState } from 'react'
import { C } from '@/lib/admin-theme'

const MONTHS = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
]
const WEEKDAYS = ['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø']

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return ''
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`
}

/**
 * Egen kalender-popover for datovalg, i stedet for nettleserens native
 * <input type="date"> (feedback c5c586fa) — samme visuelle stil som resten
 * av admin (lib/admin-theme). Verdi/onChange bruker ISO-dato (yyyy-mm-dd),
 * så komponenten er drop-in-kompatibel med felter som før brukte <input type="date">.
 */
export function DatePicker({
  value, onChange, placeholder = 'Velg dato',
}: {
  value: string
  onChange: (isoDate: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => {
    const d = value ? new Date(value) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function openPicker() {
    const d = value ? new Date(value) : new Date()
    setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1))
    setOpen(true)
  }

  const firstOfMonth = viewMonth
  const startWeekday = (firstOfMonth.getDay() + 6) % 7 // man=0
  const daysInMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), i + 1)),
  ]
  const todayISO = toISODate(new Date())

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={openPicker}
        style={{
          width: '100%', boxSizing: 'border-box', textAlign: 'left', cursor: 'pointer',
          padding: '9px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6,
          color: value ? C.text : C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', outline: 'none',
        }}
      >
        {value ? formatDisplay(value) : placeholder}
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 50, top: 'calc(100% + 6px)', left: 0,
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', width: 240,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              style={{ background: 'none', border: 'none', color: C.text2, cursor: 'pointer', fontSize: '0.85rem', padding: 4 }}
            >‹</button>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              style={{ background: 'none', border: 'none', color: C.text2, cursor: 'pointer', fontSize: '0.85rem', padding: 4 }}
            >›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {WEEKDAYS.map(w => (
              <div key={w} style={{ textAlign: 'center', fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, padding: '2px 0' }}>{w}</div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />
              const iso = toISODate(d)
              const isSelected = iso === value
              const isToday = iso === todayISO
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(iso); setOpen(false) }}
                  style={{
                    aspectRatio: '1', borderRadius: 5, cursor: 'pointer',
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
                    background: isSelected ? C.accent : 'transparent',
                    color: isSelected ? '#fff' : C.text,
                    border: isToday && !isSelected ? `1px solid ${C.accent}` : '1px solid transparent',
                  }}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          {value && (
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              style={{ marginTop: 8, width: '100%', background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 0', color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', cursor: 'pointer' }}
            >
              Fjern dato
            </button>
          )}
        </div>
      )}
    </div>
  )
}
