'use server'

import { createClient } from '@/lib/supabase-server'
import type { DashboardLayoutItem, DashboardWidgetKey } from '@/lib/types'

// Default: to kolonner, en rimelig fordeling av widgets fra registeret —
// se components/admin/dashboard/registry.tsx for selve widget-definisjonene.
const DEFAULT_LAYOUT: DashboardLayoutItem[] = [
  { widgetKey: 'stats', column: 0, position: 0 },
  { widgetKey: 'pipeline', column: 0, position: 1 },
  { widgetKey: 'my_tasks', column: 0, position: 2 },
  { widgetKey: 'recent_projects', column: 0, position: 3 },
  { widgetKey: 'calendar', column: 1, position: 0 },
  { widgetKey: 'upcoming_shoots', column: 1, position: 1 },
  { widgetKey: 'leads_follow_up', column: 1, position: 2 },
  { widgetKey: 'customers', column: 1, position: 3 },
  { widgetKey: 'market_analysis', column: 1, position: 4 },
]

export async function getDashboardLayout(): Promise<DashboardLayoutItem[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return DEFAULT_LAYOUT

  const { data, error } = await supabase
    .from('dashboard_layouts')
    .select('widget_key, column_index, position')
    .eq('profile_id', user.id)
    .order('column_index', { ascending: true })
    .order('position', { ascending: true })

  if (error || !data || data.length === 0) {
    return DEFAULT_LAYOUT
  }

  return data.map((row) => ({
    widgetKey: row.widget_key as DashboardWidgetKey,
    column: row.column_index,
    position: row.position,
  }))
}

export async function saveDashboardLayout(items: DashboardLayoutItem[]): Promise<{ ok: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false }

  const { error: deleteError } = await supabase
    .from('dashboard_layouts')
    .delete()
    .eq('profile_id', user.id)
  if (deleteError) {
    console.error('saveDashboardLayout delete:', deleteError)
    return { ok: false }
  }

  if (items.length === 0) return { ok: true }

  const { error: insertError } = await supabase
    .from('dashboard_layouts')
    .insert(items.map((item) => ({
      profile_id: user.id,
      widget_key: item.widgetKey,
      column_index: item.column,
      position: item.position,
    })))
  if (insertError) {
    console.error('saveDashboardLayout insert:', insertError)
    return { ok: false }
  }

  return { ok: true }
}
