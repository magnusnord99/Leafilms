import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getContractPath } from '@/lib/storage/paths'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { projectId, quoteData, acceptedBy } = body

    if (!projectId || !quoteData) {
      return NextResponse.json(
        { error: 'Mangler påkrevd informasjon' },
        { status: 400 }
      )
    }

    // Hent prosjekt og kundeinfo for å bygge filsti
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        id,
        title,
        customer_id
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

    const projectTitle = project.title || 'Ukjent'

    // 1. Opprett quote i databasen
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        project_id: projectId,
        sheet_url: quoteData.sheetsUrl || '',
        version: quoteData.version || 'V1',
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_by: acceptedBy || null,
        quote_data: quoteData
      })
      .select()
      .single()

    if (quoteError) {
      console.error('Error creating quote:', quoteError)
      return NextResponse.json(
        { error: 'Kunne ikke opprette tilbud' },
        { status: 500 }
      )
    }

    // 2. Generer og lagre tilbud-PDF i Storage
    let quotePdfPath: string | null = null
    try {
      // Kall generate-quote-pdf API for å generere PDF
      // Bruk quoteData direkte hvis den har riktig struktur
      const pdfResponse = await fetch(`${req.nextUrl.origin}/api/generate-quote-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quoteData: quoteData, // Send hele quoteData objektet
          projectId,
          language: quoteData.language || 'NO',
          reise: quoteData.reise || 'y',
          mva: quoteData.mva || 'y',
          discount_percent: quoteData.discount || 0,
          saveToStorage: true // Lagre i Storage
        })
      })

      if (pdfResponse.ok) {
        const storagePath = pdfResponse.headers.get('X-Storage-Path')
        if (storagePath) {
          quotePdfPath = storagePath
          console.log('✅ Tilbud-PDF lagret:', storagePath)
        }
      } else {
        const errorText = await pdfResponse.text()
        console.error('Error generating quote PDF:', errorText)
      }
    } catch (pdfError) {
      console.error('Error generating quote PDF:', pdfError)
      // Fortsett uansett - kontrakt kan opprettes uten PDF
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
      // Slett quote hvis kontrakt ikke kunne opprettes
      await supabase.from('quotes').delete().eq('id', quote.id)
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

