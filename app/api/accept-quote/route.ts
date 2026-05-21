import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getContractPath } from '@/lib/storage/paths'
import { getQuotePath } from '@/lib/storage/paths'
import type { QuoteBuilderData } from '@/lib/types'
import { generateQuotePDF } from '../generate-quote-pdf/pdf-generator'

function isQuoteBuilderData(value: unknown): value is QuoteBuilderData {
  if (!value || typeof value !== 'object') return false

  const data = value as Partial<QuoteBuilderData>
  return (
    Array.isArray(data.crew) &&
    Array.isArray(data.equipment) &&
    Array.isArray(data.postProduction) &&
    Array.isArray(data.otherCosts) &&
    Array.isArray(data.licensing)
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { projectId, quoteId, shareToken, acceptedBy } = body

    if (!projectId || !quoteId || !shareToken) {
      return NextResponse.json(
        { error: 'Mangler påkrevd informasjon' },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const trimmedToken = String(shareToken).trim()

    const { data: share, error: shareError } = await supabase
      .from('project_shares')
      .select('project_id, expires_at')
      .eq('token', trimmedToken)
      .eq('project_id', projectId)
      .single()

    if (
      shareError ||
      !share ||
      (share.expires_at && new Date(share.expires_at).getTime() < Date.now())
    ) {
      return NextResponse.json(
        { error: 'Ugyldig eller utløpt delingslenke' },
        { status: 403 }
      )
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
      .single()

    if (projectError || !project || project.status !== 'published') {
      console.error('Error fetching project:', projectError)
      return NextResponse.json(
        { error: 'Kunne ikke hente prosjektinfo' },
        { status: 404 }
      )
    }

    // Hent kundeinfo separat hvis customer_id finnes
    let customerName = project?.title || 'Ukjent'
    if (project?.customer_id) {
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

    // Bruk lagret tilbudsdata fra databasen, ikke klientens konverterte visningsdata.
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('id, version, quote_data')
      .eq('id', quoteId)
      .eq('project_id', projectId)
      .single()

    if (quoteError || !quote || !isQuoteBuilderData(quote.quote_data)) {
      console.error('Error fetching quote:', quoteError)
      return NextResponse.json(
        { error: 'Kunne ikke hente tilbud' },
        { status: 500 }
      )
    }

    const acceptedAt = new Date().toISOString()
    const quoteData = quote.quote_data

    // 1. Generer og lagre tilbud-PDF i Storage
    let quotePdfPath: string | null = null
    try {
      const pdfBuffer = await generateQuotePDF(quoteData, {
        language: quoteData.language || 'NO',
        includeVat: quoteData.includeVat,
      })
      const projectName = (quoteData.projectName || 'Prosjekt')
        .replace(/[^a-zA-Z0-9æøåÆØÅ\s_-]/g, '')
        .replace(/\s+/g, '_')
      const client = (quoteData.clientContact || '')
        .replace(/[^a-zA-Z0-9æøåÆØÅ\s_-]/g, '')
        .replace(/\s+/g, '_')
      const version = quoteData.version || quote.version || 'V1'
      const date = new Date().toISOString().split('T')[0]
      const filename = `Pristilbud_${projectName}${client ? '_' + client : ''}_${version}_${date}.pdf`

      const storagePath = getQuotePath(customerName, projectTitle, filename, version)
      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (uploadError) throw uploadError
      quotePdfPath = storagePath
      console.log('✅ Tilbud-PDF lagret:', storagePath)
    } catch (pdfError: any) {
      console.error('Error generating quote PDF:', pdfError)
      return NextResponse.json(
        { error: pdfError.message || 'Kunne ikke generere tilbud-PDF' },
        { status: 500 }
      )
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
          accepted_by: acceptedBy,
          quote_pdf_path: quotePdfPath // Lagre path til tilbud-PDF
        }
      })
      .select()
      .single()

    if (contractError) {
      console.error('Error creating contract:', contractError)
      return NextResponse.json(
        { error: 'Kunne ikke opprette kontrakt' },
        { status: 500 }
      )
    }

    const { data: acceptedQuote, error: updateQuoteError } = await supabase
      .from('quotes')
      .update({
        status: 'accepted',
        accepted_at: acceptedAt,
        accepted_by: acceptedBy || null,
        pdf_path: quotePdfPath,
      })
      .eq('id', quote.id)
      .select()
      .single()

    if (updateQuoteError) {
      console.error('Error marking quote as accepted:', updateQuoteError)
      await supabase.from('contracts').delete().eq('id', contract.id)
      return NextResponse.json(
        { error: 'Kunne ikke markere tilbud som akseptert' },
        { status: 500 }
      )
    }

    // 3. Generer kontrakt PDF (TODO: implementer kontrakt-generering)
    // For nå returnerer vi bare contract ID, PDF-generering kan legges til senere

    return NextResponse.json({
      success: true,
      quote: acceptedQuote,
      contract: contract,
      quotePdfPath: quotePdfPath,
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

