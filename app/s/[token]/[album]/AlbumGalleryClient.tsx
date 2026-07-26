'use client'

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toggleImageSelection, addImageComment } from '@/lib/actions/selections'
import { toggleAlbumImagePick, submitAlbumPicks, addAlbumImagePickComment } from '@/lib/actions/selection-picks'
import type { SelectionAlbum } from '@/lib/actions/selection-albums'
import type { AlbumForCustomer, GalleryVideo } from '@/lib/actions/selections'
import type { AlbumImageWithPick } from '@/lib/actions/selection-picks'
import { SELECTION_STRINGS, type SelectionLanguage, type SelectionStrings } from '../strings'
import { useGridZoom } from '@/hooks/useGridZoom'

const STYLES = `
  .ag-root { display:flex; flex-direction:column; height:100dvh; background:#0C0B09; overflow:hidden; }
  .ag-content { flex:1; display:flex; overflow:hidden; }
  .ag-grid-wrap { flex:1; overflow-y:auto; padding:10px; }
  .ag-grid { display:grid; gap:6px; }
  .ag-zoom-bar { position:sticky; top:0; z-index:5; display:flex; justify-content:flex-end; pointer-events:none; margin-bottom:8px; }
  .ag-zoom { pointer-events:auto; display:flex; align-items:center; gap:8px; background:rgba(19,18,16,0.92); backdrop-filter:blur(4px); border:1px solid #2A2820; border-radius:20px; padding:6px 12px; }
  .ag-zoom-icon { font-family:sans-serif; font-size:0.7rem; color:#8A8070; line-height:1; user-select:none; }
  .ag-zoom-slider { width:96px; accent-color:#C49434; cursor:pointer; }
  .ag-panel { width:280px; flex-shrink:0; border-left:1px solid #2A2820; background:#131210; display:flex; flex-direction:column; }
  .ag-send-desktop { padding:12px 14px; border-top:1px solid #2A2820; }
  .ag-send-mobile { display:none; padding:12px 0 4px; }
  .ag-tabs { display:flex; overflow-x:auto; background:#131210; border-bottom:1px solid #2A2820; flex-shrink:0; scrollbar-width:none; }
  .ag-tabs::-webkit-scrollbar { display:none; }
  .ag-tab { padding:9px 14px; white-space:nowrap; cursor:pointer; font-family:sans-serif; font-size:0.72rem; color:#8A8070; border-bottom:2px solid transparent; transition:color 0.12s,border-color 0.12s; user-select:none; }
  .ag-tab:hover { color:#E8E0D0; }
  .ag-tab.active { color:#C49434; border-bottom-color:#C49434; }
  @media (max-width:680px) {
    .ag-content { flex-direction:column; }
    .ag-panel { width:100%; border-left:none; border-top:1px solid #2A2820; max-height:240px; min-height:80px; }
    .ag-send-desktop { display:none; }
    .ag-send-mobile { display:block; }
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
  videos = [],
  totalSelected: initialTotal,
  targetCount,
  isDirectAlbumLink,
  allAlbums,
  language = 'no',
}: {
  token: string
  galleryToken?: string
  album: SelectionAlbum | AlbumForCustomer
  images: AnyImage[]
  videos?: GalleryVideo[]
  totalSelected?: number
  targetCount?: number | null
  isDirectAlbumLink: boolean
  allAlbums?: { id: string; name: string; slug: string; selectedCount: number; parent_album_id: string | null; coverUrl: string | null }[]
  language?: SelectionLanguage
}) {
  const t = SELECTION_STRINGS[language]
  const router = useRouter()
  const [zoom, setZoom] = useGridZoom()
  const [images, setImages] = useState(initialImages)
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [savingComment, setSavingComment] = useState(false)

  const activeImage = activeImageId ? images.find(i => i.id === activeImageId) ?? null : null

  const localSelected = images.filter(img => isSelected(img, isDirectAlbumLink)).length
  const initialAlbumCount = isDirectAlbumLink ? 0 : initialImages.filter(img => (img as MainImage).selected).length
  const displayTotal = isDirectAlbumLink ? localSelected : ((initialTotal ?? 0) - initialAlbumCount + localSelected)
  const target = isDirectAlbumLink ? (album as SelectionAlbum).album_target_count : (targetCount ?? null)
  const isOver = target != null && displayTotal > target

  // Sync comment draft when active image changes
  const [prevActiveImageId, setPrevActiveImageId] = useState(activeImageId)
  if (prevActiveImageId !== activeImageId) {
    setPrevActiveImageId(activeImageId)
    setCommentDraft(activeImage ? (getComment(activeImage, isDirectAlbumLink) ?? '') : '')
  }

  function nav(dir: number) {
    setLightboxIndex(prev => {
      if (prev === null) return null
      const next = Math.max(0, Math.min(images.length - 1, prev + dir))
      setActiveImageId(images[next].id)
      return next
    })
  }

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

  async function saveComment(imageId: string, text: string) {
    setSavingComment(true)
    const trimmed = text.trim()
    if (isDirectAlbumLink) {
      await addAlbumImagePickComment(token, imageId, trimmed)
      setImages(prev => prev.map(i => {
        if (i.id !== imageId) return i
        const cast = i as AlbumImageWithPick
        return { ...cast, pick: { ...(cast.pick ?? { id: '', album_id: '', image_id: imageId, selected: false, selected_at: null }), comment: trimmed || null } }
      }))
    } else {
      await addImageComment(galleryToken!, imageId, trimmed)
      setImages(prev => prev.map(i =>
        i.id === imageId ? { ...(i as MainImage), comment: trimmed || null } : i
      ))
    }
    setSavingComment(false)
  }

  function openLightbox(idx: number) {
    setLightboxIndex(idx)
    setActiveImageId(images[idx].id)
  }

  async function handleSubmit() {
    setSubmitting(true)
    if (isDirectAlbumLink) await submitAlbumPicks(token)
    setSubmitted(true)
    setShowConfirm(false)
    setSubmitting(false)
  }

  const albumName = 'name' in album ? album.name : ''
  const counterCount = isDirectAlbumLink ? localSelected : displayTotal
  const counterLabel = t.selectedOf(counterCount, target)
  const counterColor = isOver ? S.warning : S.text

  if (submitted && isDirectAlbumLink) {
    return (
      <div style={{ minHeight: '100dvh', background: S.bg }}>
        <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: '13px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase' }}>Leafilms</span>
          <span style={{ fontFamily: 'sans-serif', fontSize: '0.7rem', color: S.green }}>{t.submittedCheck}</span>
        </div>
        <div style={{ maxWidth: 480, margin: '48px auto', padding: '0 16px', textAlign: 'center' }}>
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.95rem', color: S.green, fontWeight: 600 }}>{t.thanksReceived}</p>
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.8rem', color: S.text2, marginTop: 8 }}>
            {t.youSelected(localSelected)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="ag-root">
        {/* Header */}
        <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase' }}>Leafilms</span>
            {isDirectAlbumLink && albumName && (
              <span style={{ fontFamily: 'sans-serif', fontSize: '0.75rem', color: S.text3 }}>· {albumName}</span>
            )}
          </div>
          <span style={{ fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600, color: counterColor }}>{counterLabel}</span>
        </div>

        {/* Album-tabs */}
        {!isDirectAlbumLink && allAlbums && allAlbums.length > 1 && (() => {
          const activeSlug = (album as AlbumForCustomer).slug
          const currentAlbumMeta = allAlbums.find(a => a.slug === activeSlug)
          const currentParentId = currentAlbumMeta?.parent_album_id ?? null
          const siblings = allAlbums.filter(a => a.parent_album_id === currentParentId)
          const children = allAlbums.filter(a => a.parent_album_id === currentAlbumMeta?.id)
          const parentAlbum = currentParentId ? allAlbums.find(a => a.id === currentParentId) : null
          return (
            <div className="ag-tabs">
              {parentAlbum ? (
                <div
                  className="ag-tab"
                  onClick={() => router.push(`/s/${token}/${parentAlbum.slug}`)}
                  style={{ borderRight: `1px solid ${S.border}`, paddingRight: 16 }}
                >
                  ← {parentAlbum.name}
                </div>
              ) : (
                <div
                  className="ag-tab"
                  onClick={() => router.push(`/s/${token}`)}
                  style={{ borderRight: `1px solid ${S.border}`, paddingRight: 16 }}
                >
                  {t.backToOverviewTab}
                </div>
              )}
              {siblings.map(a => {
                const isActive = a.slug === activeSlug
                const count = isActive ? localSelected : a.selectedCount
                return (
                  <div
                    key={a.id}
                    className={`ag-tab${isActive ? ' active' : ''}`}
                    onClick={() => !isActive && router.push(`/s/${token}/${a.slug}`)}
                  >
                    {a.name}
                    {count > 0 && (
                      <span style={{ marginLeft: 5, fontSize: '0.65rem', color: isActive ? S.gold : S.text3 }}>
                        {count}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()}

        <div className="ag-content">
          {/* Grid */}
          <div className="ag-grid-wrap">
            <div className="ag-zoom-bar">
              <div className="ag-zoom">
                <span className="ag-zoom-icon">－</span>
                <input
                  type="range"
                  min={100}
                  max={260}
                  step={10}
                  value={zoom}
                  onChange={e => setZoom(Number(e.target.value))}
                  className="ag-zoom-slider"
                  aria-label={t.zoomLabel}
                />
                <span className="ag-zoom-icon">＋</span>
              </div>
            </div>
            <div className="ag-grid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${zoom}px, 1fr))` }}>
              {!isDirectAlbumLink && allAlbums && (() => {
                const activeSlug = (album as AlbumForCustomer).slug
                const currentAlbumMeta = allAlbums.find(a => a.slug === activeSlug)
                const children = allAlbums.filter(a => a.parent_album_id === currentAlbumMeta?.id)
                return children.length > 0 ? (
                  <div style={{ gridColumn: '1/-1', marginBottom: 8 }}>
                    <p style={{ fontFamily: 'sans-serif', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: S.text3, marginBottom: 6 }}>{t.folders}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
                      {children.map(child => (
                        <div
                          key={child.id}
                          onClick={() => router.push(`/s/${token}/${child.slug}`)}
                          style={{ borderRadius: 7, overflow: 'hidden', cursor: 'pointer', border: `1px solid ${S.border}`, background: S.surface2 }}
                        >
                          <div style={{ aspectRatio: '4/3', background: S.surface, overflow: 'hidden' }}>
                            {child.coverUrl
                              ? <img src={child.coverUrl} alt={child.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: '1.2rem' }}>📁</span>
                                </div>
                            }
                          </div>
                          <div style={{ padding: '5px 7px' }}>
                            <div style={{ fontFamily: 'sans-serif', fontSize: '0.72rem', fontWeight: 600, color: S.text }}>{child.name}</div>
                            {child.selectedCount > 0 && (
                              <div style={{ fontFamily: 'sans-serif', fontSize: '0.62rem', color: S.gold, marginTop: 1 }}>{t.selectedBadge(child.selectedCount)}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              })()}
              {images.map((img, idx) => {
                const sel = isSelected(img, isDirectAlbumLink)
                const comment = getComment(img, isDirectAlbumLink)
                const signedUrl = (img as { signedUrl: string }).signedUrl
                const isActive = activeImageId === img.id
                return (
                  <div
                    key={img.id}
                    onClick={() => setActiveImageId(img.id)}
                    onDoubleClick={() => openLightbox(idx)}
                    style={{
                      borderRadius: 7, overflow: 'hidden', cursor: 'pointer',
                      border: `2px solid ${sel ? S.gold : isActive ? 'rgba(232,224,208,0.35)' : 'transparent'}`,
                      background: S.surface2, transition: 'border-color 0.12s',
                    }}
                  >
                    <div style={{ position: 'relative', aspectRatio: '4/3' }}>
                      {signedUrl
                        ? <img src={signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '0.6rem', color: S.text3, padding: 4, textAlign: 'center' }}>{img.filename}</span>
                          </div>
                      }
                      {comment && (
                        <div style={{ position: 'absolute', top: 4, left: 4, width: 7, height: 7, borderRadius: '50%', background: S.gold }} />
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); openLightbox(idx) }}
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
                        onClick={e => { e.stopPropagation(); handleToggle(img.id) }}
                        style={{
                          width: '100%', padding: '5px', borderRadius: 5, border: 'none',
                          fontFamily: 'sans-serif', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                          background: sel ? S.gold : S.surface,
                          color: sel ? '#0C0B09' : S.text2,
                          transition: 'background 0.12s',
                        }}
                      >
                        {sel ? t.selectedShort : t.select}
                      </button>
                    </div>
                  </div>
                )
              })}
              {videos.map(video => (
                <Link
                  key={video.id}
                  href={`/s/${token}/video/${video.id}`}
                  style={{
                    borderRadius: 7, overflow: 'hidden', textDecoration: 'none',
                    border: '2px solid transparent', background: S.surface2, display: 'block',
                  }}
                >
                  <div style={{ position: 'relative', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(196,148,52,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill={S.gold}><path d="M4 2l10 6-10 6V2z" /></svg>
                    </div>
                    <span style={{ fontFamily: 'sans-serif', fontSize: '0.68rem', color: S.text, padding: '0 8px', textAlign: 'center', wordBreak: 'break-word' }}>{video.title}</span>
                    <span style={{ fontFamily: 'sans-serif', fontSize: '0.62rem', color: video.status === 'submitted' ? S.green : S.text2 }}>
                      {video.status === 'submitted' ? t.submittedBadge : video.comment_count > 0 ? t.commentCount(video.comment_count) : t.videoLabel}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
            <div className="ag-send-mobile">
              <button
                onClick={() => isDirectAlbumLink ? setShowConfirm(true) : router.push(`/s/${galleryToken}/review`)}
                disabled={localSelected === 0}
                style={{
                  width: '100%', padding: '12px', borderRadius: 9, border: 'none',
                  fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600,
                  cursor: localSelected > 0 ? 'pointer' : 'not-allowed',
                  background: localSelected > 0 ? S.gold : S.surface2,
                  color: localSelected > 0 ? '#0C0B09' : S.text3,
                }}
              >
                {isDirectAlbumLink ? t.submitSelection(localSelected) : t.goToReview}
              </button>
            </div>
          </div>

          {/* Kommentarpanel */}
          <div className="ag-panel">
            <CommentPanel
              image={activeImage}
              isDirectAlbumLink={isDirectAlbumLink}
              commentDraft={commentDraft}
              onCommentChange={setCommentDraft}
              onSave={() => activeImage && saveComment(activeImage.id, commentDraft)}
              saving={savingComment}
              t={t}
            />
            <div className="ag-send-desktop">
              <button
                onClick={() => isDirectAlbumLink ? setShowConfirm(true) : router.push(`/s/${galleryToken}/review`)}
                disabled={localSelected === 0}
                style={{
                  width: '100%', padding: '12px', borderRadius: 9, border: 'none',
                  fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600,
                  cursor: localSelected > 0 ? 'pointer' : 'not-allowed',
                  background: localSelected > 0 ? S.gold : S.surface2,
                  color: localSelected > 0 ? '#0C0B09' : S.text3,
                  transition: 'background 0.15s',
                }}
              >
                {isDirectAlbumLink ? t.submitSelection(localSelected) : t.goToReview}
              </button>
            </div>
          </div>
        </div>

        {/* Bekreft-modal */}
        {showConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(12,11,9,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50 }}>
            <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 12, padding: '28px 24px', maxWidth: 360, width: '100%' }}>
              <p style={{ fontFamily: 'sans-serif', fontSize: '1rem', color: S.text, fontWeight: 600, marginBottom: 12 }}>{t.confirmTitle}</p>
              <p style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', color: S.text2, marginBottom: 22 }}>
                {t.confirmBodyAlbum(localSelected)}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowConfirm(false)} style={{ flex: 1, padding: '11px', borderRadius: 8, border: `1px solid ${S.border}`, background: 'none', color: S.text2, fontFamily: 'sans-serif', fontSize: '0.85rem', cursor: 'pointer' }}>{t.cancel}</button>
                <button onClick={handleSubmit} disabled={submitting} style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: S.gold, color: '#0C0B09', fontFamily: 'sans-serif', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? t.sending : t.confirm}
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
          const existingComment = getComment(img, isDirectAlbumLink)
          const isDirty = commentDraft !== (existingComment ?? '')

          return (
            <div
              style={{ position: 'fixed', inset: 0, background: 'rgba(12,11,9,0.97)', display: 'flex', flexDirection: 'column', zIndex: 100 }}
              onClick={() => setLightboxIndex(null)}
            >
              <div
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', padding: '48px 60px 16px', minHeight: 0 }}
                onClick={e => e.stopPropagation()}
              >
                {signedUrl && <img src={signedUrl} alt={img.filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4 }} />}
                {lightboxIndex > 0 && (
                  <button onClick={e => { e.stopPropagation(); nav(-1) }} style={{ position: 'absolute', top: '50%', left: 12, transform: 'translateY(-50%)', width: 44, height: 44, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}>‹</button>
                )}
                {lightboxIndex < images.length - 1 && (
                  <button onClick={e => { e.stopPropagation(); nav(1) }} style={{ position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)', width: 44, height: 44, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}>›</button>
                )}
                <button onClick={() => setLightboxIndex(null)} style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', color: S.text, fontSize: '1rem', cursor: 'pointer' }}>×</button>
                <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', fontFamily: 'sans-serif', fontSize: '0.7rem', color: S.text3 }}>
                  {lightboxIndex + 1} / {images.length}
                </div>
              </div>

              <div
                style={{ background: S.surface, borderTop: `1px solid ${S.border}`, padding: '12px 16px 20px', flexShrink: 0 }}
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => handleToggle(img.id)}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', marginBottom: 12, fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', background: sel ? S.gold : S.surface2, color: sel ? '#0C0B09' : S.text }}
                >
                  {sel ? t.selectedShort : t.selectThisPhoto}
                </button>
                {existingComment && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                    <div style={{ maxWidth: '80%', padding: '8px 12px', borderRadius: '14px 14px 2px 14px', background: S.goldBg, border: '1px solid rgba(196,148,52,0.2)' }}>
                      <p style={{ fontFamily: 'sans-serif', fontSize: '0.8rem', color: S.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>{existingComment}</p>
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea
                    value={commentDraft}
                    onChange={e => setCommentDraft(e.target.value)}
                    placeholder={t.writeCommentToPhotographer}
                    rows={2}
                    style={{ flex: 1, resize: 'none', fontFamily: 'sans-serif', fontSize: '0.85rem', color: S.text, background: S.bg, border: `1px solid ${S.border}`, borderRadius: 10, padding: '8px 10px', outline: 'none' }}
                  />
                  <button
                    onClick={() => saveComment(img.id, commentDraft)}
                    disabled={savingComment || !isDirty}
                    style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', flexShrink: 0, background: isDirty ? S.gold : S.surface2, color: isDirty ? '#0C0B09' : S.text3, cursor: isDirty ? 'pointer' : 'default', fontSize: '1rem' }}
                  >
                    {savingComment ? '…' : '↑'}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------

function CommentPanel({ image, isDirectAlbumLink, commentDraft, onCommentChange, onSave, saving, t }: {
  image: AnyImage | null
  isDirectAlbumLink: boolean
  commentDraft: string
  onCommentChange: (text: string) => void
  onSave: () => void
  saving: boolean
  t: SelectionStrings
}) {
  if (!image) {
    return <div style={{ flex: 1 }} />
  }

  const existingComment = getComment(image, isDirectAlbumLink)
  const isDirty = commentDraft !== (existingComment ?? '')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Bilde-header */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {(image as { signedUrl: string }).signedUrl && (
          <img src={(image as { signedUrl: string }).signedUrl} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
        )}
        <p style={{ fontFamily: 'sans-serif', fontSize: '0.7rem', color: S.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
          {image.filename}
        </p>
      </div>

      {/* Kommentar-visning */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 8 }}>
        {existingComment && (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ maxWidth: '88%', padding: '9px 12px', borderRadius: '14px 14px 2px 14px', background: S.goldBg, border: '1px solid rgba(196,148,52,0.2)' }}>
              <p style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', color: S.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0 }}>
                {existingComment}
              </p>
            </div>
          </div>
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
