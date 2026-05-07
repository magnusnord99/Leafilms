'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Section, Project, QuoteBuilderData } from '@/lib/types'
import { Heading, Text, Button } from '@/components/ui'
import { useQuoteAnalytics } from '@/hooks/useQuoteAnalytics'
import { supabase } from '@/lib/supabase'
import { convertBuilderDataToQuoteData } from '@/lib/quote-builder-utils'
import { calculateQuoteTotals } from '@/lib/quote-builder-utils'

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
  shareToken?: string
}

function isBuilderData(data: any): data is QuoteBuilderData {
  return data && Array.isArray(data.crew)
}

function formatNOK(amount: number) {
  return new Intl.NumberFormat('no-NO', {
    style: 'currency',
    currency: 'NOK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function QuoteSection({
  section,
  project,
  editMode,
  updateSectionContent,
  shareToken,
}: QuoteSectionProps) {
  const [quoteId, setQuoteId] = useState<string | null>(null)
  const [dbQuoteData, setDbQuoteData] = useState<QuoteData | null>(null)
  const [acceptingQuote, setAcceptingQuote] = useState(false)
  const [quoteAccepted, setQuoteAccepted] = useState(false)

  // Fetch quote from DB for display (public view)
  useEffect(() => {
    if (editMode || !project.id) return

    supabase
      .from('quotes')
      .select('id, quote_data')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setQuoteId(data.id)
        if (data.quote_data) {
          if (isBuilderData(data.quote_data)) {
            setDbQuoteData(convertBuilderDataToQuoteData(data.quote_data as QuoteBuilderData))
          } else {
            setDbQuoteData(data.quote_data as QuoteData)
          }
        }
      })
  }, [editMode, project.id])

  const quoteData: QuoteData | null = dbQuoteData

  const shouldTrackQuote = !editMode && !!quoteId && !!shareToken && !!quoteData
  useQuoteAnalytics(
    shouldTrackQuote ? quoteId : '',
    project.id,
    shouldTrackQuote ? shareToken : '',
    shouldTrackQuote ? ['header', 'line_items', 'totals', 'actions'] : []
  )

  const handleAcceptQuote = async () => {
    if (!quoteData || !quoteId || !shareToken || !project.id) return
    setAcceptingQuote(true)
    try {
      const response = await fetch('/api/accept-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          quoteId,
          shareToken,
          acceptedBy: project.client_name || 'Kunde',
        }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Kunne ikke akseptere tilbud')
      }
      setQuoteAccepted(true)
    } catch (error: any) {
      alert('Kunne ikke akseptere tilbud: ' + (error.message || 'Ukjent feil'))
    } finally {
      setAcceptingQuote(false)
    }
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK', minimumFractionDigits: 2 }).format(amount)

  // ── Edit mode: show summary + link to dedicated quote page ────────────────
  if (editMode) {
    // Try to show a live preview if builder data is stored
    const builderData = section.content?.quoteBuilderData as QuoteBuilderData | undefined
    const totals = builderData ? calculateQuoteTotals(builderData) : null

    return (
      <div className="bg-background-widget max-w-full mx-auto py-8 px-4">
        <div
          className="max-w-2xl mx-auto rounded-[3px] p-6"
          style={{ background: '#1A1713', border: '1px solid #2A261F' }}
        >
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#C49434', marginBottom: 12 }}>
            Pristilbud
          </p>

          {totals ? (
            <div className="space-y-1 mb-6">
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: '#E8E1D5', fontWeight: 500 }}>
                {builderData?.projectName || project.title}
              </p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#9E9287' }}>
                Versjon {builderData?.version} · {builderData?.quoteDate}
              </p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', color: '#E8E1D5', fontWeight: 600, marginTop: 12 }}>
                {formatNOK(totals.finalInclVat)} ink. MVA
              </p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#9E9287' }}>
                {builderData?.crew?.length ?? 0} mannskapsmedlemmer · Rabatt {builderData?.discountPercentage ?? 0}%
              </p>
            </div>
          ) : (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#6B6358', marginBottom: 20 }}>
              Ingen pristilbud opprettet ennå for dette prosjektet
            </p>
          )}

          <Link href={`/admin/projects/${project.id}/quote`}>
            <button
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.6rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                background: '#201D18',
                border: '1px solid #38332A',
                color: '#E8E1D5',
                borderRadius: 2,
                padding: '8px 16px',
                cursor: 'pointer',
              }}
            >
              {totals ? 'Rediger pristilbud →' : 'Opprett pristilbud →'}
            </button>
          </Link>
        </div>
      </div>
    )
  }

  // ── Display mode (public view for client) ─────────────────────────────────
  return (
    <div className="bg-background-widget max-w-full mx-auto py-12 px-4">
      {quoteData ? (
        <div className="max-w-4xl mx-auto bg-gray-50 rounded-lg shadow-sm border border-border p-8">
          {/* Header */}
          <div className="mb-8 pb-6 border-b border-border" data-quote-section="header">
            <div className="flex justify-between items-start mb-4">
              <div>
                <Heading as="h4" className="mb-2">LEA FILMS</Heading>
                <Text variant="small" className="text-dark/70">
                  Adresse: Dæliveien 33b, Asker, Norway<br />
                  Telefon: 0047 94989036<br />
                  Email: eivind@leafilms.no<br />
                  Website: leafilms.no
                </Text>
              </div>
              <div className="text-right">
                <Heading as="h4" className="mb-2">Tilbud</Heading>
                {quoteData.version && (
                  <Text variant="small" className="text-dark/70">Versjon: {quoteData.version}</Text>
                )}
                {quoteData.quoteDate && (
                  <Text variant="small" className="text-dark/70">Tilbud dato: {quoteData.quoteDate}</Text>
                )}
              </div>
            </div>

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

          {/* Line items */}
          {quoteData.lineItems && quoteData.lineItems.length > 0 && (
            <div className="mb-8 overflow-x-auto" data-quote-section="line_items">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="text-left py-3 px-4 font-semibold text-dark">Beskrivelse</th>
                    <th className="text-right py-3 px-4 font-semibold text-dark">Antall</th>
                    <th className="text-right py-3 px-4 font-semibold text-dark">Sum (NOK)</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteData.lineItems.map((item, idx) => {
                    const isHeader = item.quantity === '' && item.amount === 0
                    return (
                      <tr key={idx} className={isHeader ? 'bg-gray-100' : 'border-b border-border/50'}>
                        <td className={`py-3 px-4 text-dark ${isHeader ? 'font-semibold text-xs tracking-widest uppercase text-gray-500' : ''}`}>
                          {item.description}
                        </td>
                        <td className="py-3 px-4 text-right text-dark/70">{!isHeader ? item.quantity : ''}</td>
                        <td className="py-3 px-4 text-right text-dark">{!isHeader ? formatCurrency(item.amount) : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div className="border-t-2 border-border pt-6 space-y-2" data-quote-section="totals">
            {quoteData.subtotalExclVat !== undefined && (
              <div className="flex justify-between text-dark">
                <Text variant="body" className="font-semibold">Produksjon totalt eksl. mva:</Text>
                <Text variant="body" className="font-semibold">{formatCurrency(quoteData.subtotalExclVat)}</Text>
              </div>
            )}
            {quoteData.totalDiscount !== undefined && quoteData.totalDiscount > 0 && (
              <div className="flex justify-between text-red-600">
                <Text variant="body" className="font-semibold">Rabatt:</Text>
                <Text variant="body" className="font-semibold">{formatCurrency(-quoteData.totalDiscount)}</Text>
              </div>
            )}
            {quoteData.finalPriceExclVat !== undefined && (
              <div className="flex justify-between text-dark pt-2 border-t border-border">
                <Text variant="body" className="font-semibold text-lg">Ny pris eksl. MVA:</Text>
                <Text variant="body" className="font-semibold text-lg">{formatCurrency(quoteData.finalPriceExclVat)}</Text>
              </div>
            )}
            {quoteData.finalPriceInclVat !== undefined && (
              <div className="flex justify-between text-dark">
                <Text variant="body" className="font-semibold text-lg">Ny pris inkl. MVA:</Text>
                <Text variant="body" className="font-semibold text-lg">{formatCurrency(quoteData.finalPriceInclVat)}</Text>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-8 pt-6 border-t border-border" data-quote-section="actions">
            {quoteAccepted ? (
              <Text variant="body" className="text-green-600 font-semibold">Tilbud akseptert!</Text>
            ) : (
              <Button onClick={handleAcceptQuote} disabled={acceptingQuote || !quoteId || !shareToken} variant="primary">
                {acceptingQuote ? 'Behandler...' : 'Aksepter tilbud'}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-background-elevated rounded-lg p-8 text-center">
          <Text variant="body" className="text-dark/70">Ingen tilbudsdata tilgjengelig</Text>
        </div>
      )}
    </div>
  )
}
