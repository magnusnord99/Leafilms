'use client'

import { useState } from 'react'

type ContractSigningSectionProps = {
  projectId: string
  contractText: string
  isSigned: boolean
  signedBy: string | null
}

export default function ContractSigningSection({
  projectId,
  contractText,
  isSigned: initialIsSigned,
  signedBy,
}: ContractSigningSectionProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
          signerName: name,
          signerEmail: email,
          contractSnapshot: contractText,
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

  const canSubmit = name.trim() !== '' && email.trim() !== '' && accepted && !signing

  return (
    <section
      id="kontrakt"
      style={{
        background: '#0D0D12',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '80px 24px',
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {/* Heading */}
        <h2
          style={{
            fontFamily: 'var(--font-cormorant-garamond, "Cormorant Garamond", serif)',
            fontSize: '2rem',
            fontWeight: 400,
            letterSpacing: '0.06em',
            color: '#E8E1D5',
            marginBottom: '2rem',
            textTransform: 'uppercase',
          }}
        >
          Produksjonsavtale
        </h2>

        {/* Contract text box */}
        <div
          style={{
            maxHeight: 500,
            overflowY: 'auto',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4,
            padding: '1.25rem',
            marginBottom: '2rem',
            background: 'rgba(255,255,255,0.02)',
            whiteSpace: 'pre-wrap',
            fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, Consolas, monospace',
            fontSize: '0.8rem',
            lineHeight: 1.65,
            color: 'rgba(232,225,213,0.75)',
          }}
        >
          {contractText}
        </div>

        {/* Signed state */}
        {isSigned ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: '#C49434',
              fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
              fontSize: '0.95rem',
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
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: '0.75rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(232,225,213,0.5)',
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
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 4,
                  padding: '0.65rem 0.9rem',
                  color: '#E8E1D5',
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: '0.9rem',
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
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: '0.75rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(232,225,213,0.5)',
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
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 4,
                  padding: '0.65rem 0.9rem',
                  color: '#E8E1D5',
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: '0.9rem',
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
                fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                fontSize: '0.85rem',
                color: 'rgba(232,225,213,0.5)',
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

            {/* Error */}
            {error && (
              <p
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: '0.85rem',
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
                background: canSubmit ? '#C49434' : 'rgba(196,148,52,0.25)',
                color: canSubmit ? '#0A0A0E' : 'rgba(232,225,213,0.3)',
                border: 'none',
                borderRadius: 4,
                padding: '0.75rem 2rem',
                fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                fontSize: '0.8rem',
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              {signing ? 'Signerer…' : 'Signer avtalen'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
