import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedStaffUser } from '@/lib/auth/staff'
import { getFlyerStatistics } from '@/lib/actions/statistics'
import { StatisticsRefresh } from '@/components/admin/StatisticsRefresh'
import { AnalyticsTimeline } from '@/app/admin/projects/[id]/quote-analytics/components/AnalyticsTimeline'
import { Card, Heading, Text } from '@/components/ui'

export const dynamic = 'force-dynamic'
const date = (value: string) => new Date(value).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default async function FlyerStatisticsPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getAuthenticatedStaffUser()).ok) redirect('/login')
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()
  const analytics = await getFlyerStatistics(id)
  if (!analytics) notFound()
  const { flyer, days, sources, recent } = analytics
  const maxDaily = Math.max(1, ...days.map(day => day.views))
  const metrics = [
    { label: 'Totale visninger', value: flyer.total_views.toLocaleString('nb-NO') },
    { label: 'Siste 7 dager', value: flyer.views_7d.toLocaleString('nb-NO') },
    { label: 'Siste 30 dager', value: flyer.views_30d.toLocaleString('nb-NO') },
    { label: 'Sist sett', value: flyer.last_view ? date(flyer.last_view) : 'Ingen visninger' },
  ]
  return <div className="min-h-screen p-4 sm:p-8"><div className="mx-auto max-w-7xl">
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div><Link href="/admin/statistikk?type=flyers" className="mb-2 inline-block text-sm text-violet-400 hover:underline">← Tilbake til statistikk</Link>
        <Heading as="h1" size="lg">Flyer-statistikk: {flyer.headline || flyer.slug}</Heading>
        <p className="mt-2 text-sm">{flyer.published ? 'Publisert' : 'Ikke publisert'} · <Link href={`/flyer/${flyer.slug}`} target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:underline">Åpne flyer ↗</Link></p>
      </div><StatisticsRefresh />
    </div>
    <Card className="border-zinc-700 bg-zinc-900 text-white"><div className="space-y-8">
      <div className="border-b border-zinc-700 pb-4"><Heading as="h2" size="md" className="!text-white">Visninger og aktivitet</Heading>
        <p className="mt-2 text-sm text-zinc-400">Visninger er sideåpninger, ikke unike personer. Innloggede brukere telles ikke. Tid på siden og klikk er foreløpig ikke registrert for flyers.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 sm:gap-6">{metrics.map(metric => <div key={metric.label} className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 sm:p-6">
        <p className="mb-2 text-xs uppercase tracking-wide text-zinc-400">{metric.label}</p>
        <p className={metric.label === 'Sist sett' ? 'text-lg font-semibold' : 'text-4xl font-bold'}>{metric.value}</p>
      </div>)}</div>
      {flyer.total_views === 0 && <p className="rounded-lg border border-zinc-700 p-5 text-sm text-zinc-300">Ingen visninger ennå. Del den publiserte flyeren for å begynne å samle statistikk.</p>}
      <section>
        <Heading as="h2" size="md" className="mb-2 !text-white">Visninger per dag</Heading>
        <p className="mb-4 text-xs text-zinc-400">Siste 30 kalenderdager · norsk tid</p>
        <div role="img" aria-label="Stolpediagram over sidevisninger de siste 30 dagene" className="flex h-40 items-end gap-1 border-b border-zinc-700">
          {days.map(day => <div key={day.date} className="group flex h-full min-w-0 flex-1 items-end" title={`${day.date}: ${day.views} visninger`}>
            <div className="w-full rounded-t bg-violet-500 transition-colors group-hover:bg-violet-300" style={{ height: day.views ? `${Math.max(3, day.views / maxDaily * 100)}%` : '2px', opacity: day.views ? 1 : 0.15 }} />
          </div>)}
        </div>
        <div className="mt-2 flex justify-between text-xs text-zinc-500"><span>{days[0]?.date}</span><span>{days.at(-1)?.date}</span></div>
        <details className="mt-4 text-xs text-zinc-400"><summary className="cursor-pointer">Vis dagsdata</summary><div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">{days.map(day => <p key={day.date}>{day.date}: {day.views}</p>)}</div></details>
      </section>
      <div className="grid gap-8 md:grid-cols-2">
        <section><Heading as="h2" size="md" className="mb-4 !text-white">Hvor kommer besøkene fra?</Heading>
          <p className="mb-4 text-xs text-zinc-400">Topp 10 domener, hele perioden. Manglende kilde vises som direkte / ukjent.</p>
          {sources.map(source => <div key={source.source} className="mb-4"><div className="mb-1 flex justify-between gap-3 text-sm"><span className="break-all">{source.source}</span><span>{source.views}</span></div>
            <div className="h-1.5 rounded bg-zinc-800"><div className="h-full rounded bg-blue-500" style={{ width: `${source.views / Math.max(1, flyer.total_views) * 100}%` }} /></div>
          </div>)}
          {sources.length === 0 && <Text variant="muted">Ingen besøk registrert.</Text>}
        </section>
        <section><Heading as="h2" size="md" className="mb-4 !text-white">Siste visninger</Heading>
          <p className="mb-4 text-xs text-zinc-400">De 50 siste sideåpningene. Besøkende identifiseres ikke.</p>
          <div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead className="text-zinc-400"><tr><th className="py-2">Tidspunkt</th><th className="py-2">Kilde</th></tr></thead>
            <tbody>{recent.map((visit, index) => <tr key={`${visit.viewed_at}-${index}`} className="border-t border-zinc-800"><td className="whitespace-nowrap py-2 pr-3">{date(visit.viewed_at)}</td><td className="break-all py-2 text-zinc-400">{visit.source}</td></tr>)}</tbody></table></div>
          {recent.length === 0 && <Text variant="muted">Ingen visninger ennå.</Text>}
        </section>
      </div>
      <AnalyticsTimeline analytics={flyer} timeZone="Europe/Oslo" />
    </div></Card>
  </div></div>
}
