'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getCalendarEvents, ShootingEvent, TaskEvent } from '@/lib/actions/calendar'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.12)',
  success:  '#4CAF7D',
  warning:  '#F0A500',
  today:    'rgba(124,92,252,0.18)',
}

const DAYS_NO = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']
const MONTHS_NO = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember']

const STAGE_COLORS: Record<string, string> = {
  post_prod:    '#7C5CFC',
  produksjon:   '#F0A500',
  pre_prod:     '#4A9AC4',
  levering:     '#4CAF7D',
  kontrakt:     '#4CAF7D',
  tilbud_sendt: '#B4B4CC',
  møte:         '#B4B4CC',
  lead:         '#8484A0',
}

type CalEvent = {
  id: string
  date: string
  label: string
  sublabel: string | null
  href: string
  color: string
  bgColor: string
  confirmed: boolean
  type: 'shooting' | 'task'
  dashed?: boolean
}

function dateRange(start: string, end: string | null): string[] {
  const dates: string[] = []
  const s = new Date(start)
  const e = end ? new Date(end) : new Date(start)
  const cur = new Date(s)
  while (cur <= e) {
    dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}


export default function CalendarPage() {
  const [shootings, setShootings] = useState<ShootingEvent[]>([])
  const [tasks, setTasks] = useState<TaskEvent[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-indexed

  useEffect(() => {
    getCalendarEvents().then(({ shootings: s, tasks: t }) => {
      setShootings(s)
      setTasks(t)
      setLoading(false)
    })
  }, [])

  // Build event map: date string → CalEvent[]
  const eventMap = useMemo(() => {
    const map = new Map<string, CalEvent[]>()

    function add(date: string, ev: CalEvent) {
      if (!map.has(date)) map.set(date, [])
      map.get(date)!.push(ev)
    }

    // Shooting events — one entry per day in range
    for (const s of shootings) {
      const days = dateRange(s.shootStart, s.shootEnd)
      const color = s.confirmed ? C.success : '#6B7280'
      const bg = s.confirmed ? 'rgba(76,175,125,0.14)' : 'rgba(107,114,128,0.14)'
      const isFirst = (d: string) => d === days[0]

      for (const d of days) {
        add(d, {
          id: `shoot-${s.projectId}-${d}`,
          date: d,
          label: isFirst(d) ? (s.customerName ? `${s.customerName}` : s.projectTitle) : '↔',
          sublabel: isFirst(d) ? (s.customerName ? s.projectTitle : null) : null,
          href: `/admin/projects/${s.projectId}`,
          color,
          bgColor: bg,
          confirmed: s.confirmed,
          type: 'shooting',
          dashed: !s.confirmed,
        })
      }
    }

    // Task events
    for (const t of tasks) {
      const color = STAGE_COLORS[t.pipelineStage] ?? C.accent
      add(t.dueDate, {
        id: `task-${t.taskId}`,
        date: t.dueDate,
        label: t.taskTitle,
        sublabel: t.customerName ? `${t.customerName} · ${t.projectTitle}` : t.projectTitle,
        href: t.pipelineStage === 'post_prod'
          ? `/admin/postprod/${t.projectId}`
          : `/admin/projects/${t.projectId}`,
        color,
        bgColor: `${color}18`,
        confirmed: true,
        type: 'task',
        dashed: t.status === 'done',
      })
    }

    return map
  }, [shootings, tasks])

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  function goToday() {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1)
  // Monday-based: 0=Mon ... 6=Sun
  const startDow = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7

  const todayStr = today.toISOString().split('T')[0]

  // Legend
  const legend = [
    { color: C.success, bg: 'rgba(76,175,125,0.14)', label: 'Opptak — bekreftet', dashed: false },
    { color: '#6B7280', bg: 'rgba(107,114,128,0.14)', label: 'Opptak — ikke bekreftet', dashed: true },
    { color: '#7C5CFC', bg: 'rgba(124,92,252,0.14)', label: 'Post-prod oppgave', dashed: false },
    { color: '#F0A500', bg: 'rgba(240,165,0,0.14)', label: 'Produksjonsoppgave', dashed: false },
    { color: '#4A9AC4', bg: 'rgba(74,154,196,0.14)', label: 'Pre-prod oppgave', dashed: false },
  ]

  // Count stats
  const confirmedShootings = shootings.filter(s => s.confirmed).length
  const unconfirmedShootings = shootings.filter(s => !s.confirmed).length
  const postProdTasks = tasks.filter(t => t.pipelineStage === 'post_prod').length

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '28px 32px 48px', color: C.text }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, marginBottom: 3 }}>
              Kalender
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
              {confirmedShootings} bekreftede opptak · {unconfirmedShootings} ubekreftede · {postProdTasks} post-prod oppgaver
            </p>
          </div>

          {/* Month navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={goToday}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}
            >
              I dag
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
              <button onClick={prevMonth} style={{ padding: '7px 14px', background: 'none', border: 'none', color: C.text2, cursor: 'pointer', fontSize: '1rem' }}>‹</button>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: C.text, minWidth: 160, textAlign: 'center', padding: '0 4px' }}>
                {MONTHS_NO[viewMonth]} {viewYear}
              </span>
              <button onClick={nextMonth} style={{ padding: '7px 14px', background: 'none', border: 'none', color: C.text2, cursor: 'pointer', fontSize: '1rem' }}>›</button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          {legend.map(l => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 28, height: 14, borderRadius: 3,
                background: l.bg,
                border: l.dashed ? `1.5px dashed ${l.color}` : `1.5px solid ${l.color}`,
                flexShrink: 0,
              }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{l.label}</span>
            </div>
          ))}
        </div>

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 400 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster kalender...</p>
          </div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${C.border}` }}>
              {DAYS_NO.map(d => (
                <div key={d} style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
                    {d}
                  </span>
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {Array.from({ length: totalCells }, (_, i) => {
                const dayNum = i - startDow + 1
                const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth
                const dateStr = isCurrentMonth
                  ? `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
                  : null
                const isToday = dateStr === todayStr
                const events = dateStr ? (eventMap.get(dateStr) ?? []) : []
                const MAX_VISIBLE = 3
                const visible = events.slice(0, MAX_VISIBLE)
                const overflow = events.length - MAX_VISIBLE

                const isWeekend = (i % 7) >= 5

                return (
                  <div
                    key={i}
                    style={{
                      minHeight: 110,
                      padding: '6px 6px 8px',
                      borderRight: (i + 1) % 7 !== 0 ? `1px solid ${C.border}` : 'none',
                      borderBottom: i < totalCells - 7 ? `1px solid ${C.border}` : 'none',
                      background: isToday ? C.today : isWeekend && isCurrentMonth ? 'rgba(255,255,255,0.01)' : 'transparent',
                      position: 'relative',
                    }}
                  >
                    {/* Date number */}
                    {isCurrentMonth && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                        <span style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: isToday ? 700 : 400,
                          color: isToday ? C.accent : C.text3,
                          width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          borderRadius: '50%',
                          background: isToday ? C.accentBg : 'transparent',
                        }}>
                          {dayNum}
                        </span>
                      </div>
                    )}

                    {/* Events */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {visible.map(ev => (
                        <Link key={ev.id} href={ev.href} style={{ textDecoration: 'none' }}>
                          <div
                            title={`${ev.label}${ev.sublabel ? ` — ${ev.sublabel}` : ''}`}
                            style={{
                              background: ev.bgColor,
                              border: ev.dashed && ev.type === 'shooting'
                                ? `1px dashed ${ev.color}`
                                : `1px solid ${ev.color}30`,
                              borderRadius: 4,
                              padding: '2px 5px',
                              display: 'flex', alignItems: 'center', gap: 4,
                              cursor: 'pointer',
                              transition: 'opacity 0.1s',
                              opacity: ev.type === 'task' && ev.dashed ? 0.5 : 1,
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.75' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = ev.type === 'task' && ev.dashed ? '0.5' : '1' }}
                          >
                            {/* Type indicator */}
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: ev.color, flexShrink: 0 }} />
                            <span style={{
                              fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 500,
                              color: ev.color,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              maxWidth: '100%',
                            }}>
                              {ev.label}
                            </span>
                          </div>
                        </Link>
                      ))}
                      {overflow > 0 && (
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', color: C.text3, paddingLeft: 4 }}>
                          +{overflow} til
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
