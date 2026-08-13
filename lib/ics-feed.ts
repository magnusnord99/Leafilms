import { createServiceClient } from '@/lib/supabase-server'
import { toIcsUtcDateTime } from '@/lib/ics-datetime'

// Genererer en iCalendar-feed (RFC 5545) med opptak, leveringsdatoer og interne møter,
// ment for abonnement fra f.eks. iPhone-kalenderen ("Legg til abonnert kalender"). Leses av
// app/api/calendar-feed/[token]/route.ts — ingen innlogging, kun et delt hemmelig
// token i URL-en (samme mønster som andre token-baserte offentlige sider, f.eks. /p/[token]).

type ProjectRow = {
  id: string
  title: string
  pipeline_stage: string
  shoot_start: string | null
  shoot_end: string | null
  shoot_confirmed: boolean
  post_prod_days: number | null
  customers: { name: string | null } | null
}

type DeliveryTaskRow = {
  project_id: string
  due_date: string
}

type ProfileRef = { name: string | null; email: string } | { name: string | null; email: string }[] | null

type MeetingRow = {
  id: string
  title: string
  starts_at: string
  ends_at: string | null
  meeting_link: string | null
  notes: string | null
  organizer: ProfileRef
  meeting_participants: { status: 'pending' | 'accepted' | 'declined'; profiles: ProfileRef }[]
}

function firstOf<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// RFC 5545 krever linjebryting ved 75 oktetter — foldes med CRLF + ett mellomrom.
function foldLine(line: string): string {
  const bytes = Buffer.byteLength(line, 'utf8')
  if (bytes <= 75) return line
  let result = ''
  let chunk = ''
  let chunkBytes = 0
  for (const char of line) {
    const charBytes = Buffer.byteLength(char, 'utf8')
    if (chunkBytes + charBytes > 74) {
      result += (result ? '\r\n ' : '') + chunk
      chunk = ''
      chunkBytes = 0
    }
    chunk += char
    chunkBytes += charBytes
  }
  return result + (result ? '\r\n ' : '') + chunk
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10).replace(/-/g, '')
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function vevent(opts: {
  uid: string
  dtstart: string // YYYYMMDD
  dtend: string // YYYYMMDD, eksklusiv (dagen etter siste dag)
  summary: string
  description?: string
  url?: string
  status: 'CONFIRMED' | 'TENTATIVE'
  stamp: string
}): string {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${opts.stamp}`,
    `DTSTART;VALUE=DATE:${opts.dtstart}`,
    `DTEND;VALUE=DATE:${opts.dtend}`,
    `SUMMARY:${escapeText(opts.summary)}`,
    `STATUS:${opts.status}`,
  ]
  if (opts.description) lines.push(`DESCRIPTION:${escapeText(opts.description)}`)
  // URL-property er klikkbar i Apple/Google Calendar, men ikke alle klienter viser den
  // fremtredende — lenken legges derfor også inn i DESCRIPTION (samme mønster som ClickUp).
  if (opts.url) lines.push(`URL:${opts.url}`)
  lines.push('END:VEVENT')
  return lines.map(foldLine).join('\r\n')
}

function veventDateTime(opts: {
  uid: string
  dtstart: string // YYYYMMDDTHHMMSSZ
  dtend: string // YYYYMMDDTHHMMSSZ
  summary: string
  description?: string
  status: 'CONFIRMED' | 'TENTATIVE'
  stamp: string
}): string {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${opts.uid}`,
    `DTSTAMP:${opts.stamp}`,
    `DTSTART:${opts.dtstart}`,
    `DTEND:${opts.dtend}`,
    `SUMMARY:${escapeText(opts.summary)}`,
    `STATUS:${opts.status}`,
  ]
  if (opts.description) lines.push(`DESCRIPTION:${escapeText(opts.description)}`)
  lines.push('END:VEVENT')
  return lines.map(foldLine).join('\r\n')
}

export async function buildCalendarFeed(): Promise<string> {
  const supabase = createServiceClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://leafilms.no'

  const [{ data: projects }, { data: signedContracts }, { data: deliveryTasks }, { data: meetings }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, title, pipeline_stage, shoot_start, shoot_end, shoot_confirmed, post_prod_days, customers(name)')
      .not('shoot_start', 'is', null),
    supabase.from('contracts').select('project_id').eq('status', 'signed'),
    supabase
      .from('tasks')
      .select('project_id, due_date')
      .eq('pipeline_stage', 'levering')
      .eq('title', 'Lever ferdig materiale')
      .not('due_date', 'is', null),
    supabase
      .from('meetings')
      .select(`
        id, title, starts_at, ends_at, meeting_link, notes,
        organizer:profiles!meetings_organizer_id_fkey ( name, email ),
        meeting_participants ( status, profiles ( name, email ) )
      `),
  ])

  const signedProjectIds = new Set((signedContracts ?? []).map((c) => c.project_id as string))
  const deliveryDueDates = new Map<string, string>(
    ((deliveryTasks ?? []) as DeliveryTaskRow[]).map((t) => [t.project_id, t.due_date])
  )

  const stamp = toIcsUtcDateTime(new Date().toISOString()) ?? '19700101T000000Z'
  const events: string[] = []

  for (const p of (projects ?? []) as unknown as ProjectRow[]) {
    if (!p.shoot_start) continue
    const customerName = p.customers?.name ?? null
    const label = customerName ? `${customerName} — ${p.title}` : p.title
    const confirmed = p.shoot_confirmed || signedProjectIds.has(p.id)
    // Forsvar mot datafeil (sett feil vei i admin) — shoot_end skal aldri være før shoot_start.
    const shootEnd = p.shoot_end && p.shoot_end >= p.shoot_start ? p.shoot_end : p.shoot_start
    const projectUrl = `${siteUrl}/admin/projects/${p.id}`

    events.push(
      vevent({
        uid: `shoot-${p.id}@leafilms-pitch`,
        dtstart: dateOnly(p.shoot_start),
        dtend: addDays(shootEnd, 1),
        summary: `${confirmed ? '🎬' : '🎬 (ikke bekreftet)'} ${label}`,
        description: `Se prosjektet i Leafilms: ${projectUrl}`,
        url: projectUrl,
        status: confirmed ? 'CONFIRMED' : 'TENTATIVE',
        stamp,
      })
    )

    // Leveringsdato: bruk satt forfallsdato på "Lever ferdig materiale"-oppgaven hvis den finnes,
    // ellers et estimat basert på opptaksslutt + antall etterarbeidsdager.
    const firmDueDate = deliveryDueDates.get(p.id)
    const estimatedDate = p.post_prod_days != null
      ? addDays(shootEnd, p.post_prod_days)
      : null

    if (firmDueDate) {
      events.push(
        vevent({
          uid: `delivery-${p.id}@leafilms-pitch`,
          dtstart: dateOnly(firmDueDate),
          dtend: addDays(firmDueDate, 1),
          summary: `📦 Levering: ${label}`,
          description: `Se prosjektet i Leafilms: ${projectUrl}`,
          url: projectUrl,
          status: 'CONFIRMED',
          stamp,
        })
      )
    } else if (estimatedDate) {
      events.push(
        vevent({
          uid: `delivery-est-${p.id}@leafilms-pitch`,
          dtstart: estimatedDate,
          dtend: addDays(`${estimatedDate.slice(0, 4)}-${estimatedDate.slice(4, 6)}-${estimatedDate.slice(6, 8)}`, 1),
          summary: `📦 Levering (estimat): ${label}`,
          description: `Beregnet fra opptaksslutt + antall etterarbeidsdager — ikke en fast avtalt dato.\n\nSe prosjektet i Leafilms: ${projectUrl}`,
          url: projectUrl,
          status: 'TENTATIVE',
          stamp,
        })
      )
    }
  }

  // Interne møter: tas kun med når minst én deltaker har akseptert invitten
  // (meeting_participants.status = 'accepted') — upubliserte/uavklarte møter skal ikke synes her.
  for (const m of (meetings ?? []) as unknown as MeetingRow[]) {
    const participants = m.meeting_participants ?? []
    const acceptedCount = participants.filter((p) => p.status === 'accepted').length
    if (acceptedCount === 0) continue

    const organizer = firstOf(m.organizer)
    const organizerName = organizer?.name ?? organizer?.email ?? 'Ukjent'
    const participantNames = participants.map((p) => {
      const profile = firstOf(p.profiles)
      const name = profile?.name ?? profile?.email ?? 'Ukjent'
      return `${name} (${p.status === 'accepted' ? 'akseptert' : p.status === 'declined' ? 'avslått' : 'venter'})`
    })

    const startsAt = m.starts_at
    const startMs = new Date(startsAt).getTime()
    if (Number.isNaN(startMs)) continue

    const endCandidate = m.ends_at && new Date(m.ends_at).getTime() > startMs
      ? m.ends_at
      : new Date(startMs + 30 * 60 * 1000).toISOString()
    const dtstart = toIcsUtcDateTime(startsAt)
    const dtend = toIcsUtcDateTime(endCandidate)
    if (!dtstart || !dtend) continue

    const descriptionParts = [`Organisator: ${organizerName}`]
    if (participantNames.length > 0) descriptionParts.push(`Deltakere: ${participantNames.join(', ')}`)
    if (m.meeting_link) descriptionParts.push(`Lenke: ${m.meeting_link}`)
    if (m.notes) descriptionParts.push(m.notes)

    events.push(
      veventDateTime({
        uid: `meeting-${m.id}@leafilms-pitch`,
        dtstart,
        dtend,
        summary: `🗓️ ${m.title}`,
        description: descriptionParts.join('\n\n'),
        status: acceptedCount === participants.length ? 'CONFIRMED' : 'TENTATIVE',
        stamp,
      })
    )
  }

  // NB: events er allerede foldede, flerlinjers blokker (se vevent()) — de skal IKKE
  // foldes på nytt her, det ville brutt dem opp igjen ved vilkårlige byte-grenser.
  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Leafilms//Intern kalender//NO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Leafilms',
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ].map(foldLine)

  return [...header, ...events, 'END:VCALENDAR'].join('\r\n') + '\r\n'
}
