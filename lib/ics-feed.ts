import { createServiceClient } from '@/lib/supabase-server'

// Genererer en iCalendar-feed (RFC 5545) med opptak og leveringsdatoer, ment for
// abonnement fra f.eks. iPhone-kalenderen ("Legg til abonnert kalender"). Leses av
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

export async function buildCalendarFeed(): Promise<string> {
  const supabase = createServiceClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://leafilms.no'

  const [{ data: projects }, { data: signedContracts }, { data: deliveryTasks }] = await Promise.all([
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
  ])

  const signedProjectIds = new Set((signedContracts ?? []).map((c) => c.project_id as string))
  const deliveryDueDates = new Map<string, string>(
    ((deliveryTasks ?? []) as DeliveryTaskRow[]).map((t) => [t.project_id, t.due_date])
  )

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
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
