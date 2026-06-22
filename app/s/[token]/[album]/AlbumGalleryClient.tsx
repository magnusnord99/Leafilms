'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toggleImageSelection } from '@/lib/actions/selections'
import { toggleAlbumImagePick, submitAlbumPicks } from '@/lib/actions/selection-picks'
import type { SelectionAlbum } from '@/lib/actions/selection-albums'
import type { AlbumForCustomer } from '@/lib/actions/selections'
import type { AlbumImageWithPick } from '@/lib/actions/selection-picks'

const S = {
  bg:      '#0C0B09',
  surface: '#131210',
  surface2:'#1A1916',
  border:  '#2A2820',
  gold:    '#C49434',
  text:    '#E8E0D0',
  text2:   '#8A8070',
  text3:   '#5A5448',
  green:   '#4CAF7D',
  warning: '#D4863A',
}

type MainImage = AlbumForCustomer['images'][number]
type AnyImage = MainImage | AlbumImageWithPick

function isSelected(img: AnyImage, isDirect: boolean): boolean {
  if (isDirect) return (img as AlbumImageWithPick).pick?.selected ?? false
  return (img as MainImage).selected
}

function getComment(img: AnyImage, isDirect: boolean): string | null {
  if (isDirect) return (img as AlbumImageWithPick).pick?.comment ?? null
  return (img as MainImage).comment
}

export default function AlbumGalleryClient({
  token,
  galleryToken,
  album,
  images: initialImages,
  totalSelected: initialTotal,
  targetCount,
  isDirectAlbumLink,
}: {
  token: string
  galleryToken?: string
  album: SelectionAlbum | AlbumForCustomer
  images: AnyImage[]
  totalSelected?: number
  targetCount?: number | null
  isDirectAlbumLink: boolean
}) {
  const router = useRouter()
  const [images, setImages] = useState(initialImages)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const localSelected = images.filter(img => isSelected(img, isDirectAlbumLink)).length
  const displayTotal = isDirectAlbumLink ? localSelected : (initialTotal ?? localSelected)
  const target = isDirectAlbumLink ? (album as SelectionAlbum).album_target_count : (targetCount ?? null)
  const isOver = target != null && (isDirectAlbumLink ? localSelected : displayTotal) > target

  const handleToggle = useCallback(async (imageId: string) => {
    const img = images.find(i => i.id === imageId)
    if (!img) return
    const newSelected = !isSelected(img, isDirectAlbumLink)

    setImages(prev => prev.map(i => {
      if (i.id !== imageId) return i
      if (isDirectAlbumLink) {
        const cast = i as AlbumImageWithPick
        return { ...cast, pick: { ...(cast.pick ?? { id: '', album_id: '', image_id: imageId, comment: null }), selected: newSelected, selected_at: newSelected ? new Date().toISOString() : null } }
      }
      return { ...(i as MainImage), selected: newSelected, selected_at: newSelected ? new Date().toISOString() : null }
    }))

    if (isDirectAlbumLink) {
      await toggleAlbumImagePick(token, imageId, newSelected)
    } else {
      await toggleImageSelection(galleryToken!, imageId, newSelected)
    }
  }, [images, token, galleryToken, isDirectAlbumLink])

  async function handleSubmit() {
    setSubmitting(true)
    if (isDirectAlbumLink) {
      await submitAlbumPicks(token)
    }
    setSubmitted(true)
    setShowConfirm(false)
    setSubmitting(false)
  }

  useEffect(() => {
    if (lightboxIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') setLightboxIndex(p => p !== null ? Math.min(p + 1, images.length - 1) : null)
      if (e.key === 'ArrowLeft') setLightboxIndex(p => p !== null ? Math.max(p - 1, 0) : null)
      if (e.key === 'Escape') setLightboxIndex(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, images.length])

  const albumName = 'name' in album ? album.name : ''
  const counterLabel = target != null
    ? `${isDirectAlbumLink ? localSelected : displayTotal} av ${target} valgt`
    : `${isDirectAlbumLink ? localSelected : displayTotal} valgt`
  const counterColor = isOver ? S.warning : S.text

  if (submitted && isDirectAlbumLink) {
    return (
      <div style={{ minHeight: '100dvh', background: S.bg }}>
        <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: '13px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase' }}>Leafilms</span>
          <span style={{ fontFamily: 'sans-serif', fontSize: '0.7rem', color: S.green }}>✓ Innsendt</span>
        </div>
        <div style={{ maxWidth: 480, margin: '48px auto', padding: '0 16px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.95rem', color: S.green, fontWeight: 600 }}>Takk! Ditt utvalg er mottatt.</p>
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.8rem', color: S.text2, marginTop: 8 }}>
            Du valgte {localSelected} {localSelected === 1 ? 'bilde' : 'bilder'}.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: S.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!isDirectAlbumLink && galleryToken && (
            <button
              onClick={() => router.push(`/s/${galleryToken}`)}
              style={{ background: 'none', border: 'none', color: S.text2, cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }}
            >‹</button>
          )}
          <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase' }}>Leafilms</span>
          {albumName && <span style={{ fontFamily: 'sans-serif', fontSize: '0.75rem', color: S.text3 }}>· {albumName}</span>}
        </div>
        <span style={{ fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600, color: counterColor }}>{counterLabel}</span>
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
          {images.map((img, idx) => {
            const sel = isSelected(img, isDirectAlbumLink)
            const signedUrl = (img as { signedUrl: string }).signedUrl
            return (
              <div
                key={img.id}
                style={{ borderRadius: 7, overflow: 'hidden', border: `2px solid ${sel ? S.gold : 'transparent'}`, background: S.surface2, transition: 'border-color 0.12s' }}
              >
                <div
                  style={{ position: 'relative', aspectRatio: '4/3', cursor: 'pointer' }}
                  onClick={() => setLightboxIndex(idx)}
                >
                  {signedUrl
                    ? <img src={signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.6rem', color: S.text3 }}>{img.filename}</span>
                      </div>
                  }
                  {getComment(img, isDirectAlbumLink) && (
                    <div style={{ position: 'absolute', top: 4, left: 4, width: 7, height: 7, borderRadius: '50%', background: S.gold }} />
                  )}
                </div>
                <div style={{ padding: '4px 5px 5px' }}>
                  <button
                    onClick={() => handleToggle(img.id)}
                    style={{
                      width: '100%', padding: '5px', borderRadius: 5, border: 'none',
                      fontFamily: 'sans-serif', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                      background: sel ? S.gold : S.surface,
                      color: sel ? '#0C0B09' : S.text2,
                      transition: 'background 0.12s',
                    }}
                  >
                    {sel ? '✓ Valgt' : 'Velg'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Send inn */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${S.border}`, background: S.surface, flexShrink: 0 }}>
        <button
          onClick={() => {
            if (isDirectAlbumLink) setShowConfirm(true)
            else router.push(`/s/${galleryToken}/review`)
          }}
          disabled={localSelected === 0}
          style={{
            width: '100%', padding: '12px', borderRadius: 9, border: 'none',
            fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600,
            cursor: localSelected > 0 ? 'pointer' : 'not-allowed',
            background: localSelected > 0 ? S.gold : S.surface2,
            color: localSelected > 0 ? '#0C0B09' : S.text3,
          }}
        >
          {isDirectAlbumLink ? `Send inn utvalg (${localSelected})` : `Gå til gjennomgang`}
        </button>
      </div>

      {/* Bekreft-modal for direkte album-link */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(12,11,9,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50 }}>
          <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, padding: '28px 24px', maxWidth: 360, width: '100%' }}>
            <p style={{ fontFamily: 'sans-serif', fontSize: '1rem', color: S.text, fontWeight: 600, marginBottom: 12 }}>Send inn utvalg?</p>
            <p style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', color: S.text2, marginBottom: 22 }}>
              Du sender inn {localSelected} {localSelected === 1 ? 'bilde' : 'bilder'}. Dette kan ikke endres etterpå.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${S.border}`, background: 'none', color: S.text2, fontFamily: 'sans-serif', fontSize: '0.85rem', cursor: 'pointer' }}>Avbryt</button>
              <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: S.gold, color: '#0C0B09', fontFamily: 'sans-serif', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Sender...' : 'Bekreft'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (() => {
        const img = images[lightboxIndex]
        const signedUrl = (img as { signedUrl: string }).signedUrl
        const sel = isSelected(img, isDirectAlbumLink)
        return (
          <div
            style={{
              position: 'fixed', inset: 0, background: 'rgba(12,11,9,0.96)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', zIndex: 100, padding: 16,
            }}
            onClick={() => setLightboxIndex(null)}
          >
            {/* Topbar */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              padding: '12px 16px', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', background: 'rgba(12,11,9,0.8)',
            }}
              onClick={e => e.stopPropagation()}
            >
              <span style={{ fontFamily: 'sans-serif', fontSize: '0.75rem', color: S.text3 }}>
                {lightboxIndex + 1} / {images.length}
              </span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  onClick={() => handleToggle(img.id)}
                  style={{
                    padding: '6px 14px', borderRadius: 6, border: 'none',
                    fontFamily: 'sans-serif', fontSize: '0.78rem', fontWeight: 600,
                    cursor: 'pointer',
                    background: sel ? S.gold : 'rgba(255,255,255,0.08)',
                    color: sel ? '#0C0B09' : S.text,
                  }}
                >
                  {sel ? '✓ Valgt' : 'Velg'}
                </button>
                <button
                  onClick={() => setLightboxIndex(null)}
                  style={{ background: 'none', border: 'none', color: S.text2, fontSize: '1.2rem', cursor: 'pointer', padding: '4px 8px' }}
                >✕</button>
              </div>
            </div>

            {/* Bilde */}
            <div style={{ maxWidth: '90vw', maxHeight: '80vh', position: 'relative' }} onClick={e => e.stopPropagation()}>
              {signedUrl
                ? <img src={signedUrl} alt={img.filename} style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', display: 'block', borderRadius: 4 }} />
                : <div style={{ width: 400, height: 300, background: S.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ color: S.text3, fontSize: '0.75rem' }}>{img.filename}</span>
                  </div>
              }
            </div>

            {/* Nav-piler */}
            {lightboxIndex > 0 && (
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex(p => p !== null ? p - 1 : null) }}
                style={{
                  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,0.08)', border: 'none', color: S.text,
                  fontSize: '1.4rem', cursor: 'pointer', borderRadius: 6, padding: '10px 14px',
                }}
              >‹</button>
            )}
            {lightboxIndex < images.length - 1 && (
              <button
                onClick={e => { e.stopPropagation(); setLightboxIndex(p => p !== null ? p + 1 : null) }}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(255,255,255,0.08)', border: 'none', color: S.text,
                  fontSize: '1.4rem', cursor: 'pointer', borderRadius: 6, padding: '10px 14px',
                }}
              >›</button>
            )}
          </div>
        )
      })()}
    </div>
  )
}
