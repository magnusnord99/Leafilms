'use client'

import { useState, useEffect } from 'react'
import { Section, Project } from '@/lib/types'
import { Heading, Text, Button, Badge } from '@/components/ui'

type QuoteLineItem = {
  description: string
  quantity: string
  amount: number
  discount?: number
}

type QuoteData = {
  version?: string
  quoteDate?: string
  projectName?: string
  reference?: string
  clientContact?: string
  customerNumber?: string
  ourContact?: string
  paymentInfo?: string
  deliveryDate?: string
  terms?: string
  lineItems?: QuoteLineItem[]
  subtotalExclVat?: number
  subtotalInclVat?: number
  totalDiscount?: number
  finalPriceExclVat?: number
  finalPriceInclVat?: number
  vatRate?: number
}

type QuoteSectionProps = {
  section: Section
  project: Project
  editMode: boolean
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
}

export function QuoteSection({
  section,
  project,
  editMode,
  updateSectionContent
}: QuoteSectionProps) {
  const [loading, setLoading] = useState(false)
  const [acceptingQuote, setAcceptingQuote] = useState(false)
  const [quoteAccepted, setQuoteAccepted] = useState(false)
  const [contractId, setContractId] = useState<string | null>(null)
  
  // Eksempel-data for å vise hvordan det ser ut
  const exampleQuoteData: QuoteData = {
    version: 'V1',
    quoteDate: '2025-09-13',
    projectName: project.title || 'Shoot Nord-Norge',
    reference: 'Video produksjon',
    clientContact: project.client_name || 'Magnus Nordmo',
    customerNumber: '144',
    ourContact: 'Bea Valand',
    paymentInfo: '14 days',
    deliveryDate: '2025-09-17',
    terms: `Leafilms vil være ansvarlig for planleggingen, produksjonen og leveringen av prosjektet slik det er beskrevet i dette tilbudet.
Prosjektets omfang, tidslinje og leveranser avtales før produksjonen starter. Eventuelle endringer i omfanget underveis kan medføre ekstra kostnader.
Reise-, overnattings- og oppholdsutgifter for teamet er inkludert i budsjettet med mindre annet er spesifisert.
Dersom uforutsette omstendigheter (f.eks. ekstremvær eller andre faktorer utenfor Leafilms' kontroll) hindrer produksjonen i å gjennomføres som planlagt, vil alternative løsninger utarbeides i samråd med kunden. Eventuelle forsinkelser eller omlegginger kan medføre ekstra kostnader.
Kansellering innen 14 dager før startdato: 50 % av den avtalte prisen vil bli fakturert.
Kansellering innen 48 timer før startdato: 100 % av den avtalte prisen vil bli fakturert.
Leafilms beholder full opphavsrett til alt produsert materiale. Kunden gis bruksrettigheter for det avtalte formålet og prosjektet. Videre salg eller distribusjon er ikke tillatt uten skriftlig samtykke fra Leafilms. Leafilms må krediteres i henhold til bransjestandarder der materialet brukes, der det er praktisk mulig.
Alt materiale, inkludert opptak og prosjektfiler, vil bli levert til kunden som avtalt. Lagring og arkivering av materialet utover leveringsdatoen er kundens ansvar.
Fakturaen deles opp i to like betalinger. Den første halvparten faktureres ved signering av produksjonsavtalen, og den andre halvparten faktureres etter siste produksjonsdag. Vær oppmerksom på at forsinkede betalinger kan medføre ekstra gebyrer.`,
    lineItems: [
      { description: 'Kamerautstyr', quantity: '2 dager', amount: 6300.00, discount: 1260.00 },
      { description: 'Oppstart/planlegging', quantity: '1 dager', amount: 1500.00, discount: 300.00 },
      { description: 'Opptak', quantity: '2 dager', amount: 36600.00, discount: 7320.00 },
      { description: 'Post produksjon', quantity: '5 dager', amount: 43000.00, discount: 8600.00 },
      { description: 'Produksjonsutgifter', quantity: '2 dager', amount: 27100.00 }
    ],
    subtotalExclVat: 114500.00,
    subtotalInclVat: 143125.00,
    totalDiscount: 17480.00,
    finalPriceExclVat: 97020.00,
    finalPriceInclVat: 125645.00,
    vatRate: 25
  }

  const [quoteData, setQuoteData] = useState<QuoteData | null>(
    section.content.quoteData || (editMode ? exampleQuoteData : null)
  )
  const [sheetsUrl, setSheetsUrl] = useState(
    section.content.sheetsUrl || ''
  )
  const [language, setLanguage] = useState<'NO' | 'EN'>(
    section.content.language || 'NO'
  )
  const [reise, setReise] = useState<'y' | 'n'>(
    section.content.reise || 'y'
  )
  const [mva, setMva] = useState<'y' | 'n'>(
    section.content.mva || 'y'
  )
  const [discount, setDiscount] = useState<number>(
    section.content.discount || 0
  )


  // Hent quote-data fra API hvis URL er satt
  // NOTE: Dette krever at Python API har /generate-json endpoint
  const fetchQuoteData = async () => {
    if (!sheetsUrl) {
      alert('Google Sheets URL må være satt')
      return
    }

    setLoading(true)
    try {
      console.log('📤 Sender request til /api/fetch-quote med:', {
        url: sheetsUrl,
        language,
        reise,
        mva,
        discount_percent: discount
      })

      const response = await fetch('/api/fetch-quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: sheetsUrl,
          language,
          reise,
          mva,
          discount_percent: discount
        })
      })
      
      console.log('📥 Response status:', response.status, response.statusText)
      
      // Sjekk content-type før vi prøver å parse
      const contentType = response.headers.get('content-type')
      const isJson = contentType?.includes('application/json')
      
      if (!response.ok) {
        let errorMessage = 'Kunne ikke hente tilbud'
        
        if (isJson) {
          try {
            const error = await response.json()
            errorMessage = error.error || error.message || errorMessage
            
            // Spesifikk melding hvis endpoint ikke finnes
            if (errorMessage.includes('Not Found') || errorMessage.includes('404')) {
              errorMessage = 'JSON-endpoint ikke tilgjengelig. Bruk "Last ned som PDF" i stedet.'
            }
            
            // Spesifikk melding hvis autentisering feiler
            if (errorMessage.includes('credentials') || errorMessage.includes('validate') || errorMessage.includes('401') || errorMessage.includes('403')) {
              errorMessage = 'Autentisering feilet. Sjekk at QUOTE_API_TOKEN i .env.local matcher API_KEY i Cloud Run. Restart Next.js server etter endringer.'
            }
          } catch (e) {
            console.error('Kunne ikke parse error som JSON:', e)
          }
        } else {
          const errorText = await response.text()
          errorMessage = errorText || errorMessage
          console.error('Error response (text):', errorText)
        }
        
        throw new Error(errorMessage)
      }
      
      if (!isJson) {
        throw new Error('Uventet responsformat fra server')
      }
      
      const data = await response.json()
      console.log('✅ Mottatt data:', data)
      
      setQuoteData(data)
      updateSectionContent(section.id, 'quoteData', data)
      updateSectionContent(section.id, 'sheetsUrl', sheetsUrl)
      updateSectionContent(section.id, 'language', language)
      updateSectionContent(section.id, 'reise', reise)
      updateSectionContent(section.id, 'mva', mva)
      updateSectionContent(section.id, 'discount', discount)

      // Automatisk generer og lagre PDF når tilbud hentes
      await saveQuotePDF(data)
    } catch (error: any) {
      console.error('❌ Error fetching quote:', error)
      alert(error.message || 'Kunne ikke hente tilbud. Sjekk at Google Sheets URL er korrekt.')
    } finally {
      setLoading(false)
    }
  }

  // Lagre tilbud-PDF automatisk i prosjektmappen
  const saveQuotePDF = async (dataToSave?: typeof quoteData) => {
    const data = dataToSave || quoteData
    if (!data || !project.id) {
      console.log('⚠️ Kan ikke lagre PDF: mangler data eller project.id')
      return
    }

    // Sørg for at terms alltid er inkludert i PDF-en (selv om den ikke vises i UI)
    const dataWithTerms = {
      ...data,
      terms: data.terms || exampleQuoteData.terms
    }

    console.log('💾 Starter lagring av tilbud-PDF for prosjekt:', project.id, project.title)
    
    try {
      const response = await fetch('/api/generate-quote-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quoteData: dataWithTerms,
          projectId: project.id,
          language,
          reise,
          mva,
          discount_percent: discount,
          saveToStorage: true // Lagre automatisk i Storage
        })
      })

      if (response.ok) {
        const storagePath = response.headers.get('X-Storage-Path')
        if (storagePath) {
          console.log('✅ Tilbud-PDF lagret i prosjektmappen:', storagePath)
          
          // Opprett/oppdater quote i databasen
          const { supabase } = await import('@/lib/supabase')
          const version = data.version || 'V1'
          
          // Sjekk om quote allerede finnes (basert på project_id og version)
          const { data: existingQuotes } = await supabase
            .from('quotes')
            .select('id')
            .eq('project_id', project.id)
            .eq('version', version)

          const quoteDataToSave = {
            project_id: project.id,
            sheet_url: sheetsUrl,
            version: version,
            status: 'draft' as const,
            pdf_path: storagePath,
            quote_data: dataWithTerms // Inkluder terms i lagret data
          }

          if (existingQuotes && existingQuotes.length > 0) {
            // Oppdater eksisterende quote (bruk første match)
            const { error: updateError } = await supabase
              .from('quotes')
              .update(quoteDataToSave)
              .eq('id', existingQuotes[0].id)

            if (updateError) {
              console.error('❌ Error updating quote:', updateError)
            } else {
              console.log('✅ Quote oppdatert i databasen med PDF path:', storagePath)
            }
          } else {
            // Opprett ny quote
            const { error: insertError } = await supabase
              .from('quotes')
              .insert(quoteDataToSave)

            if (insertError) {
              console.error('❌ Error creating quote:', insertError)
            } else {
              console.log('✅ Quote opprettet i databasen med PDF path:', storagePath)
            }
          }
          
        } else {
          console.warn('⚠️ Ingen storage path returnert fra API - PDF ble ikke lagret')
        }
      } else {
        const errorText = await response.text()
        console.error('❌ Error generating PDF:', response.status, errorText)
      }
    } catch (error: any) {
      console.error('❌ Error saving quote PDF:', error)
      console.error('   Error details:', error.message, error.stack)
      // Ikke vis feil til brukeren - dette er bakgrunnsoperasjon
    }
  }

  const handleDownloadPDF = async () => {
    if (!sheetsUrl && !quoteData) {
      alert('Google Sheets URL må være satt, eller hent data først')
      return
    }

    try {
      // Sørg for at terms alltid er inkludert i PDF-en (selv om den ikke vises i UI)
      const quoteDataWithTerms = quoteData ? {
        ...quoteData,
        terms: quoteData.terms || exampleQuoteData.terms
      } : undefined

      // OPTIMAL FLYTE: Hvis vi allerede har data, send det direkte til PDF-generering
      // Dette unngår å hente data på nytt fra Google Sheets
      const response = await fetch('/api/generate-quote-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: quoteData ? undefined : sheetsUrl, // Kun send URL hvis vi ikke har data
          quoteData: quoteDataWithTerms, // Send eksisterende data med terms hvis tilgjengelig
          projectId: project.id, // For å lagre PDF i riktig mappe
          language,
          reise,
          mva,
          discount_percent: discount,
          saveToStorage: false // Brukeren laster ned, ikke lagrer automatisk
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Kunne ikke generere PDF')
      }
      
      const blob = await response.blob()
      
      // Hent filename fra headers
      const contentDisposition = response.headers.get('Content-Disposition')
      const xFilename = response.headers.get('X-Filename')
      let filename = `Pristilbud_${project.title || 'Prosjekt'}_${new Date().toISOString().split('T')[0]}.pdf`
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      } else if (xFilename) {
        filename = xFilename
      }
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error: any) {
      console.error('Error generating PDF:', error)
      alert(error.message || 'Kunne ikke generere PDF. Sjekk at URL-er er korrekte.')
    }
  }

  // Godta tilbud og opprett kontrakt
  const handleAcceptQuote = async () => {
    if (!quoteData || !project.id) {
      alert('Ingen tilbudsdata tilgjengelig')
      return
    }

    setAcceptingQuote(true)
    try {
      // Sørg for at terms alltid er inkludert
      const quoteDataWithTerms = {
        ...quoteData,
        terms: quoteData.terms || exampleQuoteData.terms,
        sheetsUrl
      }

      const response = await fetch('/api/accept-quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          projectId: project.id,
          quoteData: quoteDataWithTerms,
          acceptedBy: project.client_name || 'Kunde'
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Kunne ikke akseptere tilbud')
      }

      const result = await response.json()
      setQuoteAccepted(true)
      setContractId(result.contract?.id || null)
      
      // TODO: Her kan vi legge til signeringswidget (DocuSign, SignRequest, etc.)
      // For nå viser vi bare en bekreftelsesmelding
      
    } catch (error: any) {
      console.error('Error accepting quote:', error)
      alert('❌ Kunne ikke akseptere tilbud: ' + (error.message || 'Ukjent feil'))
    } finally {
      setAcceptingQuote(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('no-NO', {
      style: 'currency',
      currency: 'NOK',
      minimumFractionDigits: 2
    }).format(amount)
  }

  return (
    <div className="bg-background-widget max-w-full mx-auto py-12 px-4">
      {/* API Configuration (kun i edit mode) */}
      {editMode && (
        <div className="mb-6 p-4 bg-w rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark mb-2">
              Google Sheets URL
            </label>
            <input
              type="url"
              value={sheetsUrl}
              onChange={(e) => {
                setSheetsUrl(e.target.value)
                updateSectionContent(section.id, 'sheetsUrl', e.target.value)
              }}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-dark"
            />
            <p className="text-xs text-dark/60 mt-1">
              Backend API URL er konfigurert i server-side kode (QUOTE_API_URL i .env)
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-dark mb-2">
                Språk
              </label>
              <select
                value={language}
                onChange={(e) => {
                  setLanguage(e.target.value as 'NO' | 'EN')
                  updateSectionContent(section.id, 'language', e.target.value)
                }}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-dark"
              >
                <option value="NO">Norsk</option>
                <option value="EN">English</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-2">
                Reise
              </label>
              <select
                value={reise}
                onChange={(e) => {
                  setReise(e.target.value as 'y' | 'n')
                  updateSectionContent(section.id, 'reise', e.target.value)
                }}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-dark"
              >
                <option value="y">Ja</option>
                <option value="n">Nei</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-2">
                MVA
              </label>
              <select
                value={mva}
                onChange={(e) => {
                  setMva(e.target.value as 'y' | 'n')
                  updateSectionContent(section.id, 'mva', e.target.value)
                }}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-dark"
              >
                <option value="y">Ja</option>
                <option value="n">Nei</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-2">
                Rabatt (%)
              </label>
              <select
                value={discount}
                onChange={(e) => {
                  setDiscount(Number(e.target.value))
                  updateSectionContent(section.id, 'discount', Number(e.target.value))
                }}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-dark"
              >
                <option value={0}>0%</option>
                <option value={10}>10%</option>
                <option value={15}>15%</option>
                <option value={20}>20%</option>
                <option value={25}>25%</option>
                <option value={30}>30%</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              onClick={fetchQuoteData}
              disabled={loading || !sheetsUrl}
              variant="secondary"
              className="w-full"
            >
              {loading ? 'Henter...' : 'Hent tilbud (JSON)'}
            </Button>
            <p className="text-xs text-dark/60 text-center">
              ⚠️ JSON-endpoint (/api/quotes/data) må implementeres i Python API først. Bruk "Last ned som PDF" i mellomtiden.
            </p>
          </div>

        </div>
      )}

      {/* Quote Content */}
      {quoteData ? (
        <div className="max-w-4xl mx-auto bg-gray-50 rounded-lg shadow-sm border border-border p-8 print:shadow-none print:border-0">
          {/* Endre bakgrunnsfarge her: bytt ut "bg-white" over til f.eks. "bg-gray-50", "bg-blue-50", eller en custom farge */}
          {/* Header */}
          <div className="mb-8 pb-6 border-b border-border">
            <div className="flex justify-between items-start mb-4">
              <div>
                <Heading as="h2" size="lg" className="mb-2">
                  LEA FILMS
                </Heading>
                <Text variant="small" className="text-dark/70">
                  Adresse: Dæliveien 33b, Asker, Norway<br />
                  Telefon: 0047 94989036<br />
                  Email: eivind@leafilms.no<br />
                  Website: leafilms.no
                </Text>
              </div>
              <div className="text-right">
                <Heading as="h2" size="lg" className="mb-2">
                  Tilbud
                </Heading>
                {quoteData.version && (
                  <Text variant="small" className="text-dark/70">
                    Versjon: {quoteData.version}
                  </Text>
                )}
                {quoteData.quoteDate && (
                  <Text variant="small" className="text-dark/70">
                    Tilbud dato: {quoteData.quoteDate}
                  </Text>
                )}
              </div>
            </div>

            {/* Project Info */}
            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              {quoteData.projectName && (
                <div>
                  <Text variant="small" className="font-semibold">Prosjekt:</Text>
                  <Text variant="small" className="text-dark/70">{quoteData.projectName}</Text>
                </div>
              )}
              {quoteData.reference && (
                <div>
                  <Text variant="small" className="font-semibold">Referanse:</Text>
                  <Text variant="small" className="text-dark/70">{quoteData.reference}</Text>
                </div>
              )}
              {quoteData.clientContact && (
                <div>
                  <Text variant="small" className="font-semibold">Deres kontakt:</Text>
                  <Text variant="small" className="text-dark/70">{quoteData.clientContact}</Text>
                </div>
              )}
              {quoteData.customerNumber && (
                <div>
                  <Text variant="small" className="font-semibold">Kundenummer:</Text>
                  <Text variant="small" className="text-dark/70">{quoteData.customerNumber}</Text>
                </div>
              )}
              {quoteData.ourContact && (
                <div>
                  <Text variant="small" className="font-semibold">Vår kontakt:</Text>
                  <Text variant="small" className="text-dark/70">{quoteData.ourContact}</Text>
                </div>
              )}
              {quoteData.paymentInfo && (
                <div>
                  <Text variant="small" className="font-semibold">Betalings info:</Text>
                  <Text variant="small" className="text-dark/70">{quoteData.paymentInfo}</Text>
                </div>
              )}
              {quoteData.deliveryDate && (
                <div>
                  <Text variant="small" className="font-semibold">Levering dato:</Text>
                  <Text variant="small" className="text-dark/70">{quoteData.deliveryDate}</Text>
                </div>
              )}
            </div>
          </div>

          {/*           {quoteData.terms && (
            <div className="mb-8">
              <Heading as="h3" size="md" className="mb-4">
                Vilkår
              </Heading>
              <Text 
                variant="body" 
                className="text-dark/80 whitespace-pre-wrap text-sm leading-relaxed"
                contentEditable={editMode}
                suppressContentEditableWarning
                onBlur={(e) => {
                  if (editMode) {
                    setQuoteData({ ...quoteData, terms: e.currentTarget.textContent || '' })
                    updateSectionContent(section.id, 'quoteData', { ...quoteData, terms: e.currentTarget.textContent || '' })
                  }
                }}
              >
                {quoteData.terms}
              </Text>
            </div>
          )}
            Terms */}


          {/* Line Items Table */}
          {quoteData.lineItems && quoteData.lineItems.length > 0 && (
            <div className="mb-8 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="text-left py-3 px-4 font-semibold text-dark">Beskrivelse</th>
                    <th className="text-right py-3 px-4 font-semibold text-dark">Antall</th>
                    <th className="text-right py-3 px-4 font-semibold text-dark">Sum (NOK)</th>
                    {quoteData.lineItems.some(item => item.discount) && (
                      <th className="text-right py-3 px-4 font-semibold text-dark">Rabatt</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {quoteData.lineItems.map((item, index) => (
                    <tr key={index} className="border-b border-border/50">
                      <td className="py-3 px-4 text-dark">
                        {item.description}
                      </td>
                      <td className="py-3 px-4 text-right text-dark/70">
                        {item.quantity}
                      </td>
                      <td className="py-3 px-4 text-right text-dark">
                        {formatCurrency(item.amount)}
                      </td>
                      {quoteData.lineItems?.some(i => i.discount) && (
                        <td className="py-3 px-4 text-right text-dark/70">
                          {item.discount ? formatCurrency(-item.discount) : '-'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div className="border-t-2 border-border pt-6 space-y-2">
            {quoteData.subtotalExclVat !== undefined && (
              <div className="flex justify-between text-dark">
                <Text variant="body" className="font-semibold">
                  Produksjon totalt eksl. mva:
                </Text>
                <Text variant="body" className="font-semibold">
                  {formatCurrency(quoteData.subtotalExclVat)}
                </Text>
              </div>
            )}
            {quoteData.subtotalInclVat !== undefined && (
              <div className="flex justify-between text-dark">
                <Text variant="body" className="font-semibold">
                  Produksjon totalt inkl. mva:
                </Text>
                <Text variant="body" className="font-semibold">
                  {formatCurrency(quoteData.subtotalInclVat)}
                </Text>
              </div>
            )}
            {quoteData.totalDiscount !== undefined && quoteData.totalDiscount > 0 && (
              <div className="flex justify-between text-red-600">
                <Text variant="body" className="font-semibold">
                  {quoteData.lineItems?.some(item => item.discount) ? '20% rabatt:' : 'Rabatt:'}
                </Text>
                <Text variant="body" className="font-semibold">
                  {formatCurrency(-quoteData.totalDiscount)}
                </Text>
              </div>
            )}
            {quoteData.finalPriceExclVat !== undefined && (
              <div className="flex justify-between text-dark pt-2 border-t border-border">
                <Text variant="body" className="font-semibold text-lg">
                  Ny pris eksl. MVA:
                </Text>
                <Text variant="body" className="font-semibold text-lg">
                  {formatCurrency(quoteData.finalPriceExclVat)}
                </Text>
              </div>
            )}
            {quoteData.finalPriceInclVat !== undefined && (
              <div className="flex justify-between text-dark">
                <Text variant="body" className="font-semibold text-lg">
                  Ny pris inkl. MVA:
                </Text>
                <Text variant="body" className="font-semibold text-lg">
                  {formatCurrency(quoteData.finalPriceInclVat)}
                </Text>
              </div>
            )}
          </div>

          {/* Download PDF Button */}
          <div className="mt-8 pt-6 border-t border-border flex flex-col sm:flex-row gap-4">
            <Button
              onClick={handleDownloadPDF}
              variant="secondary"
              className="w-full sm:w-auto"
            >
              📄 Last ned som PDF
            </Button>
            
          </div>
        </div>
      ) : (
        <div className="bg-background-elevated rounded-lg p-8 text-center">
          <Text variant="body" className="text-dark/70 mb-4">
            {editMode 
              ? 'Sett API URL og klikk "Hent tilbud" for å laste inn tilbudsdata'
              : 'Ingen tilbudsdata tilgjengelig'}
          </Text>
        </div>
      )}
    </div>
  )
}

