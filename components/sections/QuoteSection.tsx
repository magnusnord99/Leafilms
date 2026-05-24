'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Section, Project, QuoteBuilderData } from '@/lib/types'
// Heading/Text/Button imported for potential future use in edit mode expansions
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
    if (!quoteData || !project.id || !quoteId || !shareToken) return
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
    <div className="max-w-full mx-auto py-16 md:py-24 px-4 md:px-8" style={{ background: '#0C0B09' }}>
      {quoteData ? (
        <div
          className="max-w-4xl mx-auto"
          style={{ background: '#161410', border: '1px solid #2A261F' }}
        >
          {/* Header */}
          <div
            className="px-8 md:px-12 pt-10 pb-8 mb-0"
            style={{ borderBottom: '1px solid #2A261F' }}
            data-quote-section="header"
          >
            <div className="flex justify-between items-start mb-8">
              <div>
                {/* Section label */}
                <div className="flex items-center gap-3 mb-5">
                  <div style={{ width: 24, height: 1, background: '#C49434' }} />
                  <span style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.72rem',
                    letterSpacing: '0.18em',
                    color: '#C49434',
                    textTransform: 'uppercase',
                    fontWeight: 500,
                  }}>
                    Pristilbud
                  </span>
                </div>
                <p style={{
                  fontFamily: 'var(--font-cormorant)',
                  fontSize: 'clamp(1.6rem, 2.5vw, 2.2rem)',
                  fontWeight: 300,
                  fontStyle: 'italic',
                  color: '#E8E1D5',
                  lineHeight: 1.2,
                  marginBottom: '0.75rem',
                }}>
                  Lea Films
                </p>
                <p style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.78rem',
                  color: '#9E9287',
                  lineHeight: 1.7,
                }}>
                  Dæliveien 33b, Asker<br />
                  +47 949 89 036<br />
                  eivind@leafilms.no
                </p>
              </div>
              <div className="text-right">
                {quoteData.version && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', letterSpacing: '0.12em', color: '#62594E', textTransform: 'uppercase', marginBottom: 4 }}>
                    Versjon {quoteData.version}
                  </p>
                )}
                {quoteData.quoteDate && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: '#9E9287' }}>
                    {quoteData.quoteDate}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              {quoteData.projectName && (
                <div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E', marginBottom: 2 }}>Prosjekt</p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: '#E8E1D5' }}>{quoteData.projectName}</p>
                </div>
              )}
              {quoteData.reference && (
                <div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E', marginBottom: 2 }}>Referanse</p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: '#E8E1D5' }}>{quoteData.reference}</p>
                </div>
              )}
              {quoteData.clientContact && (
                <div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E', marginBottom: 2 }}>Deres kontakt</p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: '#E8E1D5' }}>{quoteData.clientContact}</p>
                </div>
              )}
              {quoteData.ourContact && (
                <div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E', marginBottom: 2 }}>Vår kontakt</p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: '#E8E1D5' }}>{quoteData.ourContact}</p>
                </div>
              )}
              {quoteData.deliveryDate && (
                <div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E', marginBottom: 2 }}>Levering</p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: '#E8E1D5' }}>{quoteData.deliveryDate}</p>
                </div>
              )}
              {quoteData.paymentInfo && (
                <div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E', marginBottom: 2 }}>Betalingsinfo</p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: '#E8E1D5' }}>{quoteData.paymentInfo}</p>
                </div>
              )}
            </div>
          </div>

          {/* Line items */}
          {quoteData.lineItems && quoteData.lineItems.length > 0 && (
            <div className="overflow-x-auto" data-quote-section="line_items">
              <table className="w-full border-collapse">
                <thead>
                  <tr style={{ borderBottom: '1px solid #2A261F' }}>
                    <th className="text-left py-3 px-8 md:px-12" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E', fontWeight: 500 }}>Beskrivelse</th>
                    <th className="text-right py-3 px-4" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E', fontWeight: 500 }}>Antall</th>
                    <th className="text-right py-3 px-8 md:px-12" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E', fontWeight: 500 }}>Sum</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteData.lineItems.map((item, idx) => {
                    const isHeader = item.quantity === '' && item.amount === 0
                    return (
                      <tr
                        key={idx}
                        style={{
                          borderBottom: '1px solid #1E1B16',
                          background: isHeader ? 'rgba(196,148,52,0.04)' : 'transparent',
                        }}
                      >
                        <td className="py-3 px-8 md:px-12" style={{
                          fontFamily: isHeader ? 'var(--font-dm-sans)' : 'var(--font-dm-sans)',
                          fontSize: isHeader ? '0.65rem' : '0.85rem',
                          letterSpacing: isHeader ? '0.14em' : '0',
                          textTransform: isHeader ? 'uppercase' : 'none',
                          color: isHeader ? '#9E9287' : '#E8E1D5',
                          fontWeight: isHeader ? 500 : 300,
                        }}>
                          {item.description}
                        </td>
                        <td className="py-3 px-4 text-right" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: '#9E9287' }}>
                          {!isHeader ? item.quantity : ''}
                        </td>
                        <td className="py-3 px-8 md:px-12 text-right" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: isHeader ? 'transparent' : '#E8E1D5' }}>
                          {!isHeader ? formatCurrency(item.amount) : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div
            className="px-8 md:px-12 py-8 space-y-3"
            style={{ borderTop: '1px solid #2A261F' }}
            data-quote-section="totals"
          >
            {quoteData.subtotalExclVat !== undefined && (
              <div className="flex justify-between items-baseline">
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: '#9E9287' }}>Produksjon totalt eksl. mva</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: '#E8E1D5' }}>{formatCurrency(quoteData.subtotalExclVat)}</p>
              </div>
            )}
            {quoteData.totalDiscount !== undefined && quoteData.totalDiscount > 0 && (
              <div className="flex justify-between items-baseline">
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: '#9E9287' }}>Rabatt</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: '#C49434' }}>−{formatCurrency(quoteData.totalDiscount)}</p>
              </div>
            )}
            {quoteData.finalPriceExclVat !== undefined && (
              <div className="flex justify-between items-baseline pt-3" style={{ borderTop: '1px solid #2A261F' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: '#9E9287' }}>Pris eksl. MVA</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', color: '#E8E1D5', fontWeight: 500 }}>{formatCurrency(quoteData.finalPriceExclVat)}</p>
              </div>
            )}
            {quoteData.finalPriceInclVat !== undefined && (
              <div className="flex justify-between items-baseline">
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: '#9E9287' }}>Pris inkl. MVA</p>
                <p style={{
                  fontFamily: 'var(--font-cormorant)',
                  fontSize: 'clamp(1.5rem, 2.5vw, 2rem)',
                  fontWeight: 400,
                  fontStyle: 'italic',
                  color: '#E8E1D5',
                  letterSpacing: '-0.01em',
                }}>{formatCurrency(quoteData.finalPriceInclVat)}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div
            className="px-8 md:px-12 py-8"
            style={{ borderTop: '1px solid #2A261F' }}
            data-quote-section="actions"
          >
            {quoteAccepted ? (
              <div className="flex items-center gap-3">
                <div style={{ width: 24, height: 1, background: '#4A9A70' }} />
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#5BB880' }}>
                  Tilbud akseptert
                </p>
              </div>
            ) : (
              <button
                onClick={handleAcceptQuote}
                disabled={acceptingQuote}
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.72rem',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  background: '#C49434',
                  color: '#0C0B09',
                  border: 'none',
                  padding: '14px 32px',
                  cursor: acceptingQuote ? 'not-allowed' : 'pointer',
                  opacity: acceptingQuote ? 0.6 : 1,
                  fontWeight: 600,
                  transition: 'background 0.2s, opacity 0.2s',
                }}
                onMouseEnter={(e) => { if (!acceptingQuote) (e.currentTarget as HTMLButtonElement).style.background = '#D4A848' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#C49434' }}
              >
                {acceptingQuote ? 'Behandler...' : 'Aksepter tilbud'}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="max-w-4xl mx-auto py-16 text-center" style={{ background: '#161410', border: '1px solid #2A261F' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: '#62594E', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Ingen tilbudsdata tilgjengelig
          </p>
        </div>
      )}
    </div>
  )
}
