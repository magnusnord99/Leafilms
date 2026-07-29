'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase-server'
import type { PipelineStage } from '@/lib/types'
import type { LostReason } from '@/lib/lost-constants'

export async function markAsLost(
  projectId: string,
  reason: LostReason,
  notes: string | null,
  currentStage: PipelineStage,
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from('projects')
      .update({
        status: 'lost',
        lost_reason: reason,
        lost_notes: notes || null,
        lost_at: new Date().toISOString(),
        lost_stage: currentStage,
      })
      .eq('id', projectId)

    if (error) return { error: error.message }
    revalidatePath('/admin/projects')
    revalidatePath('/admin/tapte')
    return { error: null }
  } catch (err) {
    return { error: 'Noe gikk galt' }
  }
}

export type LostProject = {
  id: string
  title: string
  client_name: string | null
  lost_reason: LostReason
  lost_notes: string | null
  lost_at: string
  lost_stage: PipelineStage
}

export async function getLostProjects(): Promise<LostProject[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('projects')
      .select('id, title, client_name, lost_reason, lost_notes, lost_at, lost_stage')
      .eq('status', 'lost')
      .order('lost_at', { ascending: false })

    if (error) return []
    return (data ?? []) as LostProject[]
  } catch {
    return []
  }
}

export type LostStats = {
  total: number
  byReason: Record<string, number>
  byStage: Record<string, number>
  winLossRatio: number | null
}

export async function getLostStats(): Promise<LostStats> {
  try {
    const supabase = await createClient()

    const [{ data: lostData }, { count: wonCount }] = await Promise.all([
      supabase
        .from('projects')
        .select('lost_reason, lost_stage')
        .eq('status', 'lost'),
      supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('pipeline_stage', 'fakturert'),
    ])

    const lost = lostData ?? []
    const total = lost.length

    const byReason: Record<string, number> = {}
    const byStage: Record<string, number> = {}

    for (const row of lost) {
      if (row.lost_reason) byReason[row.lost_reason] = (byReason[row.lost_reason] ?? 0) + 1
      if (row.lost_stage)  byStage[row.lost_stage]   = (byStage[row.lost_stage]   ?? 0) + 1
    }

    const won = wonCount ?? 0
    const winLossRatio = total > 0 ? Math.round((won / (won + total)) * 100) : null

    return { total, byReason, byStage, winLossRatio }
  } catch {
    return { total: 0, byReason: {}, byStage: {}, winLossRatio: null }
  }
}
