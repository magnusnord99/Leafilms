import { NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { runMarketAnalysis } from '@/lib/services/market-analysis-agent'
import { requireAdmin } from '@/lib/auth/admin'

export const maxDuration = 300

export async function GET() {
  try {
    const supabase = await createClient()
    const admin = await requireAdmin(supabase)
    if (admin.errorResponse) return admin.errorResponse

    const serviceClient = createServiceClient()
    const { data, error } = await serviceClient
      .from('market_analyses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return Response.json({ error: 'Kunne ikke hente analyse' }, { status: 500 })
    }

    return Response.json({ analysis: data })
  } catch (err) {
    console.error('GET /market-analysis error:', err)
    return Response.json({ error: 'Serverfeil' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = await requireAdmin(supabase)
    if (admin.errorResponse) return admin.errorResponse

    const body = await req.json().catch(() => ({}))
    const triggeredBy = body.triggered_by || 'manual'

    const serviceClient = createServiceClient()

    const { data: record, error: insertError } = await serviceClient
      .from('market_analyses')
      .insert({ status: 'running', triggered_by: triggeredBy })
      .select()
      .single()

    if (insertError) {
      return Response.json({ error: 'Kunne ikke opprette analyse' }, { status: 500 })
    }

    try {
      const results = await runMarketAnalysis()

      await serviceClient
        .from('market_analyses')
        .update({ status: 'done', results, completed_at: new Date().toISOString() })
        .eq('id', record.id)

      return Response.json({ analysis: { ...record, status: 'done', results } })
    } catch (agentError) {
      const message = agentError instanceof Error ? agentError.message : String(agentError)
      await serviceClient
        .from('market_analyses')
        .update({ status: 'error', error_message: message, completed_at: new Date().toISOString() })
        .eq('id', record.id)

      return Response.json({ error: `Agentfeil: ${message}` }, { status: 500 })
    }
  } catch (err) {
    console.error('POST /market-analysis error:', err)
    return Response.json({ error: 'Serverfeil' }, { status: 500 })
  }
}
