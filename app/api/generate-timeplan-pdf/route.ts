import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getScheduleCardData } from '@/lib/actions/boards'
import { resolveSchedulePeople } from '@/lib/actions/schedule-people'
import type { BoardScheduleContent, SchedulePersonRef } from '@/lib/types'
import { generateTimeplanPDF, type TimeplanPdfItem } from './pdf-generator'

function formatDateRange(start: string | null, end: string | null): string | null {
  if (!start) return null
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-')
    return `${d}.${m}.${y}`
  }
  return end && end !== start ? `${fmt(start)} – ${fmt(end)}` : fmt(start)
}

export async function POST(req: NextRequest) {
  try {
    const { cardId } = await req.json()
    if (!cardId) {
      return NextResponse.json({ error: 'Mangler cardId' }, { status: 400 })
    }

    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    const { data: profile } = user
      ? await authClient.from('profiles').select('role').eq('id', user.id).single()
      : { data: null }
    if (!user || (profile?.role !== 'admin' && profile?.role !== 'production')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pageData = await getScheduleCardData(cardId)
    if (!pageData) {
      return NextResponse.json({ error: 'Fant ingen timeplan med denne IDen' }, { status: 404 })
    }

    const content = pageData.card.content as BoardScheduleContent
    const items = [...content.items].sort((a, b) => a.time.localeCompare(b.time))
    const allRefs: SchedulePersonRef[] = items.flatMap(i => i.people ?? [])
    const resolved = await resolveSchedulePeople(allRefs)
    const byKey = new Map(resolved.map(p => [`${p.ref.type}:${p.ref.id}`, p]))

    const pdfItems: TimeplanPdfItem[] = items.map(item => ({
      time: item.time,
      label: item.label,
      location: item.location,
      people: (item.people ?? [])
        .map(ref => byKey.get(`${ref.type}:${ref.id}`))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .map(p => ({ name: p.name, role: p.role, email: p.email, phone: p.phone })),
    }))

    const pdfBuffer = await generateTimeplanPDF({
      scheduleTitle: content.title || 'Timeplan',
      projectTitle: pageData.projectTitle,
      shootDateRange: formatDateRange(pageData.shootStart, pageData.shootEnd),
      items: pdfItems,
    })

    const safeTitle = (pageData.projectTitle || 'Prosjekt').replace(/[^a-zA-Z0-9æøåÆØÅ\s_-]/g, '').replace(/\s+/g, '_')
    const date = new Date().toISOString().split('T')[0]
    const filename = `Timeplan_${safeTitle}_${date}.pdf`

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('generate-timeplan-pdf error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunne ikke generere PDF' },
      { status: 500 }
    )
  }
}
