import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

// Henter gjeldende tilbud for et prosjekt, verifisert mot delelenken —
// brukt av den offentlige pitch-siden (QuoteSection), som ikke lenger har
// direkte anon RLS-tilgang til quotes-tabellen.
export async function POST(req: NextRequest) {
  try {
    const { projectId, shareToken } = await req.json()

    if (!projectId || !shareToken) {
      return NextResponse.json({ error: 'Mangler projectId eller shareToken' }, { status: 400 })
    }

    const supabase = createServiceClient()

    const { data: share, error: shareError } = await supabase
      .from('project_shares')
      .select('project_id')
      .eq('token', shareToken)
      .eq('project_id', projectId)
      .single()

    if (shareError || !share) {
      return NextResponse.json({ error: 'Ugyldig delelenke for dette prosjektet' }, { status: 403 })
    }

    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, quote_data, selected_addon_ids')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (quoteError) {
      console.error('[quotes/current] Error fetching quote:', quoteError)
      return NextResponse.json({ error: 'Kunne ikke hente tilbud' }, { status: 500 })
    }

    return NextResponse.json({ quote: quote ?? null })
  } catch (error) {
    console.error('[quotes/current] Unexpected error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ukjent feil' },
      { status: 500 }
    )
  }
}
