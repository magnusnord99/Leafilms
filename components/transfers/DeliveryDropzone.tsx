'use client'

import { useRef, useState, useCallback } from 'react'
import { collectDroppedEntries, collectPickedFiles } from '@/lib/delivery-upload-client'
import type { DroppedItem } from '@/lib/delivery-upload-client'
import { formatFileSize } from '@/lib/utils/file-size'
import { C as CBase } from '@/lib/admin-theme'

const C = { ...CBase, accentBorder: 'rgba(124,92,252,0.35)' }

export type { DroppedItem }

export type SelectionMeta = {
  items: DroppedItem[]
  willZip: boolean
  /** Visningsnavn: original filnavn (enkeltfil) eller "N filer" (zip) */
  displayName: string
  /** Estimert størrelse = sum av alle filstørrelser */
  approxSize: number
}

type InternalPhase = 'idle' | 'dragging' | 'selected' | 'loading'

type Props = {
  /** 'large' = TransferUploadClient (stor dropsone), 'compact' = email-siden */
  variant?: 'large' | 'compact'
  deliveryType?: 'video' | 'photo'
  disabled?: boolean
  /** Kalt umiddelbart når filer/mapper er innsamlet og klare */
  onFilesSelected: (meta: SelectionMeta) => void
  /** Kalt når brukeren klikker "Fjern" — foreldre kan nullstille sin state */
  onClear?: () => void
}

export function DeliveryDropzone({
  variant = 'large',
  deliveryType,
  disabled = false,
  onFilesSelected,
  onClear,
}: Props) {
  const [phase, setPhase] = useState<InternalPhase>('idle')
  const [selection, setSelection] = useState<SelectionMeta | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dirInputRef = useRef<HTMLInputElement>(null)

  const processItems = useCallback(
    (items: DroppedItem[]) => {
      if (items.length === 0) return
      const willZip = items.length > 1
      const displayName = willZip
        ? `${items.length} filer (zippes)`
        : (items[0].relativePath.split('/').pop() ?? items[0].file.name)
      const approxSize = items.reduce((s, { file }) => s + file.size, 0)
      const meta: SelectionMeta = { items, willZip, displayName, approxSize }
      setSelection(meta)
      setPhase('selected')
      onFilesSelected(meta)
    },
    [onFilesSelected]
  )

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      if (disabled) return
      setPhase('loading')
      try {
        const items = await collectDroppedEntries(e.dataTransfer)
        if (items.length > 0) processItems(items)
        else setPhase('idle')
      } catch {
        setPhase('idle')
      }
    },
    [disabled, processItems]
  )

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!disabled) setPhase(p => (p === 'selected' || p === 'loading' ? p : 'dragging'))
    },
    [disabled]
  )

  const onDragLeave = useCallback(() => {
    setPhase(p => (p === 'dragging' ? 'idle' : p))
  }, [])

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files?.length) return
      const items = collectPickedFiles(e.target.files)
      e.target.value = '' // resett for å tillate å velge samme fil igjen
      processItems(items)
    },
    [processItems]
  )

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPhase('idle')
    setSelection(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (dirInputRef.current) dirInputRef.current.value = ''
    onClear?.()
  }

  const isInteractive = phase !== 'selected' && phase !== 'loading' && !disabled

  if (variant === 'compact') {
    return (
      <div>
        {/* Skjulte fil-inputs */}
        <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={onFileChange} />
        <input ref={dirInputRef} type="file" style={{ display: 'none' }} onChange={onFileChange}
          {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} />

        {phase === 'selected' && selection ? (
          /* Valgt-tilstand: vis fil/zip-info */
          <div style={{
            background: C.surface2,
            border: `1px solid ${selection.willZip ? C.accentBorder : 'rgba(76,175,125,0.3)'}`,
            borderRadius: 8, padding: '8px 10px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>
                  {selection.willZip ? '📦' : '📄'}
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600,
                    color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    marginBottom: 1,
                  }}>
                    {selection.displayName}
                  </p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>
                    {formatFileSize(selection.approxSize)}
                    {selection.willZip && ' · zippes ved opplasting'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleClear}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3,
                  textDecoration: 'underline', flexShrink: 0, padding: '2px 4px',
                }}
              >
                Fjern
              </button>
            </div>
          </div>
        ) : (
          /* Idle/loading-tilstand: liten dropsone */
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            style={{
              border: `1px dashed ${phase === 'dragging' ? C.accent : C.border}`,
              borderRadius: 8, padding: '10px 14px',
              background: phase === 'dragging' ? C.accentBg : 'none',
              transition: 'border-color 0.15s, background 0.15s',
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <p style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3,
              textAlign: 'center', marginBottom: 8,
            }}>
              {phase === 'dragging' ? '↓ Slipp her' : phase === 'loading' ? 'Leser filer...' : '↑ Dra filer eller mappe hit, eller:'}
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                disabled={!isInteractive}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: '7px 8px', cursor: isInteractive ? 'pointer' : 'default',
                  background: 'none', color: C.text3,
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { if (isInteractive) { (e.currentTarget as HTMLButtonElement).style.borderColor = C.accent; (e.currentTarget as HTMLButtonElement).style.color = C.text } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
              >
                📄 Velg filer
              </button>
              <button
                type="button"
                disabled={!isInteractive}
                onClick={() => dirInputRef.current?.click()}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  border: `1px solid ${C.border}`, borderRadius: 6,
                  padding: '7px 8px', cursor: isInteractive ? 'pointer' : 'default',
                  background: 'none', color: C.text3,
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem',
                  transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { if (isInteractive) { (e.currentTarget as HTMLButtonElement).style.borderColor = C.accent; (e.currentTarget as HTMLButtonElement).style.color = C.text } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
              >
                📁 Velg mappe
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---- Large variant (TransferUploadClient) ----
  return (
    <div>
      {/* Skjulte fil-inputs */}
      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={onFileChange} />
      <input ref={dirInputRef} type="file" style={{ display: 'none' }} onChange={onFileChange}
        {...({ webkitdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)} />

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          border: `2px dashed ${
            phase === 'dragging' ? C.accent :
            phase === 'selected' ? 'rgba(76,175,125,0.5)' :
            C.border
          }`,
          borderRadius: 14,
          background: phase === 'dragging' ? C.accentBg : C.surface,
          padding: '60px 32px',
          textAlign: 'center',
          cursor: isInteractive ? 'default' : 'default',
          transition: 'border-color 0.2s, background 0.2s',
          minHeight: 320,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        {(phase === 'idle' || phase === 'dragging') && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: phase === 'dragging' ? C.accentBg : C.surface2,
              border: `1px solid ${phase === 'dragging' ? C.accentBorder : C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.4rem', transition: 'all 0.2s',
            }}>
              {phase === 'dragging' ? '↓' : '↑'}
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.95rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
                {phase === 'dragging' ? 'Slipp filer eller mapper her' : 'Dra og slipp filer eller mapper her'}
              </p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                Enkeltfil lastes opp som den er — flere filer/mapper zippes automatisk
              </p>
            </div>
            {deliveryType && (
              <div style={{
                marginTop: 4, padding: '4px 12px',
                background: deliveryType === 'video' ? 'rgba(124,92,252,0.08)' : 'rgba(74,154,196,0.08)',
                border: `1px solid ${deliveryType === 'video' ? 'rgba(124,92,252,0.25)' : 'rgba(74,154,196,0.25)'}`,
                borderRadius: 20,
              }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: deliveryType === 'video' ? C.accent : '#4A9AC4' }}>
                  {deliveryType === 'video' ? '🎬 Film-leveranse' : '🖼️ Bilde-leveranse'}
                </span>
              </div>
            )}
            {/* Klikk-knapper */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '9px 18px', cursor: 'pointer',
                  background: C.surface2, color: C.text2,
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.accent }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border }}
              >
                📄 Velg filer
              </button>
              <button
                type="button"
                onClick={() => dirInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '9px 18px', cursor: 'pointer',
                  background: C.surface2, color: C.text2,
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.accent }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border }}
              >
                📁 Velg mappe
              </button>
            </div>
          </>
        )}

        {phase === 'loading' && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: C.accentBg, border: `1px solid ${C.accentBorder}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.4rem',
            }}>⏳</div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: C.text }}>
              Leser mappestruktur...
            </p>
          </>
        )}

        {phase === 'selected' && selection && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(76,175,125,0.10)',
              border: '1px solid rgba(76,175,125,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.4rem',
            }}>
              {selection.willZip ? '📦' : '📄'}
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
                {selection.displayName}
              </p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                {formatFileSize(selection.approxSize)}
                {selection.willZip && ' — zippes ved opplasting'}
              </p>
            </div>
            <button
              onClick={handleClear}
              style={{
                marginTop: 4, background: 'none', border: 'none',
                cursor: 'pointer', fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.72rem', color: C.text3, textDecoration: 'underline',
              }}
            >
              Fjern
            </button>
          </>
        )}
      </div>
    </div>
  )
}
