import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getContractPath, getQuotePath } from '@/lib/storage/paths'
import { generateQuotePDF } from '@/app/api/generate-quote-pdf/pdf-generator'
import type { QuoteBuilderData } from '@/lib/types'

function isBuilderData(data: unknown): data is QuoteBuilderData {
  return Boolean(
    data &&
    typeof data === 'object' &&
    Array.isArray((data as QuoteBuilderData).crew) &&
    Array.isArray((data as QuoteBuilderData).equipment) &&
    Array.isArray((data as QuoteBuilderData).postProduction) &&
    Array.isArray((data as QuoteBuilderData).otherCosts) &&
    Array.isArray((data as QuoteBuilderData).licensing)
  )
}

function sanitizeFilenamePart(value: string) {
  return value
    .replace(/[^a-zA-Z0-9æøåÆØÅ\s_-]/g, '')
    .replace(/\s+/g, '_')
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

    const { data: share, error: shareError } = await supabase
      .from('project_shares')
      .select('project_id')
      .eq('token', shareToken)
      .eq('project_id', projectId)
      .single()

    if (shareError || !share) {
      return NextResponse.json(
        { error: 'Ugyldig delingslenke' },
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

    if (projectError) {
      console.error('Error fetching project:', projectError)
      return NextResponse.json(
        { error: 'Kunne ikke hente prosjektinfo' },
        { status: 500 }
      )
    }

    if (project.status !== 'published') {
      return NextResponse.json(
        { error: 'Prosjektet er ikke publisert' },
        { status: 403 }
      )
    }

    const projectTitle = project.title || 'Ukjent'

    // 1. Aksepter det lagrede tilbudet som ble vist for denne delingslenken.
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by: acceptedBy || null,
      })
      .eq('id', quoteId)
      .eq('project_id', projectId)
      .select()
      .single()

    if (quoteError) {
      console.error('Error accepting quote:', quoteError)
      return NextResponse.json(
        { error: 'Kunne ikke akseptere tilbud' },
        { status: 500 }
      )
    }

    // 2. Generer og lagre tilbud-PDF i Storage
    let quotePdfPath: string | null = null
    const builderData = quote.quote_data
    if (isBuilderData(builderData)) {
      try {
        const pdfBuffer = await generateQuotePDF(builderData, {
          language: builderData.language || 'NO',
          includeVat: builderData.includeVat,
        })
        const projectName = sanitizeFilenamePart(builderData.projectName || 'Prosjekt')
        const client = sanitizeFilenamePart(builderData.clientContact || '')
        const version = builderData.version || 'V1'
        const date = new Date().toISOString().split('T')[0]
        const filename = `Pristilbud_${projectName}${client ? '_' + client : ''}_${version}_${date}.pdf`
        const storagePath = getQuotePath(customerName, projectTitle, filename, version)

        const { error: uploadError } = await supabase.storage
          .from('assets')
          .upload(storagePath, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true,
          })

        if (uploadError) {
          console.error('Storage upload error:', uploadError)
        } else {
          quotePdfPath = storagePath
          await supabase.from('quotes').update({ pdf_path: storagePath }).eq('id', quote.id)
        }
      } catch (pdfError) {
        console.error('Error generating quote PDF:', pdfError)
        // Contract creation should not be blocked by a storage/PDF failure.
      }
    }

    // 3. Opprett kontrakt
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
          accepted_at: new Date().toISOString(),
          accepted_by: acceptedBy,
          quote_pdf_path: quotePdfPath // Lagre path til tilbud-PDF
        }
      })
      .select()
      .single()

    if (contractError) {
      console.error('Error creating contract:', contractError)
      await supabase
        .from('quotes')
        .update({
          status: 'draft',
          accepted_at: null,
          accepted_by: null,
        })
        .eq('id', quote.id)
      return NextResponse.json(
        { error: 'Kunne ikke opprette kontrakt' },
        { status: 500 }
      )
    }

    // 4. Generer kontrakt PDF (TODO: implementer kontrakt-generering)
    // For nå returnerer vi bare contract ID, PDF-generering kan legges til senere

    return NextResponse.json({
      success: true,
      quote: quote,
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

