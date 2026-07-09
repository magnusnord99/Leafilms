'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

export type SignatureCanvasHandle = {
  getDataUrl: () => string | null
  clear: () => void
}

type SignatureCanvasProps = {
  width?: number
  height?: number
  strokeColor?: string
  background?: string
  borderColor?: string
  activeBorderColor?: string
  placeholderColor?: string
  onChange?: (hasSigned: boolean) => void
}

export const SignatureCanvas = forwardRef<SignatureCanvasHandle, SignatureCanvasProps>(function SignatureCanvas({
  width = 700,
  height = 160,
  strokeColor = '#E8E1D5',
  background = 'rgba(255,255,255,0.03)',
  borderColor = 'rgba(255,255,255,0.08)',
  activeBorderColor = 'rgba(196,148,52,0.4)',
  placeholderColor = 'rgba(232,225,213,0.3)',
  onChange,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const [hasSigned, setHasSigned] = useState(false)

  const getCanvasPos = useCallback((e: { clientX: number; clientY: number }, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
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
    onChange?.(true)
  }, [onChange])

  const stopDrawing = useCallback(() => {
    isDrawing.current = false
  }, [])

  const clear = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSigned(false)
    onChange?.(false)
  }, [onChange])

  useImperativeHandle(ref, () => ({
    getDataUrl: () => (hasSigned ? canvasRef.current?.toDataURL('image/png') ?? null : null),
    clear,
  }), [hasSigned, clear])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [strokeColor])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={clear}
          style={{
            background: 'none',
            border: 'none',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.7rem',
            color: placeholderColor,
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
        width={width}
        height={height}
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
          height,
          background,
          border: `1px solid ${hasSigned ? activeBorderColor : borderColor}`,
          borderRadius: 4,
          cursor: 'crosshair',
          touchAction: 'none',
          display: 'block',
        }}
      />
      {!hasSigned && (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: placeholderColor, margin: 0, textAlign: 'center' }}>
          Tegn signaturen her
        </p>
      )}
    </div>
  )
})
