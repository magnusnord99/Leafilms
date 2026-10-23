'use client'

import { useEffect, useState } from 'react'
import { getCalendarEvents } from '@/lib/actions/calendar'
import { getMeetingsForCalendar } from '@/lib/actions/meetings'
import { C } from '@/lib/admin-theme'
import { WidgetHeader, Btn, dateKey, WEEKDAY_LABELS, MONTH_LABELS } from '../shared'

export default function CalendarWidget() {
  const [loading, setLoading] = useState(true)
  const [calendarDates, setCalendarDates] = useState<Set<string>>(new Set())

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    try {
      const [calendarResult, meetings] = await Promise.all([
        getCalendarEvents(),
        getMeetingsForCalendar(null),
      ])
      const eventDates = new Set<string>()
      for (const s of calendarResult.shootings) {
        const start = new Date(`${s.shootStart}T00:00:00`)
        const end = s.shootEnd ? new Date(`${s.shootEnd}T00:00:00`) : start
        for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          eventDates.add(dateKey(d))
        }
      }
      for (const t of calendarResult.tasks) eventDates.add(t.dueDate)
      for (const m of meetings) eventDates.add(m.startsAt.split('T')[0])
      setCalendarDates(eventDates)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return null

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startWeekday = (new Date(year, month, 1).getDay() + 6) % 7
  const todayKey = dateKey(now)
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div>
      <WidgetHeader title="Kalender" action={<Btn href="/admin/calendar" variant="ghost">Åpne kalender →</Btn>} />
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 20px', maxWidth: 340 }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, color: C.text2, marginBottom: 10 }}>
          {MONTH_LABELS[month]} {year}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {WEEKDAY_LABELS.map((w) => (
            <div key={w} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, textAlign: 'center', paddingBottom: 4 }}>
              {w[0]}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />
            const key = dateKey(new Date(year, month, day))
            const hasEvent = calendarDates.has(key)
            const isToday = key === todayKey
            return (
              <div
                key={key}
                title={hasEvent ? 'Opptak eller frist denne dagen' : undefined}
                style={{
                  aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 6, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem',
                  color: isToday ? '#fff' : C.text2, background: isToday ? C.accent : 'transparent',
                  fontWeight: isToday ? 600 : 400,
                }}
              >
                {day}
                <span style={{ width: 4, height: 4, borderRadius: '50%', marginTop: 1, background: hasEvent ? (isToday ? '#fff' : C.accent) : 'transparent' }} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
