'use client'

import { useState, useRef } from 'react'
import { SignatureCanvas, type SignatureCanvasHandle } from '@/components/shared/SignatureCanvas'
import type { OurSignature, OptionalAddon } from '@/lib/types'
import { buildContractTextWithAddons } from '@/lib/contract-addendum'
import { addonDiscountedPrice } from '@/lib/quote-builder-utils'

type ContractSigningSectionProps = {
  projectId: string
  shareToken: string
  contractText: string
  isSigned: boolean
  signedBy: string | null
  ourSignature?: OurSignature | null
  optionalAddons?: OptionalAddon[]
  selectedAddonIds?: Set<string>
  baseFinalPriceExclVat?: number
  discountFactor?: number
  pdfUrl?: string | null
  language?: 'no' | 'en'
  requestInvoiceInfo?: boolean
  onSigned?: () => void
}

const STRINGS = {
  no: {
    eyebrow: 'Avtale',
    title: 'Produksjonsavtale',
    ourSignatureAlt: 'Signatur',
    signedByUsFor: (name: string, date: string) => `Signert av ${name} for Leafilms · ${date}`,
    justSigned: 'Avtalen er signert.',
    signedBy: (name: string) => `Signert av ${name}`,
    downloadAgreement: 'Last ned avtalen',
    pdfNotReady: 'Avtalen som PDF er ikke klar ennå — ta kontakt med Leafilms hvis du trenger en kopi.',
    selectedAddons: 'Valgte tillegg',
    fullName: 'Fullt navn',
    fullNamePlaceholder: 'Ditt fulle navn',
    email: 'E-post',
    emailPlaceholder: 'din@epost.no',
    invoiceTitle: 'Fakturainformasjon',
    invoiceCompany: 'Firma / fakturamottaker',
    invoiceCompanyPlaceholder: 'Firmanavn eller fullt navn',
    invoiceOrgNummer: 'Org.nummer (valgfritt)',
    invoiceOrgNummerPlaceholder: '923 456 789',
    invoiceAddress: 'Fakturaadresse',
    invoiceAddressPlaceholder: 'Gateadresse, postnummer, sted',
    invoiceEmail: 'Faktura-e-post',
    invoiceEmailPlaceholder: 'faktura@firma.no',
    invoiceReference: 'Merking / referanse (valgfritt)',
    invoiceReferencePlaceholder: 'F.eks. PO-nummer eller avdeling',
    noInvoiceInfo: 'Jeg har ikke fakturainformasjonen klar nå',
    acceptTerms: 'Jeg har lest og godtar produksjonsavtalen',
    signature: 'Signatur',
    signatureClear: 'Tøm',
    signaturePlaceholder: 'Tegn signaturen her',
    signing: 'Signerer…',
    signAgreement: 'Signer avtalen',
    genericError: 'Noe gikk galt',
    networkError: 'Nettverksfeil — prøv igjen',
    dateLocale: 'nb-NO',
    numberLocale: 'no-NO',
  },
  en: {
    eyebrow: 'Agreement',
    title: 'Production Agreement',
    ourSignatureAlt: 'Signature',
    signedByUsFor: (name: string, date: string) => `Signed by ${name} for Leafilms · ${date}`,
    justSigned: 'The agreement has been signed.',
    signedBy: (name: string) => `Signed by ${name}`,
    downloadAgreement: 'Download the agreement',
    pdfNotReady: "The agreement PDF isn't ready yet — please contact Leafilms if you need a copy.",
    selectedAddons: 'Selected add-ons',
    fullName: 'Full name',
    fullNamePlaceholder: 'Your full name',
    email: 'Email',
    emailPlaceholder: 'you@email.com',
    invoiceTitle: 'Invoicing details',
    invoiceCompany: 'Company / invoice recipient',
    invoiceCompanyPlaceholder: 'Company name or full name',
    invoiceOrgNummer: 'Org. number (optional)',
    invoiceOrgNummerPlaceholder: '923 456 789',
    invoiceAddress: 'Billing address',
    invoiceAddressPlaceholder: 'Street address, postal code, city',
    invoiceEmail: 'Invoice email',
    invoiceEmailPlaceholder: 'invoices@company.com',
    invoiceReference: 'Reference (optional)',
    invoiceReferencePlaceholder: 'e.g. PO number or department',
    noInvoiceInfo: "I don't have my invoice details ready yet",
    acceptTerms: 'I have read and accept the production agreement',
    signature: 'Signature',
    signatureClear: 'Clear',
    signaturePlaceholder: 'Draw your signature here',
    signing: 'Signing…',
    signAgreement: 'Sign the agreement',
    genericError: 'Something went wrong',
    networkError: 'Network error — please try again',
    dateLocale: 'en-GB',
    numberLocale: 'en-US',
  },
} as const

export default function ContractSigningSection({
  projectId,
  shareToken,
  contractText,
  isSigned: initialIsSigned,
  signedBy,
  ourSignature,
  optionalAddons = [],
  selectedAddonIds = new Set<string>(),
  baseFinalPriceExclVat = 0,
  discountFactor = 0,
  pdfUrl: initialPdfUrl,
  language = 'no',
  requestInvoiceInfo = true,
  onSigned = () => {},
}: ContractSigningSectionProps) {
  const t = STRINGS[language]
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [invoiceCompany, setInvoiceCompany] = useState('')
  const [invoiceOrgNummer, setInvoiceOrgNummer] = useState('')
  const [invoiceAddress, setInvoiceAddress] = useState('')
  const [invoiceEmail, setInvoiceEmail] = useState('')
  const [invoiceReference, setInvoiceReference] = useState('')
  const [noInvoiceInfo, setNoInvoiceInfo] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(initialPdfUrl ?? null)

  const sigRef = useRef<SignatureCanvasHandle>(null)
  const [hasSigned, setHasSigned] = useState(false)

  const isSigned = initialIsSigned || signed

  async function handleSign() {
    setSigning(true)
    setError(null)
    try {
      const res = await fetch('/api/contracts/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          shareToken,
          signerName: name,
          signerEmail: email,
          contractSnapshot: contractText,
          signatureImage: sigRef.current?.getDataUrl() ?? '',
          selectedAddonIds: Array.from(selectedAddonIds),
          noInvoiceInfo,
          invoiceCompany: noInvoiceInfo ? '' : invoiceCompany,
          invoiceOrgNummer: noInvoiceInfo ? '' : invoiceOrgNummer,
          invoiceAddress: noInvoiceInfo ? '' : invoiceAddress,
          invoiceEmail: noInvoiceInfo ? '' : invoiceEmail,
          invoiceReference: noInvoiceInfo ? '' : invoiceReference,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setPdfUrl(data.pdfUrl ?? null)
        setSigned(true)
        onSigned()
      } else {
        const err = await res.json()
        // API-feilmeldingene er norske — vis generisk engelsk melding på engelske prosjekter
        setError(language === 'en' ? t.genericError : err.error ?? t.genericError)
      }
    } catch {
      setError(t.networkError)
    } finally {
      setSigning(false)
    }
  }

  const hasInvoiceInfo = invoiceCompany.trim() !== '' && invoiceAddress.trim() !== '' && invoiceEmail.trim() !== ''
  const canSubmit =
    name.trim() !== '' && email.trim() !== '' && accepted && hasSigned && !signing &&
    (!requestInvoiceInfo || noInvoiceInfo || hasInvoiceInfo)

  // Kontraktteksten skal reflektere prisen med valgte tillegg — samme funksjon som
  // brukes server-side ved signering (app/api/contracts/sign/route.ts), slik at
  // forhåndsvisningen aldri avviker fra det som faktisk lagres.
  const selectedAddons = optionalAddons.filter((a) => selectedAddonIds.has(a.id))
  const displayContractText = buildContractTextWithAddons(contractText, baseFinalPriceExclVat, selectedAddons, discountFactor, language)

  return (
    <div
      id="kontrakt"
      className="max-w-full mx-auto py-16 md:py-24 px-4 md:px-8"
      style={{ background: '#0C0B09', borderTop: '1px solid #1A1713' }}
    >
      <div className="max-w-4xl mx-auto" style={{ background: '#161410', border: '1px solid #2A261F' }}>
        {/* Header */}
        <div className="px-8 md:px-12 pt-10 pb-8" style={{ borderBottom: '1px solid #2A261F' }}>
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
              {t.eyebrow}
            </span>
          </div>
          <p style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 'clamp(1.6rem, 2.5vw, 2.2rem)',
            fontWeight: 300,
            fontStyle: 'italic',
            color: '#E8E1D5',
            lineHeight: 1.2,
          }}>
            {t.title}
          </p>
        </div>

        {/* Leafilms-signatur — vises så snart kontrakten er publisert */}
        {ourSignature && (
          <div
            className="mx-8 md:mx-12 mt-8"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              padding: '1rem 1.25rem',
              border: '1px solid rgba(196,148,52,0.25)',
              background: 'rgba(196,148,52,0.05)',
            }}
          >
            <img
              src={ourSignature.signatureImage}
              alt={`${t.ourSignatureAlt} — ${ourSignature.signerName}`}
              style={{ height: 44, width: 'auto', maxWidth: 160, objectFit: 'contain' }}
            />
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: '#C49434', margin: 0 }}>
              ✓ {t.signedByUsFor(ourSignature.signerName, new Date(ourSignature.signedAt).toLocaleDateString(t.dateLocale, { day: 'numeric', month: 'long', year: 'numeric' }))}
            </p>
          </div>
        )}

        {/* Contract text box */}
        <div className="px-8 md:px-12 py-8">
          {displayContractText.split('\n').map((line, i) => {
            const isSectionHeader = /^\d+\.\s+\S/.test(line) && line.length < 60
            const isSubHeader = /^\d+\.\d+/.test(line)
            const isEmpty = line.trim() === ''
            if (isEmpty) return <div key={i} style={{ height: '0.75rem' }} />
            return (
              <p
                key={i}
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: isSectionHeader ? '0.78rem' : '0.85rem',
                  fontWeight: isSectionHeader || isSubHeader ? 600 : 300,
                  letterSpacing: isSectionHeader ? '0.1em' : 0,
                  textTransform: isSectionHeader ? 'uppercase' : 'none',
                  lineHeight: 1.8,
                  color: isSectionHeader ? '#C49434' : '#9E9287',
                  marginBottom: isSectionHeader ? '0.4rem' : '0.1rem',
                  marginTop: isSectionHeader ? '1.5rem' : 0,
                }}
              >
                {line}
              </p>
            )
          })}
        </div>

        {/* Signed state / signing form */}
        <div className="px-8 md:px-12 py-8" style={{ borderTop: '1px solid #2A261F' }}>
          {isSigned ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  color: '#C49434',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.9rem',
                  letterSpacing: '0.02em',
                }}
              >
                <span style={{ fontSize: '1.1rem' }}>✓</span>
                <span>
                  {signed ? t.justSigned : t.signedBy(signedBy ?? '')}
                </span>
              </div>
              {pdfUrl ? (
                <a
                  href={pdfUrl}
                  download
                  style={{
                    alignSelf: 'flex-start',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: '#C49434',
                    color: '#0C0B09',
                    border: 'none',
                    padding: '14px 32px',
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = '#D4A848' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = '#C49434' }}
                >
                  {t.downloadAgreement}
                </a>
              ) : (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: '#9E9287', margin: 0 }}>
                  {t.pdfNotReady}
                </p>
              )}
            </div>
          ) : (
            /* Signing form */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {selectedAddons.length > 0 && (
                <div
                  style={{
                    padding: '1rem 1.25rem',
                    border: '1px solid rgba(196,148,52,0.25)',
                    background: 'rgba(196,148,52,0.05)',
                  }}
                >
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C49434', marginBottom: 8 }}>
                    {t.selectedAddons}
                  </p>
                  {selectedAddons.map((a) => (
                    <p key={a.id} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: '#9E9287', margin: '2px 0' }}>
                      {a.description} — +{new Intl.NumberFormat(t.numberLocale, { style: 'currency', currency: 'NOK', minimumFractionDigits: 0 }).format(addonDiscountedPrice(a, discountFactor))}
                    </p>
                  ))}
                </div>
              )}
              {/* Name input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label
                  htmlFor="signer-name"
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.65rem',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#62594E',
                  }}
                >
                  {t.fullName}
                </label>
                <input
                  id="signer-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t.fullNamePlaceholder}
                  style={{
                    background: '#201D18',
                    border: '1px solid #2A261F',
                    padding: '0.65rem 0.9rem',
                    color: '#E8E1D5',
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '1rem',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Email input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label
                  htmlFor="signer-email"
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.65rem',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#62594E',
                  }}
                >
                  {t.email}
                </label>
                <input
                  id="signer-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                  style={{
                    background: '#201D18',
                    border: '1px solid #2A261F',
                    padding: '0.65rem 0.9rem',
                    color: '#E8E1D5',
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '1rem',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Fakturainformasjon */}
              {requestInvoiceInfo && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                  padding: '1.1rem 1.25rem',
                  border: '1px solid #2A261F',
                  background: '#171410',
                }}
              >
                <p style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: '#C49434',
                  margin: 0,
                }}>
                  {t.invoiceTitle}
                </p>

                {!noInvoiceInfo && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label htmlFor="invoice-company" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E' }}>
                        {t.invoiceCompany}
                      </label>
                      <input
                        id="invoice-company"
                        type="text"
                        value={invoiceCompany}
                        onChange={(e) => setInvoiceCompany(e.target.value)}
                        placeholder={t.invoiceCompanyPlaceholder}
                        style={{ background: '#201D18', border: '1px solid #2A261F', padding: '0.65rem 0.9rem', color: '#E8E1D5', fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label htmlFor="invoice-org-nummer" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E' }}>
                        {t.invoiceOrgNummer}
                      </label>
                      <input
                        id="invoice-org-nummer"
                        type="text"
                        value={invoiceOrgNummer}
                        onChange={(e) => setInvoiceOrgNummer(e.target.value)}
                        placeholder={t.invoiceOrgNummerPlaceholder}
                        style={{ background: '#201D18', border: '1px solid #2A261F', padding: '0.65rem 0.9rem', color: '#E8E1D5', fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label htmlFor="invoice-address" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E' }}>
                        {t.invoiceAddress}
                      </label>
                      <textarea
                        id="invoice-address"
                        value={invoiceAddress}
                        onChange={(e) => setInvoiceAddress(e.target.value)}
                        placeholder={t.invoiceAddressPlaceholder}
                        rows={2}
                        style={{ background: '#201D18', border: '1px solid #2A261F', padding: '0.65rem 0.9rem', color: '#E8E1D5', fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label htmlFor="invoice-email" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E' }}>
                        {t.invoiceEmail}
                      </label>
                      <input
                        id="invoice-email"
                        type="email"
                        value={invoiceEmail}
                        onChange={(e) => setInvoiceEmail(e.target.value)}
                        placeholder={t.invoiceEmailPlaceholder}
                        style={{ background: '#201D18', border: '1px solid #2A261F', padding: '0.65rem 0.9rem', color: '#E8E1D5', fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label htmlFor="invoice-reference" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E' }}>
                        {t.invoiceReference}
                      </label>
                      <input
                        id="invoice-reference"
                        type="text"
                        value={invoiceReference}
                        onChange={(e) => setInvoiceReference(e.target.value)}
                        placeholder={t.invoiceReferencePlaceholder}
                        style={{ background: '#201D18', border: '1px solid #2A261F', padding: '0.65rem 0.9rem', color: '#E8E1D5', fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none', width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  </>
                )}

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.78rem',
                    color: '#9E9287',
                    lineHeight: 1.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={noInvoiceInfo}
                    onChange={(e) => setNoInvoiceInfo(e.target.checked)}
                    style={{ marginTop: '0.2rem', accentColor: '#C49434', width: 16, height: 16, flexShrink: 0, cursor: 'pointer' }}
                  />
                  {t.noInvoiceInfo}
                </label>
              </div>
              )}

              {/* Checkbox */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.82rem',
                  color: '#9E9287',
                  lineHeight: 1.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  style={{
                    marginTop: '0.2rem',
                    accentColor: '#C49434',
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                />
                {t.acceptTerms}
              </label>

              {/* Signaturcanvas */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.65rem',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: '#62594E',
                  }}
                >
                  {t.signature}
                </label>
                <SignatureCanvas ref={sigRef} onChange={setHasSigned} clearLabel={t.signatureClear} placeholderText={t.signaturePlaceholder} />
              </div>

              {/* Error */}
              {error && (
                <p
                  style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.82rem',
                    color: '#e06060',
                    margin: 0,
                  }}
                >
                  {error}
                </p>
              )}

              {/* Submit button */}
              <button
                onClick={handleSign}
                disabled={!canSubmit}
                style={{
                  alignSelf: 'flex-start',
                  background: canSubmit ? '#C49434' : '#2A261F',
                  color: canSubmit ? '#0C0B09' : '#62594E',
                  border: 'none',
                  padding: '14px 32px',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s, color 0.2s',
                }}
                onMouseEnter={(e) => { if (canSubmit) (e.currentTarget as HTMLButtonElement).style.background = '#D4A848' }}
                onMouseLeave={(e) => { if (canSubmit) (e.currentTarget as HTMLButtonElement).style.background = '#C49434' }}
              >
                {signing ? t.signing : t.signAgreement}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
