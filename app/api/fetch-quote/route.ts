import { NextRequest, NextResponse } from 'next/server'
import { getQuoteApiToken } from '@/lib/auth/quote-api-auth'
import { createClient } from '@/lib/supabase-server'

// Denne ruten proxyer det eldre Google Sheets/Python-baserte tilbudsflyten
// (grouped_sums/total_excl_mva) — ikke QuoteBuilderData, så calculateQuoteTotals()
// fra lib/quote-builder-utils.ts gjelder ikke her. Definert ett sted i stedet
// for å hardkode 25 % to steder i samme fil.
const QUOTE_VAT_RATE = 25

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { 
      url, 
      language = 'NO', 
      reise = 'y', 
      mva = 'y', 
      discount_percent = 0
    } = body

    if (!url) {
      return NextResponse.json(
        { error: 'Google Sheets URL mangler' },
        { status: 400 }
      )
    }

    const backendUrl = process.env.QUOTE_API_URL
    
    // Hent session fra Supabase (hvis brukeren er logget inn)
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    // Hent token fra auth service (støtter både service token og user session)
    const apiToken = await getQuoteApiToken(session)
    
    if (!backendUrl) {
      console.error('❌ QUOTE_API_URL ikke satt i environment variables')
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
    
    // Prøv først det nye endpointet /api/quotes/data
    // Hvis det ikke finnes (404), fallback til å bruke /generate-pdf og parse PDF
    const jsonUrl = `${backendUrl}/api/quotes/data`

    // Python API-et bruker Authorization: Bearer (bekreftet via curl-test)
    const headers: HeadersInit = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
    
    let response: Response
    try {
      response = await fetch(jsonUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          url
          // Note: language, reise, mva, discount_percent er ikke i request body
          // for /api/quotes/data - de brukes kun for PDF-generering
        })
      })
      
      // Hvis 404, betyr det at det nye endpointet ikke finnes ennå
      if (response.status === 404) {
        return NextResponse.json(
          { 
            error: 'JSON-endpoint ikke tilgjengelig ennå. Python API-et må oppdateres med /api/quotes/data endpoint. Bruk "Last ned som PDF" i mellomtiden.',
            _fallbackAvailable: true
          },
          { status: 404 }
        )
      }
    } catch (fetchError) {
      console.error('❌ Fetch error:', fetchError)
      return NextResponse.json(
        { error: `Kunne ikke koble til backend API: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}` },
        { status: 500 }
      )
    }

    if (!response.ok) {
      let errorMessage = `API feilet: ${response.statusText}`
      
      try {
        const errorText = await response.text()
        console.error('❌ Python API error response:', errorText)
        
        // Prøv å parse som JSON
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.detail || errorJson.error || errorJson.message || errorMessage
          
          // Spesifikk melding hvis endpoint ikke finnes
          if (response.status === 404 || errorMessage.includes('Not Found')) {
            errorMessage = 'JSON-endpoint (/api/quotes/data) ikke tilgjengelig. Sjekk at Python API-et er oppdatert med den nye strukturen.'
          }
          
          // Spesifikk melding hvis autentisering feiler
          if (response.status === 401 || response.status === 403 || errorMessage.includes('credentials') || errorMessage.includes('validate') || errorMessage.includes('authenticated')) {
            errorMessage = `🔐 Autentisering feilet!

Token-en i .env.local matcher IKKE token-en i Cloud Run.

Sjekk:
1. Gå til Google Cloud Console → Cloud Run → pristilbud-backend → Edit
2. Se på "Variables & Secrets" → finn miljøvariabelen (sannsynligvis "API_KEY")
3. Kopier verdien EXAKT (inkludert alle tegn)
4. Sett den i .env.local som QUOTE_API_TOKEN
5. Restart Next.js serveren

Nåværende token (første 20 tegn): ${apiToken.substring(0, 20)}...

Test med curl for å verifisere:
curl -X POST ${backendUrl}/api/quotes/data \\
  -H "Authorization: Bearer [DIN_TOKEN_HER]" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"test"}'

Hvis curl fungerer, men Next.js ikke fungerer, er token-en i .env.local feil.`
          }
        } catch {
          // Hvis ikke JSON, bruk teksten direkte
          errorMessage = errorText || errorMessage
        }
      } catch (e) {
        console.error('Kunne ikke lese error response:', e)
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status || 500 }
      )
    }

    type QuoteApiResponse = {
      details?: Record<string, string | undefined>
      grouped_sums?: [string, number][]
      total_days?: number
      total_excl_mva?: number
      total_incl_mva?: number
    }
    let data: QuoteApiResponse
    try {
      const contentType = response.headers.get('content-type')
      if (!contentType?.includes('application/json')) {
        const text = await response.text()
        console.error('❌ Uventet content-type:', contentType)
        console.error('Response body:', text.substring(0, 200))
        return NextResponse.json(
          { error: 'Backend API returnerte ikke JSON. Sjekk at /api/quotes/data endpoint eksisterer.' },
          { status: 500 }
        )
      }
      
      data = await response.json()
    } catch (parseError) {
      console.error('❌ Kunne ikke parse JSON:', parseError)
      return NextResponse.json(
        { error: `Kunne ikke parse respons: ${parseError instanceof Error ? parseError.message : String(parseError)}` },
        { status: 500 }
      )
    }

    // Transform data fra Python API format til QuoteSection format
    // Python API returnerer:
    // {
    //   grouped_sums: [["Kategori", amount], ...],
    //   total_days: number,
    //   details: { "Kunde": "...", "Prosjekt": "...", ... },
    //   company_info: { "Adresse": "...", ... },
    //   total_excl_mva: number,
    //   total_incl_mva: number,
    //   ...
    // }
    
    // Transform til QuoteSection format:
    const transformedData = {
      // Prosjektinfo fra details
      version: data.details?.Versjon || data.details?.version || 'V1',
      quoteDate: data.details?.['Tilbud dato'] || data.details?.quote_date || new Date().toISOString().split('T')[0],
      projectName: data.details?.Prosjekt || data.details?.project || '',
      reference: data.details?.Referanse || data.details?.reference || '',
      clientContact: data.details?.Kunde || data.details?.client || '',
      customerNumber: data.details?.['Kundenummer'] || data.details?.customer_number || '',
      ourContact: data.details?.['Vår kontakt'] || data.details?.our_contact || '',
      paymentInfo: data.details?.['Betalings info'] || data.details?.payment_info || '',
      deliveryDate: data.details?.['Levering dato'] || data.details?.delivery_date || '',
      
      // Line items fra grouped_sums
      lineItems: (data.grouped_sums || []).map(([category, amount]: [string, number]) => ({
        description: category,
        quantity: data.total_days ? `${data.total_days} dager` : '1 stk',
        amount: amount || 0
      })),
      
      // Totaler
      subtotalExclVat: data.total_excl_mva || 0,
      subtotalInclVat: data.total_incl_mva || 0,
      finalPriceExclVat: data.total_excl_mva || 0,
      finalPriceInclVat: data.total_incl_mva || 0,
      totalDiscount: 0, // Beregnes senere hvis discount_percent er satt
      vatRate: QUOTE_VAT_RATE,
      
      // Vilkår (kan legges til i details hvis tilgjengelig)
      terms: data.details?.Vilkår || data.details?.terms || '',
      
      // Behold original data for PDF-generering
      _originalData: data
    }

    // Beregn rabatt hvis satt
    if (discount_percent > 0) {
      const discountAmount = (transformedData.subtotalExclVat * discount_percent) / 100
      transformedData.totalDiscount = discountAmount
      transformedData.finalPriceExclVat = transformedData.subtotalExclVat - discountAmount
      transformedData.finalPriceInclVat = mva === 'y'
        ? transformedData.finalPriceExclVat * (1 + QUOTE_VAT_RATE / 100)
        : transformedData.finalPriceExclVat
    }

    return NextResponse.json(transformedData)
  } catch (error) {
    console.error('Error fetching quote:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Kunne ikke hente tilbud' },
      { status: 500 }
    )
  }
}

