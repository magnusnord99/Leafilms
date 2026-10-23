'use server'

import { createClient } from '@/lib/supabase-server'
import type { DashboardLayoutItem, DashboardWidgetKey } from '@/lib/types'

const DEFAULT_ORDER: DashboardWidgetKey[] = [
  'stats', 'pipeline', 'calendar', 'recent_projects', 'customers', 'market_analysis',
]

function defaultLayout(): DashboardLayoutItem[] {
  return DEFAULT_ORDER.map((widgetKey, position) => ({ widgetKey, position, enabled: true }))
}

export async function getDashboardLayout(): Promise<DashboardLayoutItem[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return defaultLayout()

  const { data, error } = await supabase
    .from('dashboard_layouts')
    .select('widget_key, position, enabled')
    .eq('profile_id', user.id)
    .order('position', { ascending: true })

  if (error || !data || data.length === 0) {
    return defaultLayout()
  }

  return data.map((row) => ({
    widgetKey: row.widget_key as DashboardWidgetKey,
    position: row.position,
    enabled: row.enabled,
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
      position: item.position,
      enabled: item.enabled,
    })))
  if (insertError) {
    console.error('saveDashboardLayout insert:', insertError)
    return { ok: false }
  }

  return { ok: true }
}
