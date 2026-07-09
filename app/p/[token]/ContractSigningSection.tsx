'use client'

import { useState, useRef } from 'react'
import { SignatureCanvas, type SignatureCanvasHandle } from '@/components/shared/SignatureCanvas'
import type { OurSignature } from '@/lib/types'

type ContractSigningSectionProps = {
  projectId: string
  shareToken: string
  contractText: string
  isSigned: boolean
  signedBy: string | null
  ourSignature?: OurSignature | null
}

export default function ContractSigningSection({
  projectId,
  shareToken,
  contractText,
  isSigned: initialIsSigned,
  signedBy,
  ourSignature,
}: ContractSigningSectionProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        }),
      })
      if (res.ok) {
        setSigned(true)
      } else {
        const err = await res.json()
        setError(err.error ?? 'Noe gikk galt')
      }
    } catch {
      setError('Nettverksfeil — prøv igjen')
    } finally {
      setSigning(false)
    }
  }

  const canSubmit = name.trim() !== '' && email.trim() !== '' && accepted && hasSigned && !signing

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
              Avtale
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
            Produksjonsavtale
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
              alt={`Signatur — ${ourSignature.signerName}`}
              style={{ height: 44, width: 'auto', maxWidth: 160, objectFit: 'contain' }}
            />
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: '#C49434', margin: 0 }}>
              ✓ Signert av {ourSignature.signerName} for Leafilms · {new Date(ourSignature.signedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}

        {/* Contract text box */}
        <div className="px-8 md:px-12 py-8">
          {contractText.split('\n').map((line, i) => {
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
                {signed
                  ? 'Avtalen er signert. Du vil motta en bekreftelse på e-post.'
                  : `Signert av ${signedBy}`}
              </span>
            </div>
          ) : (
            /* Signing form */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                  Fullt navn
                </label>
                <input
                  id="signer-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ditt fulle navn"
                  style={{
                    background: '#201D18',
                    border: '1px solid #2A261F',
                    padding: '0.65rem 0.9rem',
                    color: '#E8E1D5',
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.85rem',
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
                  E-post
                </label>
                <input
                  id="signer-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="din@epost.no"
                  style={{
                    background: '#201D18',
                    border: '1px solid #2A261F',
                    padding: '0.65rem 0.9rem',
                    color: '#E8E1D5',
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.85rem',
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

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
                Jeg har lest og godtar produksjonsavtalen
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
                  Signatur
                </label>
                <SignatureCanvas ref={sigRef} onChange={setHasSigned} />
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
                {signing ? 'Signerer…' : 'Signer avtalen'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
