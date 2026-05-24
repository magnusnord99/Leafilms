import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getContractPath } from '@/lib/storage/paths'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { projectId, quoteId, shareToken, acceptedBy } = body
    const normalizedShareToken = typeof shareToken === 'string' ? shareToken.trim() : ''
    const normalizedAcceptedBy = typeof acceptedBy === 'string' && acceptedBy.trim()
      ? acceptedBy.trim()
      : null

    if (!projectId || !quoteId || !normalizedShareToken) {
      return NextResponse.json(
        { error: 'Mangler påkrevd informasjon' },
        { status: 400 }
      )
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: 'Service role key is required for quote acceptance' },
        { status: 500 }
      )
    }

    const supabase = createServiceClient()

    // Validate that this public request came from the active share link.
    const { data: share, error: shareError } = await supabase
      .from('project_shares')
      .select('project_id')
      .eq('token', normalizedShareToken)
      .eq('project_id', projectId)
      .maybeSingle()

    if (shareError) {
      console.error('Error validating share token:', shareError)
      return NextResponse.json(
        { error: 'Kunne ikke validere delingslenke' },
        { status: 500 }
      )
    }

    if (!share) {
      return NextResponse.json({ error: 'Ugyldig delingslenke' }, { status: 403 })
    }

    // Hent prosjekt og kundeinfo for å bygge filsti
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        id,
        title,
        customer_id,
        status
      `)
      .eq('id', projectId)
      .maybeSingle()

    if (projectError) {
      console.error('Error fetching project:', projectError)
      return NextResponse.json(
        { error: 'Kunne ikke hente prosjektinfo' },
        { status: 500 }
      )
    }

    if (!project || project.status !== 'published') {
      return NextResponse.json({ error: 'Prosjektet er ikke publisert' }, { status: 403 })
    }

    // Hent kundeinfo separat hvis customer_id finnes
    let customerName = project.title || 'Ukjent'
    if (project.customer_id) {
      const { data: customer } = await supabase
        .from('customers')
        .select('name')
        .eq('id', project.customer_id)
        .single()
      
      if (customer) {
        customerName = customer.name
      }
    }

    const projectTitle = project.title || 'Ukjent'

    // Load the stored quote instead of trusting client-submitted pricing data.
    const { data: storedQuote, error: quoteFetchError } = await supabase
      .from('quotes')
      .select('id, project_id, status, accepted_at, accepted_by, pdf_path, quote_data')
      .eq('id', quoteId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (quoteFetchError) {
      console.error('Error fetching quote:', quoteFetchError)
      return NextResponse.json(
        { error: 'Kunne ikke hente tilbud' },
        { status: 500 }
      )
    }

    if (!storedQuote?.quote_data) {
      return NextResponse.json({ error: 'Tilbud ikke funnet' }, { status: 404 })
    }

    const acceptedAt = new Date().toISOString()

    // 1. Marker eksisterende quote som akseptert
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .update({
        status: 'accepted',
        accepted_at: acceptedAt,
        accepted_by: normalizedAcceptedBy,
      })
      .eq('id', storedQuote.id)
      .select()
      .single()

    if (quoteError) {
      console.error('Error creating quote:', quoteError)
      return NextResponse.json(
        { error: 'Kunne ikke opprette tilbud' },
        { status: 500 }
      )
    }

    const { data: existingContract } = await supabase
      .from('contracts')
      .select('*')
      .eq('quote_id', quote.id)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingContract) {
      return NextResponse.json({
        success: true,
        quote,
        contract: existingContract,
        quotePdfPath: quote.pdf_path,
        contractPdfPath: existingContract.pdf_path,
        message: 'Tilbud akseptert og kontrakt opprettet'
      })
    }

    // 2. Opprett kontrakt
    const contractPdfPath = getContractPath(customerName, projectTitle)
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert({
        quote_id: quote.id,
        project_id: projectId,
        pdf_path: contractPdfPath, // Path hvor kontrakt-PDF vil ligge (når den genereres)
        status: 'pending', // Ventende på signering
        signature_data: {
          quote_accepted: true,
          accepted_at: acceptedAt,
          accepted_by: normalizedAcceptedBy,
          share_token: normalizedShareToken,
          quote_pdf_path: quote.pdf_path
        }
      })
      .select()
      .single()

    if (contractError) {
      console.error('Error creating contract:', contractError)
      await supabase
        .from('quotes')
        .update({
          status: storedQuote.status,
          accepted_at: storedQuote.accepted_at,
          accepted_by: storedQuote.accepted_by,
        })
        .eq('id', quote.id)
      return NextResponse.json(
        { error: 'Kunne ikke opprette kontrakt' },
        { status: 500 }
      )
    }

    // 3. Generer kontrakt PDF (TODO: implementer kontrakt-generering)
    // For nå returnerer vi bare contract ID, PDF-generering kan legges til senere

    return NextResponse.json({
      success: true,
      quote: quote,
      contract: contract,
      quotePdfPath: quote.pdf_path,
      contractPdfPath: contractPdfPath,
      message: 'Tilbud akseptert og kontrakt opprettet'
    })
  } catch (error: any) {
    console.error('Error accepting quote:', error)
    return NextResponse.json(
      { error: error.message || 'Kunne ikke akseptere tilbud' },
      { status: 500 }
    )
  }
}

