import { NextRequest, NextResponse } from 'next/server'
import { getQuoteApiToken } from '@/lib/auth/quote-api-auth'
import { createClient } from '@/lib/supabase-server'
import { getQuotePath } from '@/lib/storage/paths'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { 
      url, 
      quoteData, // Hvis data allerede er hentet (fra fetch-quote)
      projectId, // For å lagre PDF i riktig mappe
      language = 'NO', 
      reise = 'y', 
      mva = 'y', 
      discount_percent = 0,
      saveToStorage = false // Om PDF skal lagres i Storage
    } = body

    const backendUrl = process.env.QUOTE_API_URL
    
    // Hent session fra Supabase (hvis brukeren er logget inn)
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    // Hent token fra auth service (støtter både service token og user session)
    const apiToken = await getQuoteApiToken(session)
    
    if (!backendUrl) {
      return NextResponse.json(
        { error: 'Backend URL ikke konfigurert. Sett QUOTE_API_URL i .env' },
        { status: 500 }
      )
    }
    
    if (!apiToken) {
      console.error('❌ QUOTE_API_TOKEN ikke satt i environment variables')
      return NextResponse.json(
        { error: 'API Token ikke konfigurert. Sett QUOTE_API_TOKEN i .env.local' },
        { status: 500 }
      )
    }
    
    console.log('🔐 Using API token:', apiToken.substring(0, 10) + '...')

    // Python API-et bruker Authorization: Bearer
    const makeRequest = async (endpoint: string, body: any): Promise<Response> => {
      const headers: HeadersInit = {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
      
      return await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      })
    }

    let response: Response

    // OPTIMAL FLYTE: Hvis vi allerede har data, bruk det nye endpointet
    // Dette unngår å hente data på nytt
    if (quoteData) {
      console.log('📤 Bruker /api/quotes/pdf med eksisterende data (optimal flyt)')
      
      // Hvis quoteData har _originalData, bruk det (riktig format for Python API)
      const dataToSend = quoteData._originalData || quoteData
      
      response = await makeRequest('/api/quotes/pdf', {
        data: dataToSend,
        language,
        reise,
        mva,
        discount_percent
      })
    } else if (url) {
      // Fallback: Hvis vi ikke har data, bruk gammel metode (henter data automatisk)
      console.log('📤 Bruker /generate-pdf (fallback - henter data automatisk)')
      response = await makeRequest('/generate-pdf', {
        url,
        language,
        reise,
        mva,
        discount_percent
      })
    } else {
      return NextResponse.json(
        { error: 'Enten Google Sheets URL eller quoteData må være satt' },
        { status: 400 }
      )
    }

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Python API error:', errorText)
      throw new Error(`API feilet: ${response.statusText}`)
    }

    const pdfBlob = await response.blob()

    // Hent filename fra headers
    const contentDisposition = response.headers.get('Content-Disposition')
    const xFilename = response.headers.get('X-Filename')
    let filename = `pristilbud_${language}_${Date.now()}.pdf`
    
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/)
      if (filenameMatch) {
        filename = filenameMatch[1]
      }
    } else if (xFilename) {
      filename = xFilename
    }

    // Lagre PDF i Storage hvis projectId er oppgitt og saveToStorage er true
    let storagePath: string | null = null
    if (saveToStorage && projectId) {
      try {
        // Hent prosjekt og kundeinfo (bruk samme supabase client)
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .select('id, title, customer_id')
          .eq('id', projectId)
          .single()

        if (!projectError && project) {
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
          
          // Hent versjon fra quoteData hvis tilgjengelig
          const version = quoteData?.version || 'V1'
          
          // Generer unikt filnavn basert på prosjekttittel og versjon
          const sanitizedProjectTitle = projectTitle
            .toLowerCase()
            .replace(/æ/g, 'ae')
            .replace(/ø/g, 'o')
            .replace(/å/g, 'aa')
            .replace(/[^a-z0-9]+/g, '_')
            .substring(0, 30)
          
          const uniqueFilename = filename || `pristilbud_${sanitizedProjectTitle}_${version}_${Date.now()}.pdf`
          storagePath = getQuotePath(customerName, projectTitle, uniqueFilename, version)
          
          console.log('📁 Lagrer PDF til:', storagePath)
          console.log('   Kunde:', customerName)
          console.log('   Prosjekt:', projectTitle)
          console.log('   Versjon:', version)
          
          // Konverter blob til ArrayBuffer for upload
          const arrayBuffer = await pdfBlob.arrayBuffer()
          
          // Last opp til Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from('assets')
            .upload(storagePath, arrayBuffer, {
              contentType: 'application/pdf',
              upsert: true // Overskriv hvis filen allerede finnes
            })

          if (uploadError) {
            console.error('❌ Error uploading PDF to storage:', uploadError)
            // Fortsett selv om upload feiler - returner PDF uansett
          } else {
            console.log('✅ PDF lagret i Storage:', storagePath)
          }
        }
      } catch (storageError) {
        console.error('Error saving PDF to storage:', storageError)
        // Fortsett uansett - returner PDF til brukeren
      }
    }

    // Returner PDF som blob
    return new NextResponse(pdfBlob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Filename': filename,
        ...(storagePath && { 'X-Storage-Path': storagePath })
      }
    })
  } catch (error: any) {
    console.error('Error generating PDF:', error)
    return NextResponse.json(
      { error: error.message || 'Kunne ikke generere PDF' },
      { status: 500 }
    )
  }
}

