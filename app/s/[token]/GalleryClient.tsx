'use client'

import { useState, useCallback, useEffect } from 'react'
import type { SelectionGallery, SelectionImage } from '@/lib/actions/selections'
import { toggleImageSelection, addImageComment, submitGallery } from '@/lib/actions/selections'
import { SELECTION_STRINGS, type SelectionLanguage, type SelectionStrings } from './strings'

// CSS-klasser håndterer responsivitet — ingen isMobile-state som bryter hydration
const STYLES = `
  .g-root { display:flex; flex-direction:column; height:100dvh; background:#0C0B09; overflow:hidden; }
  .g-content { flex:1; display:flex; overflow:hidden; }
  .g-grid-wrap { flex:1; overflow-y:auto; padding:10px; }
  .g-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:6px; }
  .g-panel { width:300px; flex-shrink:0; border-left:1px solid #2A2820; background:#131210; display:flex; flex-direction:column; }
  .g-send-desktop { padding:12px 14px; border-top:1px solid #2A2820; }
  .g-send-mobile { display:none; padding:12px 0 4px; }
  @media (max-width:680px) {
    .g-content { flex-direction:column; }
    .g-panel { width:100%; border-left:none; border-top:1px solid #2A2820; max-height:280px; min-height:120px; }
    .g-send-desktop { display:none; }
    .g-send-mobile { display:block; }
  }
`

const S = {
  bg:      '#0C0B09',
  surface: '#131210',
  surface2:'#1A1916',
  border:  '#2A2820',
  gold:    '#C49434',
  goldBg:  'rgba(196,148,52,0.08)',
  text:    '#E8E0D0',
  text2:   '#8A8070',
  text3:   '#5A5448',
  green:   '#4CAF7D',
  warning: '#D4863A',
}

type ImageWithUrl = SelectionImage & { signedUrl: string }

export default function GalleryClient({
  token,
  gallery,
  images: initialImages,
  language = 'no',
}: {
  token: string
  gallery: SelectionGallery
  images: ImageWithUrl[]
  language?: SelectionLanguage
}) {
  const t = SELECTION_STRINGS[language]
  const [images, setImages] = useState(initialImages)
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(gallery.status === 'submitted')
  const [showConfirm, setShowConfirm] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [savingComment, setSavingComment] = useState(false)

  const selectedCount = images.filter(i => i.selected).length
  const target = gallery.target_count
  const isOver = target != null && selectedCount > target
  const activeImage = activeImageId ? images.find(i => i.id === activeImageId) ?? null : null

  // Reset draft når aktivt bilde skifter (state-justering under render, jf. react.dev)
  const [prevActiveImageId, setPrevActiveImageId] = useState(activeImageId)
  if (prevActiveImageId !== activeImageId) {
    setPrevActiveImageId(activeImageId)
    setCommentDraft(activeImage?.comment ?? '')
  }

  function nav(dir: number) {
    setLightboxIndex(prev => {
      if (prev === null) return null
      const next = Math.max(0, Math.min(images.length - 1, prev + dir))
      setActiveImageId(images[next].id)
      return next
    })
  }

  // Lightbox piltaster
  useEffect(() => {
    if (lightboxIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') nav(1)
      if (e.key === 'ArrowLeft') nav(-1)
      if (e.key === 'Escape') setLightboxIndex(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, images.length])

  const handleToggle = useCallback(async (imageId: string) => {
    if (submitted) return
    const img = images.find(i => i.id === imageId)
    if (!img) return
    const newSelected = !img.selected
    setImages(prev => prev.map(i =>
      i.id === imageId
        ? { ...i, selected: newSelected, selected_at: newSelected ? new Date().toISOString() : null }
        : i
    ))
    await toggleImageSelection(token, imageId, newSelected)
  }, [images, token, submitted])

  async function saveComment(imageId: string, text: string) {
    setSavingComment(true)
    await addImageComment(token, imageId, text.trim())
    setImages(prev => prev.map(i => i.id === imageId ? { ...i, comment: text.trim() || null } : i))
    setSavingComment(false)
  }

  function openLightbox(idx: number) {
    setLightboxIndex(idx)
    setActiveImageId(images[idx].id)
  }

  async function handleSubmit() {
    setSubmitting(true)
    await submitGallery(token)
    setSubmitted(true)
    setShowConfirm(false)
    setSubmitting(false)
  }

  if (submitted) {
    const selected = images.filter(i => i.selected)
    return (
      <>
        <style>{STYLES}</style>
        <div style={{ minHeight: '100dvh', background: S.bg }}>
          <SubmittedHeader t={t} />
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px' }}>
            <div style={{ background: S.surface, border: '1px solid rgba(76,175,125,0.3)', borderRadius: 12, padding: '20px 24px', marginBottom: 28, textAlign: 'center' }}>
              <p style={{ fontFamily: 'sans-serif', fontSize: '0.95rem', color: S.green, fontWeight: 600 }}>{t.submittedTitle}</p>
              <p style={{ fontFamily: 'sans-serif', fontSize: '0.8rem', color: S.text2, marginTop: 4 }}>
                {t.submittedBody(selected.length)}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
              {selected.map(img => (
                <div key={img.id} style={{ aspectRatio: '4/3', borderRadius: 6, overflow: 'hidden' }}>
                  {img.signedUrl
                    ? <img src={img.signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', background: S.surface2 }} />
                  }
                </div>
              ))}
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="g-root">
        <GalleryHeader selectedCount={selectedCount} target={target} isOver={isOver} t={t} />

        {isOver && (
          <div style={{ background: 'rgba(212,134,58,0.12)', borderBottom: '1px solid rgba(212,134,58,0.3)', padding: '8px 16px', textAlign: 'center', flexShrink: 0 }}>
            <p style={{ fontFamily: 'sans-serif', fontSize: '0.78rem', color: S.warning }}>
              {t.overWarning(selectedCount, target!)}
            </p>
          </div>
        )}

        <div className="g-content">
          {/* Grid */}
          <div className="g-grid-wrap">
            <div className="g-grid">
              {images.map((img, idx) => (
                <ImageCard
                  key={img.id}
                  img={img}
                  isActive={activeImageId === img.id}
                  onActivate={() => setActiveImageId(img.id)}
                  onLightbox={() => openLightbox(idx)}
                  onToggle={handleToggle}
                  t={t}
                />
              ))}
            </div>
            <div className="g-send-mobile">
              <SendButton selectedCount={selectedCount} onPress={() => setShowConfirm(true)} t={t} />
            </div>
          </div>

          {/* Kommentar-panel */}
          <div className="g-panel">
            <CommentPanel
              image={activeImage}
              commentDraft={commentDraft}
              onCommentChange={setCommentDraft}
              onSave={() => activeImage && saveComment(activeImage.id, commentDraft)}
              saving={savingComment}
              t={t}
            />
            <div className="g-send-desktop">
              <SendButton selectedCount={selectedCount} onPress={() => setShowConfirm(true)} t={t} />
            </div>
          </div>
        </div>

        {showConfirm && (
          <ConfirmModal
            selectedCount={selectedCount}
            target={target}
            isOver={isOver}
            onConfirm={handleSubmit}
            onCancel={() => setShowConfirm(false)}
            loading={submitting}
            t={t}
          />
        )}

        {lightboxIndex !== null && (
          <Lightbox
            images={images}
            index={lightboxIndex}
            commentDraft={commentDraft}
            onCommentChange={setCommentDraft}
            onSaveComment={() => activeImage && saveComment(activeImage.id, commentDraft)}
            savingComment={savingComment}
            onClose={() => setLightboxIndex(null)}
            onPrev={() => nav(-1)}
            onNext={() => nav(1)}
            onToggle={handleToggle}
            t={t}
          />
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function SubmittedHeader({ t }: { t: SelectionStrings }) {
  return (
    <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: '13px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase' }}>Leafilms</span>
      <span style={{ fontFamily: 'sans-serif', fontSize: '0.7rem', color: S.green }}>{t.submittedCheck}</span>
    </div>
  )
}

function GalleryHeader({ selectedCount, target, isOver, t }: { selectedCount: number; target: number | null; isOver: boolean; t: SelectionStrings }) {
  const isUnder = target != null && selectedCount < target
  const color = isOver ? S.warning : (!isUnder && target != null) ? S.green : S.text
  const label = t.selectedOf(selectedCount, target)
  return (
    <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
      <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase' }}>Leafilms</span>
      <span style={{ fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600, color }}>{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------

function ImageCard({ img, isActive, onActivate, onLightbox, onToggle, t }: {
  img: ImageWithUrl; isActive: boolean
  onActivate: () => void; onLightbox: () => void; onToggle: (id: string) => void
  t: SelectionStrings
}) {
  return (
    <div
      onClick={onActivate}
      style={{
        borderRadius: 7, overflow: 'hidden', cursor: 'pointer',
        border: `2px solid ${img.selected ? S.gold : isActive ? 'rgba(232,224,208,0.35)' : 'transparent'}`,
        transition: 'border-color 0.12s',
        background: S.surface2,
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '4/3' }}>
        {img.signedUrl
          ? <img src={img.signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '0.6rem', color: S.text3, padding: 4, textAlign: 'center' }}>{img.filename}</span>
            </div>
        }
        {img.comment && (
          <div style={{ position: 'absolute', top: 4, left: 4, width: 7, height: 7, borderRadius: '50%', background: S.gold }} />
        )}
        <button
          onClick={e => { e.stopPropagation(); onLightbox() }}
          style={{
            position: 'absolute', top: 4, right: 4, width: 24, height: 24,
            background: 'rgba(12,11,9,0.65)', border: 'none', borderRadius: 4,
            color: S.text2, fontSize: '0.8rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >⤢</button>
      </div>
      <div style={{ padding: '5px 5px 4px' }}>
        <button
          onClick={e => { e.stopPropagation(); onToggle(img.id) }}
          style={{
            width: '100%', padding: '5px', borderRadius: 5, border: 'none',
            fontFamily: 'sans-serif', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
            background: img.selected ? S.gold : S.surface,
            color: img.selected ? '#0C0B09' : S.text2,
            transition: 'background 0.12s',
          }}
        >
          {img.selected ? t.selectedShort : t.select}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function CommentPanel({ image, commentDraft, onCommentChange, onSave, saving, t }: {
  image: ImageWithUrl | null
  commentDraft: string; onCommentChange: (text: string) => void
  onSave: () => void; saving: boolean
  t: SelectionStrings
}) {
  const isDirty = commentDraft !== (image?.comment ?? '')

  if (!image) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <p style={{ fontFamily: 'sans-serif', fontSize: '0.8rem', color: S.text3, textAlign: 'center', lineHeight: 1.6 }}>
          {t.tapToCommentLine1}<br />{t.tapToCommentLine2}
        </p>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Bilde-header */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {image.signedUrl && (
          <img src={image.signedUrl} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
        )}
        <p style={{ fontFamily: 'sans-serif', fontSize: '0.7rem', color: S.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {image.filename}
        </p>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8 }}>
        {image.comment ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ maxWidth: '88%', padding: '9px 12px', borderRadius: '14px 14px 2px 14px', background: S.goldBg, border: '1px solid rgba(196,148,52,0.2)' }}>
              <p style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', color: S.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>
                {image.comment}
              </p>
            </div>
          </div>
        ) : (
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.72rem', color: S.text3, textAlign: 'center' }}>
            {t.noCommentYet}
          </p>
        )}
      </div>

      {/* Input */}
      <div style={{ padding: '8px 12px 10px', borderTop: `1px solid ${S.border}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={commentDraft}
            onChange={e => onCommentChange(e.target.value)}
            placeholder={t.writeComment}
            rows={2}
            style={{
              flex: 1, resize: 'none', fontFamily: 'sans-serif', fontSize: '0.82rem',
              color: S.text, background: S.bg, border: `1px solid ${S.border}`,
              borderRadius: 10, padding: '7px 10px', outline: 'none', lineHeight: 1.5,
            }}
          />
          <button
            onClick={onSave}
            disabled={saving || !isDirty}
            style={{
              width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: isDirty ? S.gold : S.surface2,
              color: isDirty ? '#0C0B09' : S.text3,
              cursor: isDirty ? 'pointer' : 'default',
              fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            {saving ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function SendButton({ selectedCount, onPress, t }: { selectedCount: number; onPress: () => void; t: SelectionStrings }) {
  const enabled = selectedCount > 0
  return (
    <button
      onClick={onPress}
      disabled={!enabled}
      style={{
        width: '100%', padding: '12px', borderRadius: 9, border: 'none',
        fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600,
        cursor: enabled ? 'pointer' : 'not-allowed',
        background: enabled ? S.gold : S.surface2,
        color: enabled ? '#0C0B09' : S.text3,
        transition: 'background 0.15s',
      }}
    >
      {t.submitSelection(selectedCount)}
    </button>
  )
}

// ---------------------------------------------------------------------------

function ConfirmModal({ selectedCount, target, isOver, onConfirm, onCancel, loading, t }: {
  selectedCount: number; target: number | null; isOver: boolean
  onConfirm: () => void; onCancel: () => void; loading: boolean
  t: SelectionStrings
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(12,11,9,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50 }}>
      <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, padding: '28px 24px', maxWidth: 360, width: '100%' }}>
        <p style={{ fontFamily: 'sans-serif', fontSize: '1rem', color: S.text, fontWeight: 600, marginBottom: 8 }}>{t.confirmTitle}</p>
        {isOver && (
          <div style={{ background: 'rgba(212,134,58,0.1)', border: '1px solid rgba(212,134,58,0.3)', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
            <p style={{ fontFamily: 'sans-serif', fontSize: '0.78rem', color: S.warning, margin: 0 }}>
              {t.confirmOverWarning(selectedCount, selectedCount - (target ?? 0))}
            </p>
          </div>
        )}
        <p style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', color: S.text2, marginBottom: 22 }}>
          {t.confirmBody(selectedCount)}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${S.border}`, background: 'none', color: S.text2, fontFamily: 'sans-serif', fontSize: '0.85rem', cursor: 'pointer' }}>{t.cancel}</button>
          <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: S.gold, color: '#0C0B09', fontFamily: 'sans-serif', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
            {loading ? t.sending : t.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Lightbox({ images, index, commentDraft, onCommentChange, onSaveComment, savingComment, onClose, onPrev, onNext, onToggle, t }: {
  images: ImageWithUrl[]; index: number
  commentDraft: string; onCommentChange: (text: string) => void
  onSaveComment: () => void; savingComment: boolean
  onClose: () => void; onPrev: () => void; onNext: () => void
  onToggle: (id: string) => void
  t: SelectionStrings
}) {
  const img = images[index]
  const isDirty = commentDraft !== (img?.comment ?? '')

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(12,11,9,0.97)', display: 'flex', flexDirection: 'column', zIndex: 100 }}
      onClick={onClose}
    >
      {/* Bilde */}
      <div
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '48px 60px 16px', minHeight: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {img?.signedUrl && (
          <img src={img.signedUrl} alt={img.filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }} />
        )}
        {index > 0 && (
          <button onClick={e => { e.stopPropagation(); onPrev() }} style={{ position: 'absolute', top: '50%', left: 12, transform: 'translateY(-50%)', width: 44, height: 44, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}>‹</button>
        )}
        {index < images.length - 1 && (
          <button onClick={e => { e.stopPropagation(); onNext() }} style={{ position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)', width: 44, height: 44, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}>›</button>
        )}
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', color: S.text, fontSize: '1rem', cursor: 'pointer' }}>×</button>
        <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', fontFamily: 'sans-serif', fontSize: '0.7rem', color: S.text3 }}>
          {index + 1} / {images.length}
        </div>
      </div>

      {/* Velg + kommentar */}
      <div
        style={{ background: S.surface, borderTop: `1px solid ${S.border}`, padding: '12px 16px 20px', flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => img && onToggle(img.id)}
          style={{
            width: '100%', padding: '10px', borderRadius: 8, border: 'none', marginBottom: 12,
            fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
            background: img?.selected ? S.gold : S.surface2,
            color: img?.selected ? '#0C0B09' : S.text,
          }}
        >
          {img?.selected ? t.selectedShort : t.selectThisPhoto}
        </button>

        {img?.comment && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: '14px 14px 2px 14px', background: S.goldBg, border: '1px solid rgba(196,148,52,0.2)' }}>
              <p style={{ fontFamily: 'sans-serif', fontSize: '0.8rem', color: S.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>
                {img.comment}
              </p>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={commentDraft}
            onChange={e => onCommentChange(e.target.value)}
            placeholder={t.writeCommentToPhotographer}
            rows={2}
            style={{ flex: 1, resize: 'none', fontFamily: 'sans-serif', fontSize: '0.85rem', color: S.text, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '8px 10px', outline: 'none' }}
          />
          <button
            onClick={onSaveComment}
            disabled={savingComment || !isDirty}
            style={{
              width: 38, height: 38, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: isDirty ? S.gold : S.surface2,
              color: isDirty ? '#0C0B09' : S.text3,
              cursor: isDirty ? 'pointer' : 'default', fontSize: '1rem',
            }}
          >
            {savingComment ? '…' : '↑'}
          </button>
        </div>
      </div>
    </div>
  )
}
