import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { runMarketAnalysis } from '@/lib/services/market-analysis-agent'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceClient = createServiceClient()

  const { data: record, error: insertError } = await serviceClient
    .from('market_analyses')
    .insert({ status: 'running', triggered_by: 'cron' })
    .select()
    .single()

  if (insertError) {
    console.error('Cron: could not create analysis record', insertError)
    return Response.json({ error: 'DB error' }, { status: 500 })
  }

  try {
    const results = await runMarketAnalysis()

    await serviceClient
      .from('market_analyses')
      .update({ status: 'done', results, completed_at: new Date().toISOString() })
      .eq('id', record.id)

    return Response.json({ ok: true, leads: results.customers.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await serviceClient
      .from('market_analyses')
      .update({ status: 'error', error_message: message, completed_at: new Date().toISOString() })
      .eq('id', record.id)

    console.error('Cron markedsanalyse feilet:', message)
    return Response.json({ error: message }, { status: 500 })
  }
}
