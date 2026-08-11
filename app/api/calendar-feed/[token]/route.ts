import { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { buildCalendarFeed } from '@/lib/ics-feed'

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const expected = process.env.CALENDAR_FEED_TOKEN
  if (!expected) {
    return new Response('Kalenderfeed er ikke konfigurert', { status: 503 })
  }

  const { token } = await params
  if (!tokenMatches(token, expected)) {
    return new Response('Ugyldig token', { status: 403 })
  }

  const ics = await buildCalendarFeed()

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=900',
    },
  })
}
