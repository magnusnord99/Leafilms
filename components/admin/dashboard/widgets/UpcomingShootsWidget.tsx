'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getCalendarEvents, type ShootingEvent } from '@/lib/actions/calendar'
import { C } from '@/lib/admin-theme'
import { WidgetHeader, Btn } from '../shared'

function formatRange(start: string, end: string | null) {
  const startLabel = new Date(`${start}T00:00:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
  if (!end || end === start) return startLabel
  const endLabel = new Date(`${end}T00:00:00`).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })
  return `${startLabel} – ${endLabel}`
}

export default function UpcomingShootsWidget() {
  const [loading, setLoading] = useState(true)
  const [shootings, setShootings] = useState<ShootingEvent[]>([])

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      const { shootings: data } = await getCalendarEvents(null)
      setShootings(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return null

  const todayKey = new Date().toISOString().slice(0, 10)
  const upcoming = shootings
    .filter((s) => (s.shootEnd ?? s.shootStart) >= todayKey)
    .sort((a, b) => a.shootStart.localeCompare(b.shootStart))
    .slice(0, 6)

  return (
    <div>
      <WidgetHeader title="Kommende opptak" action={<Btn href="/admin/calendar" variant="ghost">Åpne kalender →</Btn>} />
      {upcoming.length === 0 ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '24px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>Ingen planlagte opptak</p>
        </div>
      ) : (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {upcoming.map((s, i) => (
            <Link key={s.projectId} href={`/admin/projects/${s.projectId}`} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '10px 14px', background: C.surface,
                  borderBottom: i < upcoming.length - 1 ? `1px solid ${C.border}` : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget as HTMLDivElement).style.background = C.surface2}
                onMouseLeave={(e) => (e.currentTarget as HTMLDivElement).style.background = C.surface}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.projectTitle}
                  </p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {s.customerName ?? 'Ukjent kunde'}{!s.confirmed && ' · Ikke bekreftet'}
                  </p>
                </div>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, flexShrink: 0 }}>
                  {formatRange(s.shootStart, s.shootEnd)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
