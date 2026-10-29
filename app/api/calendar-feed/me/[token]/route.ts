import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { buildCalendarFeed } from '@/lib/ics-feed'

// Personlig kalender-abonnement — hvert token identifiserer én bruker (profiles.
// calendar_feed_token, se 183_personal_calendar_feed.sql), i motsetning til
// /api/calendar-feed/[token] som bruker ett delt hemmelig token for alle
// (CALENDAR_FEED_TOKEN-miljøvariabelen, fortsatt uendret for eksisterende abonnenter).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!token) return new Response('Ugyldig token', { status: 403 })

  const supabase = createServiceClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('calendar_sync_shoots, calendar_sync_deliveries, calendar_sync_meetings, calendar_sync_tasks')
    .eq('calendar_feed_token', token)
    .maybeSingle()

  if (!profile) return new Response('Ugyldig token', { status: 403 })

  const ics = await buildCalendarFeed({
    shoots: profile.calendar_sync_shoots,
    deliveries: profile.calendar_sync_deliveries,
    meetings: profile.calendar_sync_meetings,
    tasks: profile.calendar_sync_tasks,
  })

  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'private, max-age=900',
    },
  })
}
