'use server'

import { getAuthenticatedStaffUser } from '@/lib/auth/staff'
import { createClient } from '@/lib/supabase-server'

export type FlyerStats = {
  id: string; slug: string; headline: string; published: boolean
  total_views: number; views_7d: number; views_30d: number
  first_view: string | null; last_view: string | null
}
export type FlyerAnalytics = {
  flyer: FlyerStats
  days: { date: string; views: number }[]
  sources: { source: string; views: number }[]
  recent: { viewed_at: string; source: string }[]
}
export type PitchStats = {
  id: string; title: string; published: boolean; customer: string | null
  total_views: number; avg_time_seconds: number | null; last_view: string | null
}

async function staffClient() {
  if (!(await getAuthenticatedStaffUser()).ok) throw new Error('Ingen tilgang til statistikk')
  return createClient()
}

export async function getFlyerStatistics(id: string): Promise<FlyerAnalytics | null> {
  const db = await staffClient()
  const { data, error } = await db.rpc('get_sales_flyer_analytics', { p_flyer_id: id })
  if (error) throw error
  return data as FlyerAnalytics | null
}

export async function getStatisticsOverview(): Promise<{ flyers: FlyerStats[]; pitches: PitchStats[] }> {
  const db = await staffClient()
  const flyersRequest = db.rpc('get_sales_flyer_analytics')
  // Paginering: hverken historikk eller liste skal avkuttes ved 1000 rader.
  const projects = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('projects')
      .select('id, title, status, customers(name), sections(count)')
      .neq('status', 'archived').eq('is_package_template', false).order('id').range(offset, offset + 999)
    if (error) throw error
    projects.push(...(data ?? []))
    if ((data?.length ?? 0) < 1000) break
  }
  const summaries = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('project_analytics_summary')
      .select('project_id, total_sessions, avg_time_seconds, last_view').order('project_id').range(offset, offset + 999)
    if (error) throw error
    summaries.push(...(data ?? []))
    if ((data?.length ?? 0) < 1000) break
  }
  const { data: flyers, error } = await flyersRequest
  if (error) throw error
  const byId = new Map(summaries.map(summary => [summary.project_id, summary]))
  type Row = { id: string; title: string; status: string; customers: { name: string } | null; sections: { count: number }[] }
  const pitches = (projects as unknown as Row[]).filter(project => (project.sections?.[0]?.count ?? 0) > 0).map(project => {
    const summary = byId.get(project.id)
    return { id: project.id, title: project.title, published: project.status === 'published', customer: project.customers?.name ?? null,
      total_views: Number(summary?.total_sessions ?? 0), avg_time_seconds: summary?.avg_time_seconds ?? null, last_view: summary?.last_view ?? null }
  }).sort((a, b) => (b.last_view ?? '').localeCompare(a.last_view ?? ''))
  return { flyers: flyers as FlyerStats[], pitches }
}
