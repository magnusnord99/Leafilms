'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { getCalendarEvents, ShootingEvent, TaskEvent } from '@/lib/actions/calendar'
import {
  getMeetingsForCalendar, getColleagues, createMeeting, cancelMeeting, updateMeeting,
  respondToMeetingInvite, MeetingEvent, Colleague,
} from '@/lib/actions/meetings'
import { useAuth } from '@/hooks/useAuth'

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
  danger:   '#E05555',
  meeting:  '#D4508C',
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
  href: string | null
  color: string
  bgColor: string
  confirmed: boolean
  type: 'shooting' | 'task' | 'meeting'
  dashed?: boolean
  meeting?: MeetingEvent
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

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CalendarPage() {
  const { profile, isAdmin } = useAuth()

  const [shootings, setShootings] = useState<ShootingEvent[]>([])
  const [tasks, setTasks] = useState<TaskEvent[]>([])
  const [meetings, setMeetings] = useState<MeetingEvent[]>([])
  const [colleagues, setColleagues] = useState<Colleague[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)

  const [showBooking, setShowBooking] = useState(false)
  const [detailMeeting, setDetailMeeting] = useState<MeetingEvent | null>(null)

  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth()) // 0-indexed

  // Ikke-admin ser alltid kun sitt eget filter; admin styrer via selectedPersonId (null = alle)
  const effectiveFilterId = isAdmin ? selectedPersonId : (profile?.id ?? null)

  async function load() {
    if (!isAdmin && !profile) return // vent på profil for ikke-admin, ellers filtreres feil (alt) et øyeblikk
    setLoading(true)
    const [calData, meetingData] = await Promise.all([
      getCalendarEvents(effectiveFilterId),
      getMeetingsForCalendar(effectiveFilterId),
    ])
    setShootings(calData.shootings)
    setTasks(calData.tasks)
    setMeetings(meetingData)
    setLoading(false)
  }

  useEffect(() => {
    load()
    getColleagues().then(setColleagues)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveFilterId, profile?.id, isAdmin])

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

    // Meeting events
    for (const m of meetings) {
      const date = m.startsAt.split('T')[0]
      const myStatus = effectiveFilterId
        ? m.participants.find((p) => p.profileId === effectiveFilterId)?.status
        : undefined
      const declined = myStatus === 'declined'
      add(date, {
        id: `meeting-${m.id}`,
        date,
        label: m.title,
        sublabel: `${fmtTime(m.startsAt)}${m.endsAt ? `–${fmtTime(m.endsAt)}` : ''}`,
        href: null,
        color: C.meeting,
        bgColor: 'rgba(212,80,140,0.14)',
        confirmed: true,
        type: 'meeting',
        dashed: declined,
        meeting: m,
      })
    }

    return map
  }, [shootings, tasks, meetings, effectiveFilterId])

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
    { color: C.meeting, bg: 'rgba(212,80,140,0.14)', label: 'Møte', dashed: false },
  ]

  // Count stats
  const confirmedShootings = shootings.filter(s => s.confirmed).length
  const unconfirmedShootings = shootings.filter(s => !s.confirmed).length
  const postProdTasks = tasks.filter(t => t.pipelineStage === 'post_prod').length

  return (
    <div className="px-4 md:px-8" style={{ background: C.bg, minHeight: '100vh', paddingTop: 28, paddingBottom: 48, color: C.text }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, marginBottom: 3 }}>
              Kalender
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
              {confirmedShootings} bekreftede opptak · {unconfirmedShootings} ubekreftede · {postProdTasks} post-prod oppgaver · {meetings.length} møter
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {isAdmin && (
              <select
                value={selectedPersonId ?? ''}
                onChange={(e) => setSelectedPersonId(e.target.value || null)}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500,
                  padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                  background: C.surface2, color: C.text2, border: `1px solid ${C.border}`,
                }}
              >
                <option value="">Alle (admin-visning)</option>
                {colleagues.map((c) => (
                  <option key={c.id} value={c.id}>Vis som {c.name ?? c.email}</option>
                ))}
              </select>
            )}

            <button
              onClick={() => setShowBooking(true)}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                background: C.meeting, color: '#fff', border: 'none',
              }}
            >
              + Nytt møte
            </button>

            {/* Month navigation */}
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
            {/* Scroller — på mobil crusher et fast 7-kolonners rutenett til uleselige striper,
                så vi lar det heller beholde en lesbar min-bredde og scrolle horisontalt der. */}
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: 630 }}>
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
                      {visible.map(ev => {
                        const chip = (
                          <div
                            title={`${ev.label}${ev.sublabel ? ` — ${ev.sublabel}` : ''}`}
                            style={{
                              background: ev.bgColor,
                              border: ev.dashed && ev.type === 'shooting'
                                ? `1px dashed ${ev.color}`
                                : ev.dashed && ev.type === 'meeting'
                                ? `1px dashed ${ev.color}`
                                : `1px solid ${ev.color}30`,
                              borderRadius: 4,
                              padding: '4px 6px',
                              display: 'flex', alignItems: 'center', gap: 4,
                              cursor: 'pointer',
                              transition: 'opacity 0.1s',
                              opacity: (ev.type === 'task' && ev.dashed) || (ev.type === 'meeting' && ev.dashed) ? 0.5 : 1,
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.opacity = '0.75' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.opacity = ((ev.type === 'task' || ev.type === 'meeting') && ev.dashed) ? '0.5' : '1' }}
                          >
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
                        )
                        return ev.type === 'meeting' ? (
                          <button
                            key={ev.id}
                            onClick={() => setDetailMeeting(ev.meeting!)}
                            style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
                          >
                            {chip}
                          </button>
                        ) : (
                          <Link key={ev.id} href={ev.href!} style={{ textDecoration: 'none' }}>
                            {chip}
                          </Link>
                        )
                      })}
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
            </div>
          </div>
        )}
      </div>

      {showBooking && (
        <BookingModal
          colleagues={colleagues}
          onClose={() => setShowBooking(false)}
          onCreated={() => { setShowBooking(false); load() }}
        />
      )}

      {detailMeeting && (
        <MeetingDetailModal
          meeting={detailMeeting}
          currentUserId={profile?.id ?? null}
          onClose={() => setDetailMeeting(null)}
          onChanged={() => { setDetailMeeting(null); load() }}
        />
      )}
    </div>
  )
}

function BookingModal({ colleagues, onClose, onCreated }: {
  colleagues: Colleague[]
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => toLocalInputValue(new Date()).slice(0, 10))
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('')
  const [link, setLink] = useState('')
  const [notes, setNotes] = useState('')
  const [participantIds, setParticipantIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleParticipant(id: string) {
    setParticipantIds(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError('Møtet trenger en tittel'); return }
    if (participantIds.length === 0) { setError('Velg minst én kollega'); return }

    setSaving(true)
    const startsAt = new Date(`${date}T${startTime}`).toISOString()
    const endsAt = endTime ? new Date(`${date}T${endTime}`).toISOString() : null
    const result = await createMeeting({
      title, startsAt, endsAt,
      meetingLink: link || null,
      notes: notes || null,
      participantIds,
    })
    setSaving(false)
    if (!result.ok) { setError(result.error ?? 'Kunne ikke opprette møtet'); return }
    onCreated()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.05rem', fontWeight: 600, color: C.text }}>Nytt møte</h2>

        <Field label="Tittel">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="F.eks. Ukesplanlegging" style={inputStyle} />
        </Field>

        <div style={{ display: 'flex', gap: 8 }}>
          <Field label="Dato" style={{ flex: 1 }}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Start" style={{ width: 100 }}>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Slutt (valgfri)" style={{ width: 100 }}>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inputStyle} />
          </Field>
        </div>

        <Field label="Møtelenke (valgfri, limes inn manuelt)">
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." style={inputStyle} />
        </Field>

        <Field label="Notat (valgfri)">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' as const }} />
        </Field>

        <Field label="Inviter kolleger">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 6, padding: 6 }}>
            {colleagues.length === 0 && (
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, padding: '4px 6px' }}>Ingen andre kolleger funnet</span>
            )}
            {colleagues.map(c => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', borderRadius: 4, background: participantIds.includes(c.id) ? C.accentBg : 'transparent' }}>
                <input type="checkbox" checked={participantIds.includes(c.id)} onChange={() => toggleParticipant(c.id)} />
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text }}>{c.name ?? c.email}</span>
              </label>
            ))}
          </div>
        </Field>

        {error && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" onClick={onClose} style={{ ...buttonSecondary }}>Avbryt</button>
          <button type="submit" disabled={saving} style={{ ...buttonPrimary(C.meeting), opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Booker...' : 'Book møte'}
          </button>
        </div>
      </form>
    </div>
  )
}

function MeetingDetailModal({ meeting, currentUserId, onClose, onChanged }: {
  meeting: MeetingEvent
  currentUserId: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [link, setLink] = useState(meeting.meetingLink ?? '')
  const [editingLink, setEditingLink] = useState(false)

  const isOrganizer = currentUserId === meeting.organizerId
  const myParticipant = meeting.participants.find(p => p.profileId === currentUserId)

  async function respond(status: 'accepted' | 'declined') {
    setBusy(true)
    await respondToMeetingInvite(meeting.id, status)
    setBusy(false)
    onChanged()
  }

  async function saveLink() {
    setBusy(true)
    await updateMeeting(meeting.id, { meetingLink: link })
    setBusy(false)
    setEditingLink(false)
    onChanged()
  }

  async function handleCancel() {
    if (!confirm(`Avlyse "${meeting.title}"?`)) return
    setBusy(true)
    await cancelMeeting(meeting.id)
    setBusy(false)
    onChanged()
  }

  const statusLabel: Record<string, string> = { pending: 'Ikke svart', accepted: 'Godtatt', declined: 'Avslått' }
  const statusColor: Record<string, string> = { pending: C.text3, accepted: C.success, declined: C.danger }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: 'min(420px, calc(100vw - 32px))', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.05rem', fontWeight: 600, color: C.text }}>{meeting.title}</h2>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginTop: 2 }}>
            {new Date(meeting.startsAt).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })} · {fmtTime(meeting.startsAt)}{meeting.endsAt ? `–${fmtTime(meeting.endsAt)}` : ''}
          </p>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginTop: 2 }}>Booket av {meeting.organizerName}</p>
        </div>

        {meeting.notes && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>{meeting.notes}</p>
        )}

        <div>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.text3 }}>Møtelenke</span>
          {editingLink ? (
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://..." style={{ ...inputStyle, flex: 1 }} />
              <button onClick={saveLink} disabled={busy} style={buttonPrimary(C.meeting)}>Lagre</button>
            </div>
          ) : meeting.meetingLink ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <a href={meeting.meetingLink} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.accent, wordBreak: 'break-all' }}>
                {meeting.meetingLink}
              </a>
              {isOrganizer && <button onClick={() => setEditingLink(true)} style={linkButtonStyle}>Endre</button>}
            </div>
          ) : (
            <div style={{ marginTop: 4 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>Ingen lenke lagt inn ennå</span>
              {isOrganizer && <button onClick={() => setEditingLink(true)} style={{ ...linkButtonStyle, marginLeft: 8 }}>Legg til</button>}
            </div>
          )}
        </div>

        <div>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.text3 }}>Deltakere</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {meeting.participants.map(p => (
              <div key={p.profileId} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem' }}>
                <span style={{ color: C.text }}>{p.name}</span>
                <span style={{ color: statusColor[p.status] }}>{statusLabel[p.status]}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div>
            {isOrganizer && (
              <button onClick={handleCancel} disabled={busy} style={{ ...buttonSecondary, color: C.danger, borderColor: C.danger }}>
                Avlys møte
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {myParticipant && myParticipant.status !== 'accepted' && (
              <button onClick={() => respond('accepted')} disabled={busy} style={buttonPrimary(C.success)}>Godta</button>
            )}
            {myParticipant && myParticipant.status !== 'declined' && (
              <button onClick={() => respond('declined')} disabled={busy} style={{ ...buttonSecondary, color: C.danger, borderColor: C.danger }}>Avslå</button>
            )}
            <button onClick={onClose} style={buttonSecondary}>Lukk</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, color: C.text3, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem',
  padding: '7px 10px', borderRadius: 6, background: C.surface2, border: `1px solid ${C.border}`, color: C.text,
}

const buttonSecondary: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500,
  padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
  background: 'none', color: C.text2, border: `1px solid ${C.border}`,
}

function buttonPrimary(bg: string): React.CSSProperties {
  return {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
    padding: '7px 14px', borderRadius: 6, cursor: 'pointer',
    background: bg, color: '#fff', border: 'none',
  }
}

const linkButtonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600,
  background: 'none', border: 'none', color: C.accent, cursor: 'pointer', padding: 0,
}
