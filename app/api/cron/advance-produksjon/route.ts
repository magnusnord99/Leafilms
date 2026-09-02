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

  // pre_prod -> produksjon: opptaksdatoen er kommet (feedback 515976f0).
  const { data: startingProjects, error: startingError } = await supabase
    .from('projects')
    .select('id')
    .eq('pipeline_stage', 'pre_prod')
    .lte('shoot_start', today)

  if (startingError) {
    console.error('advance-produksjon: pre_prod-query feilet', startingError)
    return Response.json({ error: 'DB error' }, { status: 500 })
  }

  const startedProduksjon: string[] = []
  for (const project of startingProjects ?? []) {
    await updatePipelineStage(project.id, 'produksjon', supabase)
    startedProduksjon.push(project.id)
  }

  // produksjon -> post_prod: opptaksperioden er over.
  const { data: endingProjects, error: endingError } = await supabase
    .from('projects')
    .select('id')
    .eq('pipeline_stage', 'produksjon')
    .or(`shoot_end.lt.${today},and(shoot_end.is.null,shoot_start.lt.${today})`)

  if (endingError) {
    console.error('advance-produksjon: produksjon-query feilet', endingError)
    return Response.json({ error: 'DB error' }, { status: 500 })
  }

  const advanced: string[] = []
  for (const project of endingProjects ?? []) {
    await updatePipelineStage(project.id, 'post_prod', supabase)
    advanced.push(project.id)
  }

  return Response.json({ ok: true, startedProduksjon, advanced })
}
