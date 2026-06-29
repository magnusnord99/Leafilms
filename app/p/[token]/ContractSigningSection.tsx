'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

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

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [hasSigned, setHasSigned] = useState(false)

  const isSigned = initialIsSigned || signed

  const getCanvasPos = useCallback((e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }, [])

  const startDrawing = useCallback((x: number, y: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    isDrawing.current = true
    ctx.beginPath()
    ctx.moveTo(x, y)
  }, [])

  const draw = useCallback((x: number, y: number) => {
    if (!isDrawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasSigned(true)
  }, [])

  const stopDrawing = useCallback(() => {
    isDrawing.current = false
  }, [])

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSigned(false)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#E8E1D5'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

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
          signatureImage: canvasRef.current?.toDataURL('image/png') ?? '',
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
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: '2rem 2.25rem',
            marginBottom: '2.5rem',
            background: 'rgba(255,255,255,0.025)',
          }}
        >
          {contractText.split('\n').map((line, i) => {
            const isSectionHeader = /^\d+\.\s+\S/.test(line) && line.length < 60
            const isSubHeader = /^\d+\.\d+/.test(line)
            const isEmpty = line.trim() === ''
            if (isEmpty) return <div key={i} style={{ height: '0.75rem' }} />
            return (
              <p
                key={i}
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: isSectionHeader ? '0.8rem' : '0.875rem',
                  fontWeight: isSectionHeader || isSubHeader ? 600 : 400,
                  letterSpacing: isSectionHeader ? '0.08em' : 0,
                  textTransform: isSectionHeader ? 'uppercase' : 'none',
                  lineHeight: 1.8,
                  color: isSectionHeader
                    ? 'rgba(196,148,52,0.85)'
                    : 'rgba(232,225,213,0.85)',
                  marginBottom: isSectionHeader ? '0.4rem' : '0.1rem',
                  marginTop: isSectionHeader ? '1.5rem' : 0,
                }}
              >
                {line}
              </p>
            )
          })}
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

            {/* Signaturcanvas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label
                  style={{
                    fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                    fontSize: '0.75rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'rgba(232,225,213,0.5)',
                  }}
                >
                  Signatur
                </label>
                <button
                  type="button"
                  onClick={clearCanvas}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                    fontSize: '0.7rem',
                    color: 'rgba(232,225,213,0.35)',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    letterSpacing: '0.05em',
                  }}
                >
                  Tøm
                </button>
              </div>
              <canvas
                ref={canvasRef}
                width={700}
                height={160}
                onMouseDown={e => {
                  const canvas = canvasRef.current
                  if (!canvas) return
                  const pos = getCanvasPos(e.nativeEvent, canvas)
                  startDrawing(pos.x, pos.y)
                }}
                onMouseMove={e => {
                  const canvas = canvasRef.current
                  if (!canvas) return
                  const pos = getCanvasPos(e.nativeEvent, canvas)
                  draw(pos.x, pos.y)
                }}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={e => {
                  e.preventDefault()
                  const canvas = canvasRef.current
                  if (!canvas) return
                  const pos = getCanvasPos(e.touches[0], canvas)
                  startDrawing(pos.x, pos.y)
                }}
                onTouchMove={e => {
                  e.preventDefault()
                  const canvas = canvasRef.current
                  if (!canvas) return
                  const pos = getCanvasPos(e.touches[0], canvas)
                  draw(pos.x, pos.y)
                }}
                onTouchEnd={stopDrawing}
                style={{
                  width: '100%',
                  height: 160,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${hasSigned ? 'rgba(196,148,52,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 4,
                  cursor: 'crosshair',
                  touchAction: 'none',
                  display: 'block',
                }}
              />
              {!hasSigned && (
                <p style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: '0.7rem',
                  color: 'rgba(232,225,213,0.3)',
                  margin: 0,
                  textAlign: 'center',
                }}>
                  Tegn signaturen din her
                </p>
              )}
            </div>

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
