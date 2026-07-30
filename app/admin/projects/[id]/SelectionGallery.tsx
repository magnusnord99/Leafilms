'use client'

import { useState, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { C } from '@/lib/admin-theme'

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
import {
  createGallery,
  registerUploadedImages,
  removeImage,
  purgeGalleryImages,
  reopenGallery,
  getSelectedFilenames,
  getAdminGallery,
  deleteImageComment,
} from '@/lib/actions/selections'
import type { SelectionGallery as Gallery, SelectionImage } from '@/lib/actions/selections'

type AdminGalleryData = {
  gallery: Gallery
  images: SelectionImage[]
  selectedCount: number
  signedUrls: Record<string, string>
}

type UploadStatus = {
  filename: string
  progress: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

function parsePhotoCount(deliveryPhoto: string | null | undefined): string {
  if (!deliveryPhoto) return ''
  const match = deliveryPhoto.match(/\d+/)
  return match ? match[0] : ''
}

export default function SelectionGallery({
  projectId,
  initialData,
  deliveryPhoto,
}: {
  projectId: string
  initialData: AdminGalleryData | null
  deliveryPhoto?: string | null
}) {
  const [data, setData] = useState<AdminGalleryData | null>(initialData)
  const [creating, setCreating] = useState(false)
  const [targetInput, setTargetInput] = useState(() => parsePhotoCount(deliveryPhoto))
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedPin, setCopiedPin] = useState(false)
  const [copiedFilelist, setCopiedFilelist] = useState(false)
  const [uploads, setUploads] = useState<UploadStatus[]>([])
  const [dragging, setDragging] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [purging, setPurging] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refreshData() {
    const fresh = await getAdminGallery(projectId)
    setData(fresh)
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const target = parseInt(targetInput) || undefined
      await createGallery(projectId, target)
      await refreshData()
    } finally {
      setCreating(false)
      setTargetInput('')
    }
  }

  async function handleFiles(files: File[]) {
    if (!data) return
    const galleryId = data.gallery.id
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (!imageFiles.length) return

    const currentMax = data.images.reduce((m, i) => Math.max(m, i.sort_order), -1)

    setUploads(imageFiles.map(f => ({ filename: f.name, progress: 'pending' })))

    const uploaded: { filename: string; storagePath: string; sortOrder: number }[] = []

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i]
      setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 'uploading' } : u))

      const path = `${galleryId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('selections').upload(path, file, {
        contentType: file.type,
        upsert: false,
      })

      if (error) {
        setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 'error', error: error.message } : u))
      } else {
        setUploads(prev => prev.map((u, idx) => idx === i ? { ...u, progress: 'done' } : u))
        uploaded.push({ filename: file.name, storagePath: path, sortOrder: currentMax + i + 1 })
      }
    }

    if (uploaded.length > 0) {
      await registerUploadedImages(galleryId, uploaded)
      await refreshData()
    }

    setTimeout(() => setUploads([]), 2000)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }

  async function handleRemoveImage(imageId: string) {
    setRemovingId(imageId)
    await removeImage(imageId)
    await refreshData()
    setRemovingId(null)
  }

  async function handleDeleteComment(commentId: string) {
    await deleteImageComment(commentId)
    await refreshData()
  }

  async function handlePurge() {
    if (!data) return
    if (!confirm('Slett alle bildefiler? Valg og filnavn beholdes.')) return
    setPurging(true)
    await purgeGalleryImages(data.gallery.id)
    await refreshData()
    setPurging(false)
  }

  async function handleReopen() {
    if (!data) return
    setReopening(true)
    await reopenGallery(data.gallery.id)
    await refreshData()
    setReopening(false)
  }

  async function handleCopyFilelist() {
    if (!data) return
    const filenames = await getSelectedFilenames(data.gallery.id)
    await navigator.clipboard.writeText(filenames.join('\n'))
    setCopiedFilelist(true)
    setTimeout(() => setCopiedFilelist(false), 2000)
  }

  function copyText(text: string, setCopied: (v: boolean) => void) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const galleryUrl = data
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/s/${data.gallery.token}`
    : ''

  // ---- Ingen galleri enda ----
  if (!data) {
    return (
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 24px',
      }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text, fontWeight: 600, marginBottom: 16 }}>
          Kundeseleksjon
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2, display: 'block', marginBottom: 4 }}>
              Måltall bilder (valgfritt)
            </label>
            <input
              type="number"
              min={1}
              value={targetInput}
              onChange={e => setTargetInput(e.target.value)}
              placeholder="f.eks. 20"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 7,
                background: C.surface2, border: `1px solid ${C.border}`, color: C.text,
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', outline: 'none',
              }}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              padding: '9px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap',
              opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? 'Oppretter...' : 'Opprett galleri'}
          </button>
        </div>
      </div>
    )
  }

  const { gallery, images, selectedCount, signedUrls } = data
  const isPurged = gallery.status === 'purged'
  const isSubmitted = gallery.status === 'submitted'
  const isOver = gallery.target_count != null && selectedCount > gallery.target_count

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header-kort — link, PIN, status */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text }}>
            Kundeseleksjon
          </span>
          <StatusBadge status={gallery.status} />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Galleri-link */}
          <div style={{ flex: 2, minWidth: 180 }}>
            <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, display: 'block', marginBottom: 3 }}>
              Link til kunde
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                readOnly
                value={galleryUrl}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 6, background: C.surface2,
                  border: `1px solid ${C.border}`, color: C.text2, fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.72rem', outline: 'none',
                }}
              />
              <button onClick={() => copyText(galleryUrl, setCopiedLink)} style={copyBtnStyle}>
                {copiedLink ? '✓' : 'Kopier'}
              </button>
            </div>
          </div>

          {/* PIN */}
          <div style={{ minWidth: 120 }}>
            <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, display: 'block', marginBottom: 3 }}>
              PIN
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{
                padding: '7px 12px', borderRadius: 6, background: C.surface2,
                border: `1px solid ${C.border}`, color: C.text,
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 700, letterSpacing: '0.15em',
              }}>
                {gallery.pin_code}
              </div>
              <button onClick={() => copyText(gallery.pin_code, setCopiedPin)} style={copyBtnStyle}>
                {copiedPin ? '✓' : 'Kopier'}
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
          <Stat label="Bilder" value={images.length} />
          <Stat
            label="Valgt"
            value={`${selectedCount}${gallery.target_count ? ` / ${gallery.target_count}` : ''}`}
            highlight={isOver ? 'over' : selectedCount === gallery.target_count ? 'ok' : undefined}
          />
          {gallery.submitted_at && (
            <Stat label="Innsendt" value={new Date(gallery.submitted_at).toLocaleDateString('nb-NO')} />
          )}
        </div>

        {/* Filnavnliste etter innsending */}
        {(isSubmitted || isPurged) && selectedCount > 0 && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <button onClick={handleCopyFilelist} style={{
              padding: '7px 14px', borderRadius: 6, border: `1px solid ${C.border}`,
              background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.75rem', cursor: 'pointer',
            }}>
              {copiedFilelist ? '✓ Kopiert' : 'Kopier filnavnliste (Lightroom)'}
            </button>
          </div>
        )}
      </div>

      {/* Opplasting — ikke vist hvis purged */}
      {!isPurged && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? C.accent : C.border}`,
            borderRadius: 10, padding: '20px', textAlign: 'center', cursor: 'pointer',
            background: dragging ? C.accentBg : 'none', transition: 'background 0.15s, border-color 0.15s',
          }}
        >
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text2 }}>
            Dra bilder hit, eller klikk for å velge
          </p>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 4 }}>
            JPEG, PNG, WEBP — maks 20 MB per fil
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/jpg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)) }}
          />
        </div>
      )}

      {/* Opplastingsstatus */}
      {uploads.length > 0 && (
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {uploads.map((u, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ProgressDot status={u.progress} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.filename}
              </span>
              {u.error && <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.danger }}>{u.error}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Bildevisning */}
      {images.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{
            padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2,
          }}>
            {images.length} bilder
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 4, padding: 8,
          }}>
            {images.map((img, idx) => {
              const url = img.storage_path ? (signedUrls[img.storage_path] ?? '') : ''
              return (
                <div
                  key={img.id}
                  style={{
                    position: 'relative', aspectRatio: '4/3', borderRadius: 5, overflow: 'hidden',
                    cursor: 'pointer', border: `2px solid ${img.selected ? C.accent : 'transparent'}`,
                    transition: 'border-color 0.12s',
                  }}
                  onClick={() => setLightboxIndex(idx)}
                >
                  {url ? (
                    <img src={url} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: C.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: '0.55rem', color: C.text3, padding: 4, textAlign: 'center', wordBreak: 'break-all' }}>{img.filename}</span>
                    </div>
                  )}
                  {img.selected && (
                    <div style={{
                      position: 'absolute', top: 3, right: 3, width: 16, height: 16, borderRadius: '50%',
                      background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                  {img.comments.length > 0 && (
                    <div style={{
                      position: 'absolute', bottom: 2, left: 2, width: 12, height: 12,
                      borderRadius: '50%', background: 'rgba(196,148,52,0.8)', fontSize: '0.5rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000',
                    }}>✎</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Admin-handlinger */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {isSubmitted && !isPurged && (
          <>
            <button onClick={handleReopen} disabled={reopening} style={secondaryBtnStyle}>
              {reopening ? 'Åpner...' : 'Åpne for redigering'}
            </button>
            <button onClick={handlePurge} disabled={purging} style={dangerBtnStyle}>
              {purging ? 'Sletter...' : 'Slett bildefiler'}
            </button>
          </>
        )}
        {!isSubmitted && !isPurged && (
          <button onClick={handlePurge} disabled={purging} style={dangerBtnStyle}>
            {purging ? 'Sletter...' : 'Slett alle bildefiler'}
          </button>
        )}
      </div>

      {/* Admin Lightbox */}
      {lightboxIndex !== null && (
        <AdminLightbox
          images={images}
          signedUrls={signedUrls}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex(i => Math.max((i ?? 1) - 1, 0))}
          onNext={() => setLightboxIndex(i => Math.min((i ?? 0) + 1, images.length - 1))}
          onRemove={handleRemoveImage}
          removingId={removingId}
          onDeleteComment={handleDeleteComment}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hjelpefunksjoner og sub-komponenter
// ---------------------------------------------------------------------------

const copyBtnStyle: React.CSSProperties = {
  padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
  background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)',
  fontSize: '0.72rem', cursor: 'pointer', whiteSpace: 'nowrap',
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 7, border: `1px solid ${C.border}`,
  background: 'none', color: C.text2, fontFamily: 'var(--font-dm-sans)',
  fontSize: '0.75rem', cursor: 'pointer',
}

const dangerBtnStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 7, border: `1px solid ${C.danger}`,
  background: 'none', color: C.danger, fontFamily: 'var(--font-dm-sans)',
  fontSize: '0.75rem', cursor: 'pointer', opacity: 0.8,
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    open:      { label: 'Åpen', color: '#4CAF7D', bg: 'rgba(76,175,125,0.1)' },
    submitted: { label: 'Innsendt', color: C.accent, bg: C.accentBg },
    purged:    { label: 'Slettet', color: C.text3, bg: C.surface2 },
  }
  const s = map[status] ?? map.open
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 20, fontSize: '0.68rem', fontWeight: 600,
      fontFamily: 'var(--font-dm-sans)', color: s.color, background: s.bg,
    }}>
      {s.label}
    </span>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string | number; highlight?: 'over' | 'ok' }) {
  const color = highlight === 'over' ? '#D4863A' : highlight === 'ok' ? '#4CAF7D' : C.text
  return (
    <div>
      <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color }}>{value}</div>
    </div>
  )
}

function ProgressDot({ status }: { status: UploadStatus['progress'] }) {
  const color = status === 'done' ? '#4CAF7D' : status === 'error' ? C.danger : status === 'uploading' ? C.accent : C.text3
  return (
    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
  )
}

function AdminLightbox({
  images, signedUrls, index, onClose, onPrev, onNext, onRemove, removingId, onDeleteComment,
}: {
  images: SelectionImage[]
  signedUrls: Record<string, string>
  index: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onRemove: (id: string) => void
  removingId: string | null
  onDeleteComment: (commentId: string) => void
}) {
  const img = images[index]
  const url = img.storage_path ? (signedUrls[img.storage_path] ?? '') : ''

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div style={{ position: 'relative', maxWidth: '85vw' }} onClick={e => e.stopPropagation()}>
        {url ? (
          <img src={url} alt={img.filename} style={{ maxWidth: '85vw', maxHeight: '80dvh', objectFit: 'contain', borderRadius: 4, display: 'block' }} />
        ) : (
          <div style={{ width: 300, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem' }}>
            Ingen forhåndsvisning
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>{img.filename}</span>
          <button
            onClick={() => onRemove(img.id)}
            disabled={removingId === img.id}
            style={{ ...dangerBtnStyle, padding: '5px 10px', fontSize: '0.68rem' }}
          >
            {removingId === img.id ? '...' : 'Fjern'}
          </button>
        </div>
        {img.comments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {img.comments.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                  💬 {c.author_name ? `${c.author_name}: ${c.text}` : c.text}
                </span>
                <button
                  onClick={() => onDeleteComment(c.id)}
                  title="Slett kommentar"
                  style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: '0.7rem', flexShrink: 0, padding: 0 }}
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {index > 0 && (
        <button onClick={e => { e.stopPropagation(); onPrev() }} style={lbNavStyle('left')}>‹</button>
      )}
      {index < images.length - 1 && (
        <button onClick={e => { e.stopPropagation(); onNext() }} style={lbNavStyle('right')}>›</button>
      )}
      <button onClick={onClose} style={{
        position: 'absolute', top: 12, right: 12, width: 32, height: 32,
        background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%',
        color: '#fff', fontSize: '1rem', cursor: 'pointer',
      }}>×</button>
    </div>
  )
}

function lbNavStyle(side: 'left' | 'right'): React.CSSProperties {
  return {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    [side]: 8, width: 38, height: 38, background: 'rgba(0,0,0,0.5)',
    border: 'none', borderRadius: '50%', color: '#fff', fontSize: '1.2rem',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
