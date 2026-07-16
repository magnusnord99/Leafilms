import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import type { OurSignature, QuoteBuilderData } from '@/lib/types'
import { generateContractPDF, type CustomerSignature } from '../pdf-generator'
import { calculateQuoteTotals } from '@/lib/quote-builder-utils'
import { buildContractTextWithAddons } from '@/lib/contract-addendum'

// Admin-only: last ned kontrakten som PDF før kunden har signert (eller etterpå) —
// slik at Leafilms kan se nøyaktig hva kunden vil se, med vår egen signatur påført.
export async function POST(req: NextRequest) {
  try {
    const { projectId } = await req.json()
    if (!projectId) {
      return NextResponse.json({ error: 'Mangler projectId' }, { status: 400 })
    }

    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    const { data: profile } = user
      ? await authClient.from('profiles').select('role').eq('id', user.id).single()
      : { data: null }
    if (!user || profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceClient()
    const { data: contract, error } = await supabase
      .from('contracts')
      .select('contract_text, our_signature, status, signed_at, signed_by, signature_data')
      .eq('project_id', projectId)
      .single()

    if (error || !contract || !contract.contract_text) {
      return NextResponse.json({ error: 'Fant ingen kontrakttekst for dette prosjektet' }, { status: 404 })
    }

    // Speiler samme tillegg-patching som kunden ser på det publiserte tilbudet (og som
    // brukes ved faktisk signering, app/api/contracts/sign/route.ts) — uten dette viser
    // admin-nedlastingen den originale, upatchede summen fra publiseringstidspunktet.
    // Signerte kontrakter har allerede fått tillegg bakt inn i contract_text ved signering
    // (sign/route.ts) — patcher vi da på nytt her, telles tilleggene dobbelt.
    let contractText = contract.contract_text
    if (contract.status !== 'signed') {
      const { data: quote } = await supabase
        .from('quotes')
        .select('quote_data, selected_addon_ids')
        .eq('project_id', projectId)
        .eq('is_current', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const selectedAddonIds: string[] = Array.isArray(quote?.selected_addon_ids) ? quote.selected_addon_ids : []
      if (quote?.quote_data && Array.isArray((quote.quote_data as { crew?: unknown }).crew) && selectedAddonIds.length > 0) {
        const quoteData = quote.quote_data as QuoteBuilderData
        const selectedAddons = (quoteData.optionalAddons ?? []).filter((a) => selectedAddonIds.includes(a.id))
        if (selectedAddons.length > 0) {
          const discountFactor = quoteData.discountFactor ?? 0
          const baseTotals = calculateQuoteTotals(quoteData)
          contractText = buildContractTextWithAddons(contractText, baseTotals.afterDiscount, selectedAddons, discountFactor)
        }
      }
    }

    const signatureData = contract.signature_data as Record<string, unknown> | null
    const customerSignature: CustomerSignature | null =
      contract.status === 'signed' && signatureData
        ? {
            signerName: String(signatureData.signerName ?? ''),
            signerEmail: contract.signed_by ?? '',
            signedAt: contract.signed_at ?? '',
            ip: String(signatureData.ip ?? ''),
            signatureImage: String(signatureData.signatureImage ?? ''),
          }
        : null

    const pdfBuffer = await generateContractPDF(
      contractText,
      contract.our_signature as OurSignature | null,
      customerSignature
    )

    const { data: project } = await supabase
      .from('projects')
      .select('title')
      .eq('id', projectId)
      .single()

    const safeTitle = (project?.title || 'Prosjekt').replace(/[^a-zA-Z0-9æøåÆØÅ\s_-]/g, '').replace(/\s+/g, '_')
    const date = new Date().toISOString().split('T')[0]
    const filename = `Produksjonsavtale_${safeTitle}_${date}.pdf`

    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('contracts/download-pdf error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunne ikke generere PDF' },
      { status: 500 }
    )
  }
}
