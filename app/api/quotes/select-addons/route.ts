import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import type { QuoteBuilderData } from '@/lib/types'

// Lagrer kundens avhukede valgfrie tillegg på gjeldende tilbud, verifisert mot
// delelenken — slik at haker overlever en sideoppdatering (jf. quotes/current).
export async function POST(req: NextRequest) {
  try {
    const { projectId, shareToken, selectedAddonIds } = await req.json()

    if (!projectId || !shareToken || !Array.isArray(selectedAddonIds)) {
      return NextResponse.json({ error: 'Ugyldig forespørsel' }, { status: 400 })
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
      .select('id, quote_data')
      .eq('project_id', projectId)
      .eq('is_current', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (quoteError || !quote) {
      return NextResponse.json({ error: 'Fant ikke tilbud' }, { status: 404 })
    }

    // Godta kun id-er som faktisk finnes blant tilbudets tillegg
    const validIds = new Set(
      ((quote.quote_data as QuoteBuilderData | null)?.optionalAddons ?? []).map((a) => a.id)
    )
    const cleanIds = selectedAddonIds.filter(
      (id: unknown): id is string => typeof id === 'string' && validIds.has(id)
    )

    const { error: updateError } = await supabase
      .from('quotes')
      .update({ selected_addon_ids: cleanIds })
      .eq('id', quote.id)

    if (updateError) {
      console.error('[quotes/select-addons] update error:', updateError)
      return NextResponse.json({ error: 'Kunne ikke lagre valg' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[quotes/select-addons] Unexpected error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Ukjent feil' },
      { status: 500 }
    )
  }
}
