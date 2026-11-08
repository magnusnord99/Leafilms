'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import { saveReviewMark, respondToGalleryReview, addReviewPin, updateReviewPin, deleteReviewPin } from '@/lib/actions/gallery-reviews'
import type { AdminSelectionPageData } from '@/lib/actions/selection-albums'
import type { GalleryReview, GalleryReviewMark, GalleryReviewPin } from '@/lib/types'
import { C } from '@/lib/admin-theme'

type ReviewImage = {
  id: string
  filename: string
  signedUrl: string
  albumName: string
}

export default function GalleryReviewClient({
  data,
  isReviewer,
}: {
  data: { review: GalleryReview; marks: GalleryReviewMark[]; pins: GalleryReviewPin[]; gallery: AdminSelectionPageData }
  isReviewer: boolean
}) {
  const router = useRouter()
  const { review, gallery } = data
  // Alle andre enn den faktiske reviewer (f.eks. den som ba om reviewen) skal bare
  // kunne se markeringene som er lagret så langt — ikke redigere dem eller sende inn
  // reviewen på reviewers vegne. saveReviewMark/respondToGalleryReview har samme
  // sjekk server-side, dette er bare for å ikke by på knapper som uansett avvises.
  const readOnly = !isReviewer && review.status === 'pending'
  // Leverings-galleri (ferdigredigerte bilder) skal aldri kunne fjerne/legge til
  // bilder her — alt det ble avgjort i seleksjonen. Reviewer skal kun vurdere
  // redigeringen: kommentere og merke godkjent/trenger endring per bilde.
  const isDelivery = gallery.gallery.gallery_type === 'delivery'

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
  const [showUnreviewedWarning, setShowUnreviewedWarning] = useState(false)
  const [done, setDone] = useState<'approved' | 'changes_requested' | null>(review.status !== 'pending' ? review.status : null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const lightboxNoteRef = useRef<HTMLInputElement>(null)

  // Punkt-kommentarer på leverings-galleri-bilder (se 180_gallery_review_pins.sql) —
  // nøyaktig stedsangitt tilbakemelding i stedet for ett fritekstfelt pr. bilde.
  const [pinsByImage, setPinsByImage] = useState<Record<string, GalleryReviewPin[]>>(() => {
    const map: Record<string, GalleryReviewPin[]> = {}
    for (const p of data.pins) {
      map[p.image_id] = map[p.image_id] ?? []
      map[p.image_id].push(p)
    }
    return map
  })
  // null = ingen popover. pinId null = kladd (ikke lagret ennå), satt = redigerer eksisterende.
  const [activePin, setActivePin] = useState<{ imageId: string; pinId: string | null; x: number; y: number; text: string } | null>(null)
  const [savingPin, setSavingPin] = useState(false)
  const pinTextRef = useRef<HTMLTextAreaElement>(null)

  const lightboxImage = lightboxIndex !== null ? images[lightboxIndex] : null

  function pinsFor(imageId: string) {
    return pinsByImage[imageId] ?? []
  }

  useEffect(() => {
    if (lightboxIndex === null) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (activePin) { setActivePin(null); return }
        setLightboxIndex(null)
        return
      }
      // Uten denne sjekken kapret piltastene navigasjonen selv når man satt og
      // skrev i notat-feltet i fullskjerm — cursoren skulle flytte seg i teksten,
      // ikke bytte bilde (feedback 89425513). Escape skal fortsatt lukke uansett fokus.
      const target = e.target as HTMLElement | null
      const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      if (isTyping) return
      if (e.key === 'ArrowRight') { setActivePin(null); setLightboxIndex(i => (i === null ? i : Math.min(i + 1, images.length - 1))) }
      else if (e.key === 'ArrowLeft') { setActivePin(null); setLightboxIndex(i => (i === null ? i : Math.max(i - 1, 0))) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [lightboxIndex, images.length, activePin])

  function handleImageAreaClick(e: ReactMouseEvent<HTMLDivElement>) {
    if (readOnly || !isDelivery || !lightboxImage) return
    const rect = e.currentTarget.getBoundingClientRect()
    const xPct = ((e.clientX - rect.left) / rect.width) * 100
    const yPct = ((e.clientY - rect.top) / rect.height) * 100
    setActivePin({ imageId: lightboxImage.id, pinId: null, x: xPct, y: yPct, text: '' })
  }

  function handlePinMarkerClick(e: ReactMouseEvent, pin: GalleryReviewPin) {
    e.stopPropagation()
    setActivePin({ imageId: pin.image_id, pinId: pin.id, x: pin.x_pct, y: pin.y_pct, text: pin.text })
  }

  async function handleSavePin() {
    if (!activePin || !activePin.text.trim()) return
    setSavingPin(true)
    if (activePin.pinId) {
      const result = await updateReviewPin(activePin.pinId, review.id, activePin.text)
      if (result.ok) {
        setPinsByImage(prev => ({
          ...prev,
          [activePin.imageId]: (prev[activePin.imageId] ?? []).map(p => p.id === activePin.pinId ? { ...p, text: activePin.text.trim() } : p),
        }))
        setActivePin(null)
      } else alert(result.error ?? 'Noe gikk galt')
    } else {
      const result = await addReviewPin(review.id, activePin.imageId, activePin.x, activePin.y, activePin.text)
      if (result.ok && result.pin) {
        setPinsByImage(prev => ({ ...prev, [activePin.imageId]: [...(prev[activePin.imageId] ?? []), result.pin!] }))
        setActivePin(null)
        // En kommentar betyr at bildet trenger endring — ikke noe reviewer skal
        // måtte huske å markere separat.
        await setDecision(activePin.imageId, false)
      } else alert(result.error ?? 'Noe gikk galt')
    }
    setSavingPin(false)
  }

  async function handleDeletePin() {
    if (!activePin?.pinId) return
    setSavingPin(true)
    const result = await deleteReviewPin(activePin.pinId, review.id)
    setSavingPin(false)
    if (result.ok) {
      setPinsByImage(prev => ({ ...prev, [activePin.imageId]: (prev[activePin.imageId] ?? []).filter(p => p.id !== activePin.pinId) }))
      setActivePin(null)
    } else alert(result.error ?? 'Noe gikk galt')
  }

  function markFor(imageId: string) {
    return marks[imageId] ?? { keep: true, note: '' }
  }

  // Bilder uten en eksplisitt lagret markering vises IKKE som "Godkjent"/"Behold" —
  // det defaultverdien i markFor() bare betyr internt (ingen handling = beholdes ved
  // innsending). Viste vi den som grønn "Godkjent" så alt i et helt nytt review-runde
  // ut som ferdig vurdert før reviewer har rørt noe (feedback b54f1335/c745468c).
  function isUnreviewed(imageId: string) {
    return !(imageId in marks)
  }

  async function toggleKeep(imageId: string) {
    if (readOnly) return
    const current = markFor(imageId)
    const next = { ...current, keep: !current.keep }
    setMarks(prev => ({ ...prev, [imageId]: next }))
    await saveReviewMark(review.id, imageId, next.keep, next.note)
  }

  // Eksplisitt Godkjent/Trenger endring-valg for leverings-review (i stedet for
  // én toggle-knapp) — og samme funksjon brukes til å auto-sette "Trenger endring"
  // når en punkt-kommentar legges til (feedback fra Magnus: en kommentar skal bety
  // at bildet trenger endring, ikke stå som uvurdert ved siden av en kommentar).
  async function setDecision(imageId: string, keep: boolean) {
    if (readOnly) return
    const current = markFor(imageId)
    const next = { ...current, keep }
    setMarks(prev => ({ ...prev, [imageId]: next }))
    await saveReviewMark(review.id, imageId, keep, next.note)
  }

  async function saveNote(imageId: string, note: string) {
    if (readOnly) return
    const current = markFor(imageId)
    setMarks(prev => ({ ...prev, [imageId]: { ...current, note } }))
    await saveReviewMark(review.id, imageId, current.keep, note)
  }

  async function handleDecision(decision: 'approved' | 'changes_requested') {
    // Leverings-review: hvert bilde skal være eksplisitt vurdert (Godkjent eller
    // Trenger endring) før innsending — ikke la noen stå uvurdert og bli stille
    // tolket som godkjent (feedback fra Magnus).
    if (isDelivery && unreviewedImages.length > 0) {
      setShowUnreviewedWarning(true)
      return
    }
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
  const unreviewedImages = isDelivery ? images.filter(img => isUnreviewed(img.id)) : []

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
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 700, color: C.text }}>
          {readOnly
            ? 'Forhåndsvisning av tilbakemeldinger'
            : (isDelivery ? 'Gjennomgå redigerte bilder' : 'Gjennomgå bildeutvalg')}
        </h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginTop: 2 }}>
          {readOnly ? (
            <>
              {review.reviewer?.name ?? review.reviewer?.email ?? 'Reviewer'} har ikke sendt inn reviewen ennå —
              dette viser det som er markert og notert så langt, og oppdateres ikke automatisk.
              {Object.keys(marks).length > 0 && ` ${Object.keys(marks).length} av ${images.length} bilder vurdert.`}
              {excludedCount > 0 && ` ${excludedCount} ${isDelivery ? 'trenger endring' : 'tas ikke med'}.`}
            </>
          ) : isDelivery ? (
            <>
              Vurder graden på redigeringen og legg på en kommentar der noe må endres. Ingen bilder
              fjernes eller legges til her — det er allerede avgjort.
              {excludedCount > 0 && ` ${excludedCount} bilde${excludedCount === 1 ? '' : 'r'} trenger endring.`}
            </>
          ) : (
            <>
              Skru av bilder som ikke skal med til kunden, og legg gjerne på et notat — f.eks. hvis du savner et alternativt bilde av noe.
              {excludedCount > 0 && ` ${excludedCount} bilde${excludedCount === 1 ? '' : 'r'} skjules ved godkjenning.`}
            </>
          )}
        </p>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
        {Object.entries(byAlbum).map(([albumName, imgs]) => (
          <div key={albumName} style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: C.text3, marginBottom: 10 }}>{albumName}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {imgs.map(img => {
                const mark = markFor(img.id)
                const unreviewed = isUnreviewed(img.id)
                return (
                  <div key={img.id} style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.surface, opacity: !unreviewed && !mark.keep ? 0.45 : 1 }}>
                    <div
                      onClick={() => { setActivePin(null); setLightboxIndex(images.findIndex(i => i.id === img.id)) }}
                      style={{ aspectRatio: '4/3', background: C.surface2, cursor: 'zoom-in' }}
                    >
                      {img.signedUrl && <img src={img.signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />}
                    </div>
                    <div style={{ padding: '7px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {isDelivery ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => setDecision(img.id, true)}
                            disabled={readOnly}
                            style={{
                              flex: 1, padding: '5px', borderRadius: 5, border: 'none', cursor: readOnly ? 'default' : 'pointer',
                              fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600,
                              background: !unreviewed && mark.keep ? 'rgba(76,175,125,0.18)' : C.surface2,
                              color: !unreviewed && mark.keep ? '#4CAF7D' : C.text3,
                            }}
                          >
                            ✓ Godkjent
                          </button>
                          <button
                            onClick={() => setDecision(img.id, false)}
                            disabled={readOnly}
                            style={{
                              flex: 1, padding: '5px', borderRadius: 5, border: 'none', cursor: readOnly ? 'default' : 'pointer',
                              fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600,
                              background: !unreviewed && !mark.keep ? 'rgba(212,100,90,0.18)' : C.surface2,
                              color: !unreviewed && !mark.keep ? '#D4645A' : C.text3,
                            }}
                          >
                            ✗ Trenger endring
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleKeep(img.id)}
                          disabled={readOnly}
                          style={{
                            padding: '5px', borderRadius: 5, border: 'none', cursor: readOnly ? 'default' : 'pointer',
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600,
                            background: unreviewed ? C.surface2 : (mark.keep ? 'rgba(76,175,125,0.12)' : 'rgba(212,100,90,0.15)'),
                            color: unreviewed ? C.text3 : (mark.keep ? '#4CAF7D' : '#D4645A'),
                          }}
                        >
                          {unreviewed ? 'Ikke vurdert ennå' : (mark.keep ? '✓ Behold i utvalg' : '✗ Tas ikke med')}
                        </button>
                      )}
                      {isDelivery ? (
                        pinsFor(img.id).length > 0 && (
                          <p style={{ margin: 0, fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.accent, lineHeight: 1.3 }}>
                            📍 {pinsFor(img.id).length} kommentar{pinsFor(img.id).length === 1 ? '' : 'er'} på bildet
                          </p>
                        )
                      ) : readOnly ? (
                        mark.note && (
                          <p style={{ margin: 0, fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text2, lineHeight: 1.3 }}>{mark.note}</p>
                        )
                      ) : (
                        <input
                          defaultValue={mark.note}
                          onBlur={e => saveNote(img.id, e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                          placeholder="Notat (kun internt)..."
                          style={{ width: '100%', boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5, padding: '5px 7px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none' }}
                        />
                      )}
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
          onClick={() => { setActivePin(null); setLightboxIndex(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <button
            onClick={() => { setActivePin(null); setLightboxIndex(null) }}
            style={{ position: 'absolute', top: 16, right: 20, background: 'none', border: 'none', color: '#fff', fontSize: '1.6rem', cursor: 'pointer', lineHeight: 1 }}
            aria-label="Lukk"
          >
            ×
          </button>

          {lightboxIndex! > 0 && (
            <button
              onClick={e => { e.stopPropagation(); setActivePin(null); setLightboxIndex(i => (i === null ? i : i - 1)) }}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: '#fff', fontSize: '1.6rem', padding: '10px 14px', cursor: 'pointer' }}
              aria-label="Forrige bilde"
            >
              ‹
            </button>
          )}
          {lightboxIndex! < images.length - 1 && (
            <button
              onClick={e => { e.stopPropagation(); setActivePin(null); setLightboxIndex(i => (i === null ? i : i + 1)) }}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, color: '#fff', fontSize: '1.6rem', padding: '10px 14px', cursor: 'pointer' }}
              aria-label="Neste bilde"
            >
              ›
            </button>
          )}

          <div
            onClick={e => { e.stopPropagation(); if (isDelivery) handleImageAreaClick(e) }}
            style={{ position: 'relative', display: 'inline-block', cursor: isDelivery && !readOnly ? 'crosshair' : 'default' }}
          >
            <img
              src={lightboxImage.signedUrl}
              alt={lightboxImage.filename}
              style={{ maxWidth: '90vw', maxHeight: '75vh', display: 'block', borderRadius: 4 }}
            />

            {isDelivery && pinsFor(lightboxImage.id).map((pin, i) => (
              <button
                key={pin.id}
                onClick={e => handlePinMarkerClick(e, pin)}
                title={pin.text}
                style={{
                  position: 'absolute', left: `${pin.x_pct}%`, top: `${pin.y_pct}%`, transform: 'translate(-50%, -50%)',
                  width: 22, height: 22, borderRadius: '50%', border: '2px solid #fff', background: C.accent,
                  color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.5)', padding: 0,
                }}
              >
                {i + 1}
              </button>
            ))}

            {isDelivery && activePin && activePin.imageId === lightboxImage.id && (
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  position: 'absolute', left: `${activePin.x}%`, top: `${activePin.y}%`,
                  transform: 'translate(12px, 12px)', zIndex: 10, width: 220,
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                }}
              >
                {readOnly ? (
                  <p style={{ margin: 0, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text }}>{activePin.text}</p>
                ) : (
                  <>
                    <textarea
                      ref={pinTextRef}
                      autoFocus
                      value={activePin.text}
                      onChange={e => setActivePin(prev => prev ? { ...prev, text: e.target.value } : prev)}
                      placeholder="Kommentar på dette punktet..."
                      rows={3}
                      style={{ width: '100%', boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5, padding: '6px 8px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', outline: 'none', resize: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                      {activePin.pinId && (
                        <button
                          onClick={handleDeletePin}
                          disabled={savingPin}
                          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: C.danger, background: 'none', border: 'none', cursor: 'pointer', marginRight: 'auto' }}
                        >
                          Slett
                        </button>
                      )}
                      <button
                        onClick={() => setActivePin(null)}
                        disabled={savingPin}
                        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: C.text3, background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Avbryt
                      </button>
                      <button
                        onClick={handleSavePin}
                        disabled={savingPin || !activePin.text.trim()}
                        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: '#fff', background: C.accent, border: 'none', borderRadius: 5, padding: '5px 10px', cursor: 'pointer', opacity: !activePin.text.trim() ? 0.5 : 1 }}
                      >
                        Lagre
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div
            onClick={e => e.stopPropagation()}
            style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', width: '100%', maxWidth: 480 }}
          >
            {isDelivery ? (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => setDecision(lightboxImage.id, true)}
                  disabled={readOnly}
                  style={{
                    padding: '8px 14px', borderRadius: 6, border: 'none', cursor: readOnly ? 'default' : 'pointer',
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                    background: !isUnreviewed(lightboxImage.id) && markFor(lightboxImage.id).keep ? 'rgba(76,175,125,0.22)' : 'rgba(255,255,255,0.1)',
                    color: !isUnreviewed(lightboxImage.id) && markFor(lightboxImage.id).keep ? '#4CAF7D' : 'rgba(255,255,255,0.65)',
                  }}
                >
                  ✓ Godkjent
                </button>
                <button
                  onClick={() => setDecision(lightboxImage.id, false)}
                  disabled={readOnly}
                  style={{
                    padding: '8px 14px', borderRadius: 6, border: 'none', cursor: readOnly ? 'default' : 'pointer',
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                    background: !isUnreviewed(lightboxImage.id) && !markFor(lightboxImage.id).keep ? 'rgba(212,100,90,0.25)' : 'rgba(255,255,255,0.1)',
                    color: !isUnreviewed(lightboxImage.id) && !markFor(lightboxImage.id).keep ? '#D4645A' : 'rgba(255,255,255,0.65)',
                  }}
                >
                  ✗ Trenger endring
                </button>
              </div>
            ) : (
              <button
                onClick={() => toggleKeep(lightboxImage.id)}
                disabled={readOnly}
                style={{
                  padding: '8px 14px', borderRadius: 6, border: 'none', cursor: readOnly ? 'default' : 'pointer', flexShrink: 0,
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                  background: isUnreviewed(lightboxImage.id) ? 'rgba(255,255,255,0.1)' : (markFor(lightboxImage.id).keep ? 'rgba(76,175,125,0.18)' : 'rgba(212,100,90,0.2)'),
                  color: isUnreviewed(lightboxImage.id) ? 'rgba(255,255,255,0.65)' : (markFor(lightboxImage.id).keep ? '#4CAF7D' : '#D4645A'),
                }}
              >
                {isUnreviewed(lightboxImage.id) ? 'Ikke vurdert ennå' : (markFor(lightboxImage.id).keep ? '✓ Behold i utvalg' : '✗ Tas ikke med')}
              </button>
            )}
            {isDelivery ? (
              <p style={{ flex: 1, margin: 0, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                {readOnly ? 'Klikk på et punkt for å lese kommentaren.' : 'Klikk på bildet for å legge en kommentar på det stedet.'}
              </p>
            ) : readOnly ? (
              markFor(lightboxImage.id).note && (
                <p style={{ flex: 1, margin: 0, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)' }}>{markFor(lightboxImage.id).note}</p>
              )
            ) : (
              <>
                <input
                  ref={lightboxNoteRef}
                  key={lightboxImage.id}
                  defaultValue={markFor(lightboxImage.id).note}
                  onBlur={e => saveNote(lightboxImage.id, e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  placeholder="Notat (kun internt)..."
                  style={{ flex: 1, boxSizing: 'border-box', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '8px 10px', color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none' }}
                />
                <button
                  onClick={() => lightboxNoteRef.current?.blur()}
                  title="Lagre notat (Enter)"
                  style={{ flexShrink: 0, padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                >
                  Lagre
                </button>
              </>
            )}
          </div>
          <p style={{ marginTop: 10, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)' }}>
            {lightboxIndex! + 1} / {images.length} · Esc for å lukke · ← → for å bla
          </p>
        </div>
      )}

      {showUnreviewedWarning && unreviewedImages.length > 0 && (
        <div
          onClick={() => setShowUnreviewedWarning(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, maxWidth: 440, width: '100%', maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
          >
            <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.92rem', fontWeight: 700, color: C.text, margin: 0 }}>
              ⚠ {unreviewedImages.length} bilde{unreviewedImages.length === 1 ? '' : 'r'} krever handling
            </h2>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem', color: C.text3, marginTop: 4, marginBottom: 14 }}>
              Disse er ikke vurdert ennå. Godkjenn eller be om endringer på de siste før du sender inn.
            </p>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {unreviewedImages.map(img => (
                <div key={img.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    onClick={() => { setShowUnreviewedWarning(false); setActivePin(null); setLightboxIndex(images.findIndex(i => i.id === img.id)) }}
                    style={{ width: 40, height: 40, borderRadius: 6, overflow: 'hidden', cursor: 'zoom-in', flexShrink: 0, background: C.surface2 }}
                  >
                    {img.signedUrl && <img src={img.signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  </div>
                  <span style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {img.filename}
                  </span>
                  <button
                    onClick={() => setDecision(img.id, true)}
                    title="Godkjent"
                    style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(76,175,125,0.15)', color: '#4CAF7D', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => setDecision(img.id, false)}
                    title="Trenger endring"
                    style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 6, border: 'none', background: 'rgba(212,100,90,0.15)', color: '#D4645A', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ✗
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowUnreviewedWarning(false)}
              style={{ marginTop: 16, alignSelf: 'flex-end', padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`, background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}
            >
              Lukk
            </button>
          </div>
        </div>
      )}

      {readOnly ? (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: '10px 24px', textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
            Kun {review.reviewer?.name ?? review.reviewer?.email ?? 'reviewer'} kan sende inn denne reviewen.
          </span>
        </div>
      ) : (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.border}`, padding: '12px 24px', display: 'flex', gap: 12, alignItems: 'flex-end', justifyContent: 'center' }}>
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Overordnet kommentar (påkrevd ved «Be om endringer»)..."
            rows={2}
            style={{ flex: 1, maxWidth: 480, boxSizing: 'border-box', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none', resize: 'none' }}
          />
          {/* På leveringsreview styres hvilken knapp som vises av bildemerkingene —
              enten alt er godkjent (kun "Godkjenn"), eller noe trenger endring
              (kun "Be om endringer"). På seleksjonsreview betyr "trenger endring"
              noe annet (ekskluder fra kunde) og skal ikke låse valget, så der vises
              begge knappene som før. */}
          {(!isDelivery || excludedCount > 0) && (
            <button
              onClick={() => handleDecision('changes_requested')}
              disabled={submitting !== null}
              style={{ padding: '10px 16px', borderRadius: 7, border: `1px solid ${C.border}`, background: 'none', color: '#D4645A', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
            >
              {submitting === 'changes_requested' ? '...' : 'Be om endringer'}
            </button>
          )}
          {(!isDelivery || excludedCount === 0) && (
            <button
              onClick={() => handleDecision('approved')}
              disabled={submitting !== null}
              style={{ padding: '10px 18px', borderRadius: 7, border: 'none', background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}
            >
              {submitting === 'approved' ? '...' : 'Godkjenn'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
