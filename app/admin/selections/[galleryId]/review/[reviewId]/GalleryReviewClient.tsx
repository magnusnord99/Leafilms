'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveReviewMark, respondToGalleryReview } from '@/lib/actions/gallery-reviews'
import type { AdminSelectionPageData } from '@/lib/actions/selection-albums'
import type { GalleryReview, GalleryReviewMark } from '@/lib/types'
import { C } from '@/lib/admin-theme'

type ReviewImage = {
  id: string
  filename: string
  signedUrl: string
  albumName: string
}

export default function GalleryReviewClient({
  data,
}: {
  data: { review: GalleryReview; marks: GalleryReviewMark[]; gallery: AdminSelectionPageData }
}) {
  const router = useRouter()
  const { review, gallery } = data

  const images: ReviewImage[] = useMemo(() => {
    const fromAlbums = gallery.albums.flatMap(a => a.images.map(img => ({
      id: img.id, filename: img.filename, signedUrl: img.signedUrl, albumName: a.name,
    })))
    const ungrouped = gallery.ungroupedImages.map(img => ({
      id: img.id, filename: img.filename, signedUrl: img.signedUrl, albumName: 'Uten mappe',
    }))
    return [...fromAlbums, ...ungrouped]
  }, [gallery])

  const initialMarks = useMemo(() => {
    const map: Record<string, { keep: boolean; note: string }> = {}
    for (const m of data.marks) map[m.image_id] = { keep: m.keep, note: m.note ?? '' }
    return map
  }, [data.marks])

  const [marks, setMarks] = useState(initialMarks)
  const [comment, setComment] = useState(review.comment ?? '')
  const [submitting, setSubmitting] = useState<'approved' | 'changes_requested' | null>(null)
  const [done, setDone] = useState<'approved' | 'changes_requested' | null>(review.status !== 'pending' ? review.status : null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)

  const lightboxImage = lightboxIndex !== null ? images[lightboxIndex] : null

  useEffect(() => {
    if (lightboxIndex === null) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightboxIndex(null)
      else if (e.key === 'ArrowRight') setLightboxIndex(i => (i === null ? i : Math.min(i + 1, images.length - 1)))
      else if (e.key === 'ArrowLeft') setLightboxIndex(i => (i === null ? i : Math.max(i - 1, 0)))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxIndex, images.length])

  function markFor(imageId: string) {
    return marks[imageId] ?? { keep: true, note: '' }
  }

  async function toggleKeep(imageId: string) {
    const current = markFor(imageId)
    const next = { ...current, keep: !current.keep }
    setMarks(prev => ({ ...prev, [imageId]: next }))
    await saveReviewMark(review.id, imageId, next.keep, next.note)
  }

  async function saveNote(imageId: string, note: string) {
    const current = markFor(imageId)
    setMarks(prev => ({ ...prev, [imageId]: { ...current, note } }))
    await saveReviewMark(review.id, imageId, current.keep, note)
  }

  async function handleDecision(decision: 'approved' | 'changes_requested') {
    if (decision === 'changes_requested' && !comment.trim()) {
      alert('Skriv en kommentar før du ber om endringer')
      return
    }
    setSubmitting(decision)
    const result = await respondToGalleryReview(review.id, decision, comment)
    setSubmitting(null)
    if (result.ok) setDone(decision)
    else alert(result.error ?? 'Noe gikk galt')
  }

  const excludedCount = Object.values(marks).filter(m => !m.keep).length

  if (done) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.1rem', fontWeight: 700, color: C.text, marginBottom: 8 }}>
            {done === 'approved' ? 'Godkjent' : 'Endringer sendt'}
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>
            {done === 'approved'
              ? 'Galleriet er nå åpent for kunden.'
              : 'Personen som ba om review har fått beskjed om kommentarene dine.'}
          </p>
          <button
            onClick={() => router.push('/admin/selections')}
            style={{ marginTop: 16, padding: '8px 16px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', cursor: 'pointer' }}
          >
            Til gallerioversikten
          </button>
        </div>
      </div>
    )
  }

  const byAlbum = images.reduce<Record<string, ReviewImage[]>>((acc, img) => {
    acc[img.albumName] = acc[img.albumName] ?? []
    acc[img.albumName].push(img)
    return acc
  }, {})

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 120 }}>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '14px 20px' }}>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 700, color: C.text }}>Gjennomgå bildeutvalg</h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginTop: 2 }}>
          Skru av bilder som ikke skal med til kunden, og legg gjerne på et notat — f.eks. hvis du savner et alternativt bilde av noe.
          {excludedCount > 0 && ` ${excludedCount} bilde${excludedCount === 1 ? '' : 'r'} skjules ved godkjenning.`}
        </p>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
        {Object.entries(byAlbum).map(([albumName, imgs]) => (
          <div key={albumName} style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: C.text3, marginBottom: 10 }}>{albumName}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {imgs.map(img => {
                const mark = markFor(img.id)
                return (
                  <div key={img.id} style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.surface, opacity: mark.keep ? 1 : 0.45 }}>
                    <div
                      onClick={() => setLightboxIndex(images.findIndex(i => i.id === img.id))}
                      style={{ aspectRatio: '4/3', background: C.surface2, cursor: 'zoom-in' }}
                    >
                      {img.signedUrl && <img src={img.signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />}
                    </div>
                    <div style={{ padding: '7px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <button
                        onClick={() => toggleKeep(img.id)}
                        style={{
                          padding: '5px', borderRadius: 5, border: 'none', cursor: 'pointer',
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600,
                          background: mark.keep ? 'rgba(76,175,125,0.12)' : 'rgba(212,100,90,0.15)',
                          color: mark.keep ? '#4CAF7D' : '#D4645A',
                        }}
                      >
                        {mark.keep ? '✓ Behold i utvalg' : '✗ Tas ikke med'}
                      </button>
                      <input
                        defaultValue={mark.note}
                        onBlur={e => saveNote(img.id, e.target.value)}
                        placeholder="Notat (kun internt)..."
                        style={{ width: '100%', boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5, padding: '5px 7px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', outline: 'none' }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {images.length === 0 && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, textAlign: 'center', marginTop: 40 }}>Ingen bilder i galleriet ennå.</p>
        )}
      </div>

      {lightboxImage && (
        <div
          onClick={() => setLightboxIndex(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <button
            onClick={() => setLightboxIndex(null)}
            style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: '1.6rem', cursor: 'pointer', lineHeight: 1 }}
            aria-label="Lukk"
          >
            ×
          </button>

          {lightboxIndex! > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setLightboxIndex(i => (i === null ? i : i - 1)) }}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: '#fff', fontSize: '1.6rem', padding: '10px 14px', cursor: 'pointer' }}
              aria-label="Forrige bilde"
            >
              ‹
            </button>
          )}
          {lightboxIndex! < images.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); setLightboxIndex(i => (i === null ? i : i + 1)) }}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: '#fff', fontSize: '1.6rem', padding: '10px 14px', cursor: 'pointer' }}
              aria-label="Neste bilde"
            >
              ›
            </button>
          )}

          <img
            src={lightboxImage.signedUrl}
            alt={lightboxImage.filename}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '75vh', objectFit: 'contain', borderRadius: 4 }}
          />

          <div
            onClick={e => e.stopPropagation()}
            style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', width: '100%', maxWidth: 480 }}
          >
            <button
              onClick={() => toggleKeep(lightboxImage.id)}
              style={{
                padding: '8px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', flexShrink: 0,
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                background: markFor(lightboxImage.id).keep ? 'rgba(76,175,125,0.18)' : 'rgba(212,100,90,0.2)',
                color: markFor(lightboxImage.id).keep ? '#4CAF7D' : '#D4645A',
              }}
            >
              {markFor(lightboxImage.id).keep ? '✓ Behold i utvalg' : '✗ Tas ikke med'}
            </button>
            <input
              defaultValue={markFor(lightboxImage.id).note}
              onBlur={e => saveNote(lightboxImage.id, e.target.value)}
              placeholder="Notat (kun internt)..."
              style={{ flex: 1, boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '8px 10px', color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', outline: 'none' }}
            />
          </div>
          <p style={{ marginTop: 10, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)' }}>
            {lightboxIndex! + 1} / {images.length} · Esc for å lukke · ← → for å bla
          </p>
        </div>
      )}

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: '12px 24px', display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'center' }}>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Overordnet kommentar (påkrevd ved «Be om endringer»)..."
          rows={2}
          style={{ flex: 1, maxWidth: 480, boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', outline: 'none', resize: 'none' }}
        />
        <button
          onClick={() => handleDecision('changes_requested')}
          disabled={submitting !== null}
          style={{ padding: '10px 16px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: '#D4645A', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
        >
          {submitting === 'changes_requested' ? '...' : 'Be om endringer'}
        </button>
        <button
          onClick={() => handleDecision('approved')}
          disabled={submitting !== null}
          style={{ padding: '10px 18px', borderRadius: 7, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
        >
          {submitting === 'approved' ? '...' : 'Godkjenn'}
        </button>
      </div>
    </div>
  )
}
