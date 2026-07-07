import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { updatePipelineStage } from '@/lib/actions/pipeline'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data: projects, error } = await supabase
    .from('projects')
    .select('id')
    .eq('pipeline_stage', 'produksjon')
    .or(`shoot_end.lt.${today},and(shoot_end.is.null,shoot_start.lt.${today})`)

  if (error) {
    console.error('advance-produksjon: query feilet', error)
    return Response.json({ error: 'DB error' }, { status: 500 })
  }

  const advanced: string[] = []
  for (const project of projects ?? []) {
    await updatePipelineStage(project.id, 'post_prod', supabase)
    advanced.push(project.id)
  }

  return Response.json({ ok: true, advanced })
}
