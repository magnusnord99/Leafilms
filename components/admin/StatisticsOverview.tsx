'use client'

import { useState } from 'react'
import Link from 'next/link'
import { C } from '@/lib/admin-theme'
import type { FlyerStats, PitchStats } from '@/lib/actions/statistics'
import { StatisticsRefresh } from './StatisticsRefresh'

export function statisticsDate(value: string | null) {
  return value ? new Date(value).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Ingen visninger'
}

export function StatisticsOverview({ flyers, pitches, initialTab }: { flyers: FlyerStats[]; pitches: PitchStats[]; initialTab: 'pitcher' | 'flyers' }) {
  const [tab, setTab] = useState(initialTab)
  const [search, setSearch] = useState('')
  const rows = tab === 'flyers' ? flyers.map(f => ({ id: f.id, title: f.headline || `/flyer/${f.slug}`, subtitle: `/flyer/${f.slug}`, published: f.published,
    views: f.total_views, last: f.last_view, href: `/admin/statistikk/flyers/${f.id}` }))
    : pitches.map(p => ({ id: p.id, title: p.title, subtitle: p.customer ?? '', published: p.published,
      views: p.total_views, last: p.last_view, href: `/admin/projects/${p.id}/quote-analytics` }))
  const visible = rows.filter(row => `${row.title} ${row.subtitle}`.toLocaleLowerCase('nb-NO').includes(search.toLocaleLowerCase('nb-NO')))
  return <div className="mx-auto max-w-7xl p-4 sm:p-8" style={{ color: C.text }}>
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Statistikk</h1><p className="mt-2 text-sm" style={{ color: C.text2 }}>Visninger og aktivitet for pitcher og flyers samlet på ett sted.</p></div>
      <StatisticsRefresh />
    </div>
    <div role="tablist" aria-label="Statistikktype" className="mb-6 flex gap-2">
      {(['pitcher', 'flyers'] as const).map(kind => <button key={kind} role="tab" aria-selected={tab === kind}
        onClick={() => { setTab(kind); setSearch('') }} className="rounded px-4 py-2 text-sm font-medium"
        style={{ background: tab === kind ? C.accentBg : C.surface, color: tab === kind ? C.accent : C.text2, border: `1px solid ${tab === kind ? C.accent : C.border}` }}>
        {kind === 'pitcher' ? 'Pitcher' : 'Flyers'} ({kind === 'pitcher' ? pitches.length : flyers.length})
      </button>)}
    </div>
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
      {[['Totale visninger', rows.reduce((sum, row) => sum + row.views, 0)], ['Publiserte', rows.filter(row => row.published).length], ['Med visninger', rows.filter(row => row.views > 0).length]].map(([label, value]) =>
        <div key={label} className="rounded-lg border p-5" style={{ background: C.surface, borderColor: C.border }}>
          <p className="text-xs uppercase tracking-wide" style={{ color: C.text3 }}>{label}</p><p className="mt-2 text-3xl font-semibold">{Number(value).toLocaleString('nb-NO')}</p>
        </div>)}
    </div>
    {tab === 'flyers' && <p className="mb-5 text-sm" style={{ color: C.text2 }}>Visninger er sideåpninger, ikke unike personer. Innloggede besøk telles ikke.</p>}
    <input aria-label="Søk i statistikken" value={search} onChange={event => setSearch(event.target.value)} placeholder="Søk på navn, kunde eller lenke…"
      className="mb-4 w-full max-w-md rounded border px-3 py-2 text-base" style={{ background: C.surface, borderColor: C.border, color: C.text }} />
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: C.border, background: C.surface }}>
      <table className="w-full text-left text-sm">
        <thead style={{ color: C.text3 }}><tr><th className="p-4">{tab === 'flyers' ? 'Flyer' : 'Pitch'}</th><th className="p-4">Status</th><th className="p-4 text-right">Visninger</th><th className="p-4">Sist sett</th><th className="p-4"><span className="sr-only">Detaljer</span></th></tr></thead>
        <tbody>{visible.map(row => <tr key={row.id} className="border-t" style={{ borderColor: C.border }}>
          <td className="p-4"><Link href={row.href} className="font-medium hover:underline">{row.title}</Link><p className="mt-1 text-xs" style={{ color: C.text3 }}>{row.subtitle}</p></td>
          <td className="p-4" style={{ color: row.published ? C.success : C.text3 }}>{row.published ? 'Publisert' : 'Ikke publisert'}</td>
          <td className="p-4 text-right font-semibold">{row.views.toLocaleString('nb-NO')}</td><td className="whitespace-nowrap p-4" style={{ color: C.text2 }}>{statisticsDate(row.last)}</td>
          <td className="p-4"><Link href={row.href} className="whitespace-nowrap hover:underline" style={{ color: C.accent }}>Se statistikk →</Link></td>
        </tr>)}</tbody>
      </table>
      {visible.length === 0 && <p className="p-8 text-center" style={{ color: C.text3 }}>{search ? 'Ingen treff.' : 'Ingen data ennå.'}</p>}
    </div>
  </div>
}
